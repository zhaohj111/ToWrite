// PNG 导出（截图式）：用 html-to-image 直接把应用内实际渲染的 DOM 序列化为 PNG。
// 与 Canvas 离屏重绘不同，这里截取界面本身——点阵背景、CSS 变换、SVG 边线、主题配色
// 都原样保留，导出图与屏幕所见完全一致（“保存全局图”）。

import { toPng } from "html-to-image";

export interface CapturePngOptions {
  /** 输出超采样倍率（默认 2，2 倍分辨率，长图更清晰） */
  pixelRatio?: number;
  /** 底色：默认取当前主题 --color-app，保证明暗主题下与界面一致 */
  backgroundColor?: string;
}

/** 捕获 DOM 节点为 PNG base64（无 data: 前缀）。
 *  filter 排除 data-overlay 控件（缩放/图例/导出按钮等），只保留图形内容。 */
export async function captureElementToPng(
  el: HTMLElement,
  opts?: CapturePngOptions,
): Promise<string> {
  const bg =
    opts?.backgroundColor ??
    (getComputedStyle(document.documentElement).getPropertyValue("--color-app").trim() ||
      "#ffffff");
  const dataUrl = await toPng(el, {
    cacheBust: true,
    pixelRatio: opts?.pixelRatio ?? 2,
    backgroundColor: bg,
    // 跳过带 data-overlay 的浮层控件，只导出图形主体
    filter: (node: HTMLElement) =>
      !(node instanceof HTMLElement && node.hasAttribute("data-overlay")),
  });
  return dataUrl.replace(/^data:image\/png;base64,/, "");
}
