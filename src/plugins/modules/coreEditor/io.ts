// core.editor —— 导入导出 / 图片表格业务（与贡献点注册解耦，见 contribs.tsx / index.tsx）。
import { open, save } from "@tauri-apps/plugin-dialog";
import type { Editor } from "@tiptap/react";
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
import type { PluginContext } from "@/types/plugin";

// ===================== 导入导出辅助 =====================

/** activate 时捕获的插件上下文（宿主服务入口，如结果提示）；未激活时回退全局 notify */
let pluginCtx: PluginContext | null = null;

/** 由模块 activate 注入宿主上下文（index.tsx 调用） */
export function setEditorPluginCtx(ctx: PluginContext | null): void {
  pluginCtx = ctx;
}

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
export async function exportImagePdfFromDoc(title: string, json: ChapterDoc, editor: Editor, path: string) {
  const fontSize = getComputedStyle(editor.view.dom).fontSize || undefined;
  const { dpi, pages } = await renderDocToPdfPages(json, editor.schema, { fontSize });
  await exportImagePdf({ title, dpi, pages }, path);
}

export async function exportCurrentChapter(instanceId: string, kind: ExportKind, editor: Editor) {
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

export async function exportAllChapters(instanceId: string, kind: ExportKind, editor: Editor) {
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
export async function importAsNewChapter(instanceId: string) {
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
export async function importToCurrentChapter(instanceId: string, editor: Editor) {
  // 先快照目标章节：文件对话框/解析期间用户可能已切换到其他章节，
  // 若之后再取 currentChapterId 会把导入内容写进「后来选中」的章节（串章）。
  const id = useEditorStore.getState().getSlice(instanceId).currentChapterId;
  if (!id) return;
  const path = await pickImportFile();
  if (!path) return;
  try {
    const parsed = await readAndParse(path);
    const st = useEditorStore.getState();
    const doc = importToDoc(parsed);
    st.setContent(instanceId, id, doc);
    // 仅当用户仍停留在目标章节时才强制刷新编辑器（已切走时交给载入 effect 按需显示）
    if (st.getSlice(instanceId).currentChapterId === id) {
      editor.commands.setContent(doc);
    }
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

export async function insertImage(editor: Editor) {
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
