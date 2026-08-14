// 图片型 PDF 的 DOM 直渲渲染：把章节正文按编辑器本体的渲染效果（字体、颜色、图片、表格、
// 引用、代码块等）直接铺到 A4 页面，逐页截图输出 base64 PNG。
//
// 取代旧版 renderBlocksToPngPages 的纯文本重排版——后者只按画布字体粗排段落，
// 丢失颜色、图片与表格，并非「所见即所得」。这里用 DOMSerializer 把 TipTap 文档
// 序列化为与屏显一致的 DOM，再以 html-to-image 逐页截图。
//
// 排版模型：
//   - 正文区宽度 = 848px（与应用 `.ProseMirror` 的 56rem − 48px 一致，@144dpi），乘 SCALE 放大到输出 dpi；
//   - 页面为 A4 @ IMAGE_PDF_DPI 的画布，正文区水平居中（两侧留白 ≈ 30mm）；
//   - 首页顶部保留小段边缘（10mm），首行文字自此开始；其余页保留与首页一致的上下留白；
//   - 代码块长行改为换行完整显示（应用内为横向滚动，导出不出现滚动条）；
//   - 空文本块补 <br>：还原应用内 ProseMirror 对空段落/空单元格撑起一行行盒的行为；
//   - 旋转图片（data-rotation）先经 canvas 栅格化进位图本身（旋转到物理尺寸），导出 DOM 无 transform；
//   - 每页截图通过给克隆节点加负 marginTop + 固定画布尺寸，滑出该页对应的内容窗口；
//   - 分页按块边界（段落/标题/表格等一级块）贪心装入，页与页连续不重叠，避免从文字中间截断。

import { DOMSerializer, Node, type Schema } from "@tiptap/pm/model";
import { updateColumnsOnResize } from "@tiptap/pm/tables";
import { toPng } from "html-to-image";
import type { ChapterDoc } from "@/types/writeproj";

/** 输出 DPI（对应 Rust export_image_pdf 的 transform.dpi，整页图按同 dpi 嵌入 A4）。
 *  288 = 2×144，接近 300dpi 打印质量；144dpi 下文字明显发虚。 */
export const IMAGE_PDF_DPI = 288;

/** 布局基准 DPI：既有 848px 正文宽等 CSS 尺寸都是按 144dpi 推导的 */
const BASE_DPI = 144;

/** 输出相对布局基准的放大倍数（CSS 尺寸整体放大，文字原生渲染、清晰度随 DPI 线性提升） */
const SCALE = IMAGE_PDF_DPI / BASE_DPI;

/** A4 @ 288dpi：210mm × 288/25.4 ≈ 2382px；297mm × 288/25.4 ≈ 3368px */
const PAGE_W = Math.round((210 / 25.4) * IMAGE_PDF_DPI);
const PAGE_H = Math.round((297 / 25.4) * IMAGE_PDF_DPI);

/** 正文区宽度：与应用 `.ProseMirror` 的 max-width 56rem − 左右 padding 48px 一致（848px @144dpi，乘 SCALE） */
const CONTENT_W = Math.round(848 * SCALE);

/** 上下页边距：正文区在 A4 画布中的垂直内边距（首/末页顶部留白） */
const TOP_M = Math.round((PAGE_W - CONTENT_W) / 2);

/** 首页顶部边缘：保留一小段留白（10mm），比其余页的整页边距更紧凑 */
const FIRST_PAGE_TOP_M = Math.round((10 / 25.4) * IMAGE_PDF_DPI);

/** 纸白主题（styles.css :root）的配色变量：导出容器覆盖 .dark 深色变量，保证白纸墨字 */
const LIGHT_VARS: Record<string, string> = {
  "--color-fg": "#3a3127",
  "--color-fg-muted": "#8c7e6b",
  "--color-fg-strong": "#241e16",
  "--color-accent": "#c8452c",
  "--color-accent-strong": "#d35a3f",
  "--color-accent-soft": "rgba(200, 69, 44, 0.12)",
  "--color-on-accent": "#fff6f0",
  "--color-danger": "#c14a35",
  "--color-info": "#3a7ca5",
  "--color-node-ink": "#2a2016",
  "--color-editor-bg": "#fdf9f0",
  "--color-panel": "#efe7d8",
  "--color-panel-2": "#eae1cf",
  "--color-panel-3": "#e3d8c2",
  "--color-hover": "#ede3d1",
  "--color-active": "#e4d8bf",
  "--color-line": "#e2d6be",
  "--color-line-strong": "#cfc0a2",
  "--color-scrim": "rgba(48, 36, 22, 0.34)",
  "--color-scrollbar": "#cbbda4",
};

export interface PdfPageResult {
  dpi: number;
  pages: string[];
}

/** 等字体与正文图片就绪后再测量（图片未加载时 offsetHeight 不对，分页会错位） */
function waitFontsAndImages(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll("img")).map(
    (img) =>
      new Promise<void>((resolve) => {
        if (img.complete && img.naturalWidth > 0) return resolve();
        img.addEventListener("load", () => resolve(), { once: true });
        img.addEventListener("error", () => resolve(), { once: true });
      }),
  );
  return Promise.all([document.fonts.ready, ...images]).then(() => undefined);
}

/**
 * 把旋转图片（data-rotation ≠ 0）栅格化进位图本身：
 * 用 canvas 把内容按「互换后的内容尺寸」绘制并旋转到物理尺寸，替换 img 的 src，
 * 移除 data-rotation 与 transform——导出的 DOM 里不再有任何 transform 复杂构造，
 * html-to-image 只需渲染它已验证过的普通位图（物理宽高属性即占位尺寸）。
 * 需在 waitFontsAndImages 之后、分页测量之前调用。
 */
async function rasterizeRotatedImages(container: HTMLElement): Promise<void> {
  const imgs = Array.from(
    container.querySelectorAll<HTMLImageElement>("img[data-rotation]"),
  ).filter((img) => (Number(img.getAttribute("data-rotation")) || 0) !== 0);
  await Promise.all(
    imgs.map(async (img) => {
      const rot = Number(img.getAttribute("data-rotation")) || 0;
      const pw = parseFloat(img.style.width); // 物理宽高（已按 SCALE 放大）
      const ph = parseFloat(img.style.height);
      if (pw <= 0 || ph <= 0 || !img.complete || img.naturalWidth <= 0) return;
      // 内容尺寸：垂直旋转互换；180° 不变
      const contentW = rot === 180 ? pw : ph;
      const contentH = rot === 180 ? ph : pw;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(pw);
      canvas.height = Math.round(ph);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      // 绕画布中心旋转后绘制内容（与编辑器内渲染一致的构造）
      ctx.translate(pw / 2, ph / 2);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.drawImage(img, -contentW / 2, -contentH / 2, contentW, contentH);
      // 替换为普通位图：物理尺寸、无旋转标记、无 transform
      img.src = canvas.toDataURL("image/png");
      img.removeAttribute("data-rotation");
      img.style.width = `${canvas.width}px`;
      img.style.height = `${canvas.height}px`;
      img.style.transform = "";
    }),
  );
}

/**
 * 截取一页：把页容器（自带上下页边距）按 A4 画布渲染，容器高度不足一页时画布剩余部分为白底，
 * 超出（超长块溢出）则画布底部裁掉。
 *
 * 注意（html-to-image 1.11 实测）：根节点 position 必须为 static/relative——absolute/fixed 根
 * 在 foreignObject 内渲染为空白。
 */
async function capturePage(container: HTMLElement): Promise<string> {
  const dataUrl = await toPng(container, {
    width: PAGE_W,
    height: PAGE_H,
    pixelRatio: 1, // CSS 已按 SCALE 放大，输出即 A4@288dpi，不随系统 DPR 放大
    backgroundColor: "#ffffff",
    style: {
      position: "static",
      left: "0",
      top: "0",
    },
  });
  return dataUrl.replace(/^data:image\/png;base64,/, "");
}

/** 与线上编辑器 TableView 一致的默认列宽下限（extensions.ts 里 columnResizeFix 的 cellMinWidth） */
const TABLE_CELL_MIN_WIDTH = 25;

/**
 * 让 DOMSerializer 的产物与线上渲染一致。DOMSerializer 只走 schema.toDOM，
 * 不会套用节点视图（node view），因此：
 *   - 表格缺 .tableWrapper 与 <colgroup>（列宽由 colwidth 决定），导致重排后列宽丢失；
 *   - 图片缺 display:block（线上 ResizableImage 的 block 类），行内基线会留出额外空隙。
 * 这里按 PM 文档序配对序列化出的同名节点，逐表补 wrapper + colgroup、逐图补 block。
 */
function enhanceFragment(fragment: DocumentFragment, doc: Node) {
  const tables: Node[] = [];
  doc.descendants((n) => {
    if (n.type.name === "table") tables.push(n);
  });

  const domTables = Array.from(fragment.querySelectorAll("table"));
  for (let i = 0; i < domTables.length; i++) {
    const pmTable = tables[i];
    const domTable = domTables[i];
    if (!pmTable || !domTable) break;
    if (domTable.parentElement?.classList.contains("tableWrapper")) continue;

    const wrapper = document.createElement("div");
    wrapper.className = "tableWrapper";
    wrapper.style.overflow = "visible"; // 导出图里不出现横向滚动条，表格应完整显示
    domTable.replaceWith(wrapper);
    wrapper.appendChild(domTable);

    // 表格的 toDOM 已按 cell.colwidth 生成 colgroup；这里复用而非再插一个。
    // 浏览器允许同一表格挂多个 colgroup，重复插入会把列定义串成两倍列数（如 3 列表变成 6 列
    // 等分、宽度错乱），因此要么复用序列化产物，要么清空重建。
    let colgroup = domTable.querySelector("colgroup");
    if (!colgroup) {
      colgroup = document.createElement("colgroup");
      domTable.insertBefore(colgroup, domTable.firstChild);
    }
    colgroup.innerHTML = "";
    updateColumnsOnResize(pmTable, colgroup, domTable, TABLE_CELL_MIN_WIDTH);

    // 字号随 SCALE 原生放大后，若列宽（px 绝对尺寸）不放大，表格会相对文字缩小一半，
    // 与应用内观感不一致。物化列宽整体 ×SCALE 后再做超宽压回（见下）。
    const cols = Array.from(colgroup.children) as HTMLElement[];
    for (const col of cols) {
      const w = parseFloat(col.style.width);
      if (w > 0) col.style.width = `${Math.round(w * SCALE)}px`;
    }
    const fixedW = parseFloat(domTable.style.width);
    if (fixedW > 0) domTable.style.width = `${Math.round(fixedW * SCALE)}px`;
    const minW = parseFloat(domTable.style.minWidth);
    if (minW > 0) domTable.style.minWidth = `${Math.round(minW * SCALE)}px`;

    // 物化后的列宽总和若超出正文区宽度（用户曾把表格拖得比正文宽），等比缩小到正文区宽度，
    // 否则 .tableWrapper 的 overflow-x 会在导出图里出现滚动条、右侧被裁掉。
    const widths = cols.map((c) => parseFloat(c.style.width) || 0);
    const total = widths.reduce((a, b) => a + b, 0);
    if (total > CONTENT_W && widths.every((w) => w > 0)) {
      const k = CONTENT_W / total;
      let scaled = 0;
      for (let j = 0; j < cols.length; j++) {
        const w = Math.round(widths[j] * k);
        cols[j].style.width = `${w}px`;
        scaled += w;
      }
      domTable.style.width = `${scaled}px`;
    }
  }

  for (const img of Array.from(fragment.querySelectorAll("img"))) {
    img.style.display = "block";
    // 与表格同理：图片宽高是 px 绝对尺寸，随 SCALE 放大才与应用内相对大小一致。
    // 未显式设宽的图片保持原图自然尺寸（浏览器按原图像素渲染）。
    // 旋转图片（data-rotation）不在这里做 transform：等图片加载后由
    // rasterizeRotatedImages 把旋转栅格化进位图本身，避免 html-to-image 对
    // transform 复杂构造的渲染差异（曾导致导出图受旋转前宽高影响而拉伸错位）。
    const w = parseFloat(img.style.width);
    if (w > 0) img.style.width = `${Math.round(w * SCALE)}px`;
    const h = parseFloat(img.style.height);
    if (h > 0) img.style.height = `${Math.round(h * SCALE)}px`;
  }

  // 代码块：应用内长行用横向滚动（.ProseMirror pre overflow-x: auto），导出图改为换行完整显示，
  // 不出现滚动条、长行也不会被画布裁掉（overflow-wrap 兜底超长无空格串）。
  for (const pre of Array.from(fragment.querySelectorAll("pre"))) {
    pre.style.overflow = "visible";
    pre.style.overflowX = "visible";
    pre.style.whiteSpace = "pre-wrap";
    pre.style.overflowWrap = "anywhere";
  }

  // 空文本块补 <br>：应用内 ProseMirror 会给每个空段落/标题/引用补
  // <br class="ProseMirror-trailingBreak"> 撑起一行行盒（表格空单元格的行高即来源于此），
  // DOMSerializer 输出没有它，空块会塌成只剩 margin/padding。这里对无子节点的文本块补 <br> 还原。
  for (const el of Array.from(
    fragment.querySelectorAll("p, h1, h2, h3, h4, h5, h6, blockquote"),
  )) {
    if (el.childNodes.length === 0) el.appendChild(document.createElement("br"));
  }
}

/**
 * 把一章正文按应用内渲染效果导出为图片型 PDF 的各页 PNG base64。
 * @param json 章节 TipTap JSON 文档（ChapterDoc）
 * @param schema 编辑器 schema（与线上编辑器一致，保证节点渲染规则相同）
 * @param opts.fontSize 应用内解析出的正文字号（如 "17px"），缺省用默认 17px
 */
export async function renderDocToPdfPages(
  json: ChapterDoc,
  schema: Schema,
  opts: { fontSize?: string } = {},
): Promise<PdfPageResult> {
  const baseFontPx = parseFloat(opts.fontSize || "17px") || 17;
  const fontSize = `${baseFontPx * SCALE}px`; // 字号随 SCALE 放大，保证原生渲染清晰

  // 离屏宿主：fixed + 负 left 避开滚动区；截图时经 style 覆盖回 (0,0)。
  const host = document.createElement("div");
  host.className = "tw-pdf";
  host.setAttribute(
    "style",
    `position:fixed;top:0;left:-99999px;z-index:-9999;width:${PAGE_W}px;background:#ffffff;`,
  );

  const content = document.createElement("div");
  content.className = "ProseMirror tw-pdf-content";
  content.style.position = "relative";
  content.style.width = `${CONTENT_W}px`;
  content.style.maxWidth = "none";
  content.style.minHeight = "0";
  content.style.margin = "0 auto";
  content.style.padding = `${TOP_M}px 0 ${TOP_M}px`;
  content.style.fontSize = fontSize;
  content.style.color = "#3a3127";
  content.style.caretColor = "#c8452c";
  content.style.setProperty("--editor-font-size", fontSize);
  for (const [name, value] of Object.entries(LIGHT_VARS)) {
    content.style.setProperty(name, value);
  }

  const doc = Node.fromJSON(schema, json);
  const fragment = DOMSerializer.fromSchema(schema).serializeFragment(doc.content) as DocumentFragment;
  enhanceFragment(fragment, doc);
  content.appendChild(fragment);
  host.appendChild(content);
  document.body.appendChild(host);

  try {
    await waitFontsAndImages(content);
    // 旋转图片栅格化进位图（图片就绪后、分页测量前）：移除 transform 构造，普通位图直渲
    await rasterizeRotatedImages(content);
    // 双 rAF：确保字体/图片布局已收敛，offsetHeight 稳定
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(null))),
    );

    const contentRect = content.getBoundingClientRect();
    const blocks = Array.from(content.children)
      .filter((el): el is HTMLElement => el instanceof HTMLElement)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return { el, top: rect.top - contentRect.top, bottom: rect.bottom - contentRect.top };
      });

    // 每页可用内容高 = 页高 − 上下页边距。窗口滑动模型做不到每页独立留白（第二页顶部会顶到
    // 页面边缘，只剩块间 margin），所以分页后逐页构建独立容器，让每页都有与首页一致的上下边距。
    const CONTENT_H = PAGE_H - TOP_M * 2;

    // 贪心分页：同一页装下尽可能多的连续块，页内容高度 = 页首块顶部到末块底部。
    // 首页顶部只保留小段边缘（FIRST_PAGE_TOP_M），比其余页多出 TOP_M − FIRST_PAGE_TOP_M 可用高度；
    // 块间位置差与测量容器的顶部留白无关，直接用差值判断不会错位。
    // 块装不下（超高块）单独一页，允许溢出由画布裁掉。
    const ranges: { start: number; end: number }[] = [];
    {
      let i = 0;
      let page = 0;
      while (i < blocks.length) {
        const usable = page === 0 ? PAGE_H - FIRST_PAGE_TOP_M - TOP_M : CONTENT_H;
        let j = i;
        while (j + 1 < blocks.length && blocks[j + 1].bottom - blocks[i].top <= usable) j++;
        ranges.push({ start: i, end: j + 1 });
        i = j + 1;
        page++;
      }
      if (ranges.length === 0) ranges.push({ start: 0, end: 0 }); // 空章节也输出一页白纸
    }

    // 逐页构建：每页一个独立容器（clone 测量容器的样式与上下页边距），把该页的块移进去。
    // 首页顶部只保留小段边缘（FIRST_PAGE_TOP_M）；其余页保留与测量容器一致的上下边距。
    // 移动不触发图片重载，块按流重排，与测量容器的 padding/margin 折叠行为一致，分页决策依然成立。
    const pageEls = ranges.map(({ start, end }, idx) => {
      const pageEl = content.cloneNode(false) as HTMLElement;
      if (idx === 0) pageEl.style.paddingTop = `${FIRST_PAGE_TOP_M}px`;
      for (let k = start; k < end; k++) pageEl.appendChild(blocks[k].el);
      host.appendChild(pageEl);
      return pageEl;
    });
    host.removeChild(content); // 测量容器已完成使命，块都已移入各页容器

    // 移动后一帧让页容器布局收敛（块尺寸不变，仅位置重排）
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    const pages: string[] = [];
    for (const el of pageEls) {
      pages.push(await capturePage(el));
    }
    return { dpi: IMAGE_PDF_DPI, pages };
  } finally {
    host.remove();
  }
}
