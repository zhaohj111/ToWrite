// core.editor —— 重型模块插件：TipTap 章节正文编辑器。
// 冻结 .writeproj 的 chapters/ 文档数据格式（TipTap JSON），并注册首批贡献点。
//
// v0.7.0 新增：
//   - 撤销/重做置左；表格/图片/导入导出按钮
//   - 字体颜色：改为右键选中文本弹出「更换字体颜色」（见 editorPane），工具栏不再占位
//   - 图片插入（选图 → 读为 base64 data URL 插入；可拖拽边缘改大小）
//   - 表格插入（3×3 / 5×3；行列增删等操作移至右键菜单）
//   - 导出：当前章节 / 全部章节 → TXT / Markdown / PDF（图片型，二级菜单）
//   - 导入：Markdown / TXT / PDF / Docx / Doc → 当前章节或新章节
//   - 工具栏显示开关：各分组经 groupId 绑定 core.editor 的 toolbar* 设置，false 时隐藏

import {
  Bold,
  Code,
  Download,
  FileDown,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Table2,
  Undo2,
  Upload,
} from "lucide-react";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { Editor } from "@tiptap/react";
import type { ModuleContract, PluginContext, SettingFieldDef } from "@/types/plugin";
// 内容解耦：详情 / 更新日志为 .md，设置字段为 .json，代码仅做引用关联（同目录独立插件文件夹）
import editorReadme from "./README.md?raw";
import editorChangelog from "./CHANGELOG.md?raw";
import editorSettings from "./settings.json";
import { EditorPane } from "@/components/editor/editorPane";
import { ChapterSidebar } from "@/components/editor/chapterSidebar";
import { useEditorStore } from "@/stores/editorStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { readBinaryFile, readTextFile, writeTextFile, exportImagePdf } from "@/lib/tauri";
import { notify, type NotifyOptions } from "@/lib/notify";
import {
  docToMarkdown,
  docToPlainText,
  importToDoc,
  parseImport,
  renderDocToPdfPages,
  IMAGE_PDF_DPI,
} from "@/lib/fileFormats";
import { emptyChapterDoc, type ChapterDoc } from "@/types/writeproj";

// ===================== 导入导出辅助 =====================

/** activate 时捕获的插件上下文（宿主服务入口，如结果提示）；未激活时回退全局 notify */
let pluginCtx: PluginContext | null = null;

/** 导出结果提示：优先走插件宿主服务（PluginContext.notify），浏览器联调等场景回退全局通知 */
function notifyResult(kind: NotifyOptions["kind"], message: string, detail?: string, filePath?: string) {
  const fn = pluginCtx?.notify ?? notify;
  fn(message, { kind, detail, filePath });
}

/** 提取统一格式的错误文案（系统错误 / 兜底） */
function errorText(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === "string" ? e : "导出失败，请重试。";
}

function projectName(): string {
  return useWorkspaceStore.getState().project?.meta?.name ?? "拓文";
}

function baseName(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? "导入";
  return name.replace(/\.[^.]+$/, "");
}

function currentChapter(instanceId: string) {
  const slice = useEditorStore.getState().getSlice(instanceId);
  const id = slice.currentChapterId;
  if (!id) return null;
  return {
    id,
    meta: slice.chapters.find((c) => c.id === id),
    doc: slice.contents[id] ?? emptyChapterDoc(),
  };
}

const FILTER_BY_EXT: Record<string, { name: string; extensions: string[] }> = {
  txt: { name: "文本文件", extensions: ["txt"] },
  md: { name: "Markdown", extensions: ["md"] },
  pdf: { name: "PDF 文档", extensions: ["pdf"] },
};

type ExportKind = "txt" | "md" | "pdf-image";

const KIND_LABEL: Record<ExportKind, string> = {
  txt: "TXT",
  md: "Markdown",
  "pdf-image": "PDF",
};

/** 各导出类型对应的文件扩展名（save 弹窗 defaultPath 与过滤器用） */
const KIND_EXT: Record<ExportKind, "txt" | "md" | "pdf"> = {
  txt: "txt",
  md: "md",
  "pdf-image": "pdf",
};

/** 图片型 PDF：用线上编辑器的 schema 把章节 DOM 直渲成页，保留应用内渲染效果 */
async function exportImagePdfFromDoc(title: string, json: ChapterDoc, editor: Editor, path: string) {
  const fontSize = getComputedStyle(editor.view.dom).fontSize || undefined;
  const { dpi, pages } = await renderDocToPdfPages(json, editor.schema, { fontSize });
  await exportImagePdf({ title, dpi, pages }, path);
}

async function exportCurrentChapter(instanceId: string, kind: ExportKind, editor: Editor) {
  const ch = currentChapter(instanceId);
  if (!ch) return;
  const title = ch.meta?.title ?? "未命名章节";
  const ext = KIND_EXT[kind];
  const path = await save({
    title: `导出当前章节 · ${KIND_LABEL[kind]}`,
    defaultPath: `${title}.${ext}`,
    filters: [FILTER_BY_EXT[ext]],
  });
  if (!path) return;
  try {
    if (kind === "txt") await writeTextFile(path, docToPlainText(ch.doc));
    else if (kind === "md") await writeTextFile(path, docToMarkdown(ch.doc));
    else await exportImagePdfFromDoc(title, ch.doc, editor, path);
    notifyResult("success", `已导出「${title}」（${KIND_LABEL[kind]}）`, path, path);
  } catch (e) {
    console.error("导出当前章节失败", e);
    notifyResult("error", `导出「${title}」（${KIND_LABEL[kind]}）失败`, errorText(e));
  }
}

async function exportAllChapters(instanceId: string, kind: ExportKind, editor: Editor) {
  const slice = useEditorStore.getState().getSlice(instanceId);
  if (slice.chapters.length === 0) return;
  const title = projectName();
  const ext = KIND_EXT[kind];
  const path = await save({
    title: `导出全部章节 · ${KIND_LABEL[kind]}`,
    defaultPath: `${title}.${ext}`,
    filters: [FILTER_BY_EXT[ext]],
  });
  if (!path) return;
  try {
    if (kind === "txt") {
      const text = slice.chapters
        .map((c) => docToPlainText(slice.contents[c.id] ?? emptyChapterDoc()))
        .join("\n\n");
      await writeTextFile(path, text);
    } else if (kind === "md") {
      const md = slice.chapters
        .map((c) => docToMarkdown(slice.contents[c.id] ?? emptyChapterDoc()))
        .join("\n\n");
      await writeTextFile(path, md);
    } else {
      // 图片型：每章各自按 DOM 直渲分页，再按顺序拼接（各章从新页开始）
      const fontSize = getComputedStyle(editor.view.dom).fontSize || undefined;
      let dpi = IMAGE_PDF_DPI;
      const pages: string[] = [];
      for (const c of slice.chapters) {
        const rendered = await renderDocToPdfPages(slice.contents[c.id] ?? emptyChapterDoc(), editor.schema, { fontSize });
        dpi = rendered.dpi;
        pages.push(...rendered.pages);
      }
      await exportImagePdf({ title, dpi, pages }, path);
    }
    notifyResult(
      "success",
      `已导出全部章节（${slice.chapters.length} 章 · ${KIND_LABEL[kind]}）`,
      path,
      path,
    );
  } catch (e) {
    console.error("导出全部章节失败", e);
    notifyResult("error", `导出全部章节（${KIND_LABEL[kind]}）失败`, errorText(e));
  }
}

const IMPORT_FILTERS = [
  { name: "支持的文档", extensions: ["md", "txt", "pdf", "docx", "doc"] },
  { name: "Markdown", extensions: ["md"] },
  { name: "纯文本", extensions: ["txt"] },
  { name: "PDF", extensions: ["pdf"] },
  { name: "Word 文档", extensions: ["docx", "doc"] },
];

async function pickImportFile(): Promise<string | null> {
  const path = await open({ multiple: false, directory: false, filters: IMPORT_FILTERS });
  return typeof path === "string" ? path : null;
}

/** 读取并解析导入文件：文本类（md/txt）走 readTextFile，二进制类走 base64 */
async function readAndParse(path: string) {
  const ext = (path.split(".").pop() ?? "").toLowerCase();
  const isText = ext === "md" || ext === "txt";
  const content = isText ? await readTextFile(path) : await readBinaryFile(path);
  return parseImport(baseName(path), content, ext);
}

/** 导入为新章节（文件名作章节名；addChapter 自动切换到新章） */
async function importAsNewChapter(instanceId: string) {
  const path = await pickImportFile();
  if (!path) return;
  try {
    const parsed = await readAndParse(path);
    const st = useEditorStore.getState();
    const ch = st.addChapter(instanceId, baseName(path));
    st.setContent(instanceId, ch.id, importToDoc(parsed));
  } catch (e) {
    console.error("导入新章节失败", e);
    window.alert(e instanceof Error ? e.message : "导入失败，请重试。");
  }
}

/** 导入并替换当前章节内容（store 变更不会自动触发编辑器重载，需手动 setContent） */
async function importToCurrentChapter(instanceId: string, editor: Editor) {
  const path = await pickImportFile();
  if (!path) return;
  try {
    const parsed = await readAndParse(path);
    const st = useEditorStore.getState();
    const id = st.getSlice(instanceId).currentChapterId;
    if (!id) return;
    const doc = importToDoc(parsed);
    st.setContent(instanceId, id, doc);
    editor.commands.setContent(doc);
  } catch (e) {
    console.error("导入当前章节失败", e);
    window.alert(e instanceof Error ? e.message : "导入失败，请重试。");
  }
}

// ===================== 图片 / 表格 =====================

function mimeForExt(ext: string): string {
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    ico: "image/x-icon",
  };
  return map[ext] ?? "application/octet-stream";
}

async function insertImage(editor: Editor) {
  const path = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"] }],
  });
  if (typeof path !== "string") return;
  try {
    const base64 = await readBinaryFile(path);
    const ext = (path.split(".").pop() ?? "").toLowerCase();
    editor.chain().focus().setImage({ src: `data:${mimeForExt(ext)};base64,${base64}` }).run();
  } catch (e) {
    console.error("插入图片失败", e);
    window.alert(e instanceof Error ? e.message : "插入图片失败，请重试。");
  }
}

export const coreEditorModule: ModuleContract = {
  id: "core.editor",
  name: "编辑器",
  description: "官方重型模块：章节正文编辑，冻结 chapters/ 的 TipTap JSON 格式。",
  readme: editorReadme,
  changelogMd: editorChangelog,
  kind: "heavy",
  enabled: true,
  author: "拓文官方",
  version: "0.7.0",
  // 设置字段声明与出厂默认（级联第 ③ 层）在 settings.json
  settings: editorSettings as unknown as Record<string, SettingFieldDef>,
  views: {
    activityBar: { id: "editor", label: "正文", icon: FileText },
    // 侧栏仅保留「章节」变体；大纲已并入章节侧栏（章节树 / 大纲 视图切换，功能保留）
    sidebars: [{ id: "chapters", title: "章节", component: ChapterSidebar }],
    mainView: { id: "editor", title: "正文", component: EditorPane },
  },
  activate: (ctx) => {
    // 捕获插件上下文：导出等操作经宿主服务（notify）弹窗口顶部结果提示
    pluginCtx = ctx;
    // ---- editor.toolbar 贡献点（v0.7：撤销/重做置左） ----
    ctx.registerContribution("editor.toolbar", {
      id: "undo",
      title: "撤销",
      icon: Undo2,
      groupId: "toolbarHistory",
      action: ({ editor }) => editor.chain().focus().undo().run(),
    });
    ctx.registerContribution("editor.toolbar", {
      id: "redo",
      title: "重做",
      icon: Redo2,
      groupId: "toolbarHistory",
      action: ({ editor }) => editor.chain().focus().redo().run(),
    });
    ctx.registerContribution("editor.toolbar", {
      id: "divider-0",
      title: "",
      icon: Bold,
      divider: true,
      action: () => {},
    });
    ctx.registerContribution("editor.toolbar", {
      id: "bold",
      title: "加粗",
      icon: Bold,
      groupId: "toolbarText",
      isActive: ({ editor }) => editor.isActive("bold"),
      action: ({ editor }) => editor.chain().focus().toggleBold().run(),
    });
    ctx.registerContribution("editor.toolbar", {
      id: "italic",
      title: "斜体",
      icon: Italic,
      groupId: "toolbarText",
      isActive: ({ editor }) => editor.isActive("italic"),
      action: ({ editor }) => editor.chain().focus().toggleItalic().run(),
    });
    ctx.registerContribution("editor.toolbar", {
      id: "strike",
      title: "删除线",
      icon: Strikethrough,
      groupId: "toolbarText",
      isActive: ({ editor }) => editor.isActive("strike"),
      action: ({ editor }) => editor.chain().focus().toggleStrike().run(),
    });
    ctx.registerContribution("editor.toolbar", {
      id: "divider-1",
      title: "",
      icon: Bold,
      divider: true,
      action: () => {},
    });
    ctx.registerContribution("editor.toolbar", {
      id: "heading1",
      title: "标题 1",
      icon: Heading1,
      groupId: "toolbarHeading",
      isActive: ({ editor }) => editor.isActive("heading", { level: 1 }),
      action: ({ editor }) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    });
    ctx.registerContribution("editor.toolbar", {
      id: "heading2",
      title: "标题 2",
      icon: Heading2,
      groupId: "toolbarHeading",
      isActive: ({ editor }) => editor.isActive("heading", { level: 2 }),
      action: ({ editor }) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    });
    // v0.8：三级标题
    ctx.registerContribution("editor.toolbar", {
      id: "heading3",
      title: "标题 3",
      icon: Heading3,
      groupId: "toolbarHeading",
      isActive: ({ editor }) => editor.isActive("heading", { level: 3 }),
      action: ({ editor }) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    });
    ctx.registerContribution("editor.toolbar", {
      id: "divider-2",
      title: "",
      icon: Bold,
      divider: true,
      action: () => {},
    });
    ctx.registerContribution("editor.toolbar", {
      id: "bullet-list",
      title: "无序列表",
      icon: List,
      groupId: "toolbarList",
      isActive: ({ editor }) => editor.isActive("bulletList"),
      action: ({ editor }) => editor.chain().focus().toggleBulletList().run(),
    });
    ctx.registerContribution("editor.toolbar", {
      id: "ordered-list",
      title: "有序列表",
      icon: ListOrdered,
      groupId: "toolbarList",
      isActive: ({ editor }) => editor.isActive("orderedList"),
      action: ({ editor }) => editor.chain().focus().toggleOrderedList().run(),
    });
    ctx.registerContribution("editor.toolbar", {
      id: "blockquote",
      title: "引用",
      icon: Quote,
      groupId: "toolbarQuote",
      isActive: ({ editor }) => editor.isActive("blockquote"),
      action: ({ editor }) => editor.chain().focus().toggleBlockquote().run(),
    });
    ctx.registerContribution("editor.toolbar", {
      id: "code-block",
      title: "代码块",
      icon: Code,
      groupId: "toolbarCode",
      isActive: ({ editor }) => editor.isActive("codeBlock"),
      action: ({ editor }) => editor.chain().focus().toggleCodeBlock().run(),
    });
    // ---- v0.7：图片 / 表格 / 导入导出（颜色入口改右键选中文本，见 editorPane） ----
    ctx.registerContribution("editor.toolbar", {
      id: "image",
      title: "插入图片",
      icon: ImagePlus,
      groupId: "toolbarImage",
      action: ({ editor }) => void insertImage(editor),
    });
    ctx.registerContribution("editor.toolbar", {
      id: "table",
      title: "插入表格",
      icon: Table2,
      groupId: "toolbarTable",
      action: ({ editor }) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      // 仅保留两个插入项；行列增删等操作移至右键菜单（见 editorPane 表格/单元格菜单）
      menu: [
        { title: "插入表格 3×3", icon: Table2, run: ({ editor }) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
        { title: "插入表格 5×3", icon: Table2, run: ({ editor }) => editor.chain().focus().insertTable({ rows: 5, cols: 3, withHeaderRow: true }).run() },
      ],
    });
    ctx.registerContribution("editor.toolbar", {
      id: "divider-5",
      title: "",
      icon: Bold,
      divider: true,
      action: () => {},
    });
    ctx.registerContribution("editor.toolbar", {
      id: "export",
      title: "导出",
      icon: Download,
      groupId: "toolbarIO",
      action: ({ editor, instanceId }) => void exportCurrentChapter(instanceId, "txt", editor),
      // 二级菜单：当前章节 / 全部章节 → 各导出格式
      menu: [
        {
          title: "导出当前章节",
          icon: FileText,
          children: [
            { title: "TXT", icon: FileText, run: ({ editor, instanceId }) => void exportCurrentChapter(instanceId, "txt", editor) },
            { title: "Markdown", icon: FileText, run: ({ editor, instanceId }) => void exportCurrentChapter(instanceId, "md", editor) },
            { title: "PDF", icon: FileText, run: ({ editor, instanceId }) => void exportCurrentChapter(instanceId, "pdf-image", editor) },
          ],
        },
        {
          title: "导出全部章节",
          icon: FileDown,
          children: [
            { title: "TXT", icon: FileDown, run: ({ editor, instanceId }) => void exportAllChapters(instanceId, "txt", editor) },
            { title: "Markdown", icon: FileDown, run: ({ editor, instanceId }) => void exportAllChapters(instanceId, "md", editor) },
            { title: "PDF", icon: FileDown, run: ({ editor, instanceId }) => void exportAllChapters(instanceId, "pdf-image", editor) },
          ],
        },
      ],
    });
    ctx.registerContribution("editor.toolbar", {
      id: "import",
      title: "导入",
      icon: Upload,
      groupId: "toolbarIO",
      action: ({ instanceId }) => void importAsNewChapter(instanceId),
      menu: [
        { title: "导入到当前章节…", icon: FileText, run: ({ editor, instanceId }) => void importToCurrentChapter(instanceId, editor) },
        { title: "导入为新章节…", icon: FileDown, run: ({ instanceId }) => void importAsNewChapter(instanceId) },
      ],
    });

    // ---- editor.commands 贡献点 ----
    ctx.registerContribution("editor.commands", {
      id: "clear-format",
      title: "清空格式",
      keywords: ["clear", "格式", "清除"],
      run: ({ editor }) => editor.chain().focus().unsetAllMarks().clearNodes().run(),
    });
    ctx.registerContribution("editor.commands", {
      id: "insert-hr",
      title: "插入分隔线",
      keywords: ["hr", "分割线", "分隔"],
      run: ({ editor }) => editor.chain().focus().setHorizontalRule().run(),
    });

    // ---- editor.hoverActions 贡献点（v0.9 将挂载 AI 润色/扩写等）----
    ctx.registerContribution("editor.hoverActions", {
      id: "quote-selection",
      title: "引用选中",
      icon: Quote,
      run: ({ editor }) => editor.chain().focus().toggleBlockquote().run(),
    });

    // ---- editor.blockTypes 贡献点 ----
    ctx.registerContribution("editor.blockTypes", { name: "paragraph", title: "正文段落" });
    ctx.registerContribution("editor.blockTypes", { name: "heading1", title: "标题 1" });
    ctx.registerContribution("editor.blockTypes", { name: "heading2", title: "标题 2" });
    ctx.registerContribution("editor.blockTypes", { name: "heading3", title: "标题 3" });
    ctx.registerContribution("editor.blockTypes", { name: "blockquote", title: "引用" });
    ctx.registerContribution("editor.blockTypes", { name: "codeBlock", title: "代码块" });

    // ---- i18n.resources / theme 贡献点（骨架）----
    ctx.registerContribution("i18n.resources", {
      locale: "zh-CN",
      resources: { "app.name": "拓文 / ToWrite" },
    });
    ctx.registerContribution("theme", {
      id: "ink",
      name: "墨色（默认）",
      colors: { background: "#0a0c11", foreground: "#e4e2da", accent: "#d7b25c" },
    });
  },
};
