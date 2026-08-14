// 导入统一入口：按扩展名分派到各解析器，返回「文本 or 章节文档」。
// 编辑器导入与「导入为工程」共用。

import type { ChapterDoc } from "@/types/writeproj";
import { textToDoc, markdownToDoc, htmlToDoc } from "./docText";
import { pdfToText } from "./pdfImport";
import { docxToHtml, docToText } from "./docxImport";
import { epubToText } from "./epubImport";

export type ImportKind = "text" | "doc";
export interface ParsedImport {
  kind: ImportKind;
  /** kind=text 时有效：纯文本，由调用方决定如何转文档。 */
  text?: string;
  /** kind=doc 时有效：已转好的章节文档。 */
  doc?: unknown;
  /** 原始文件名（用于章节命名）。 */
  name: string;
}

/**
 * 解析一个已读取 base64 的导入文件。
 * @param name 文件名（用于错误提示与章节命名）
 * @param base64 文件二进制（UTF-8 文本类也可直接用文本）
 * @param ext 小写扩展名（不带点），如 "pdf" / "md" / "docx" / "epub"
 */
export async function parseImport(name: string, base64: string, ext: string): Promise<ParsedImport> {
  switch (ext) {
    case "txt":
      return { kind: "doc", doc: textToDoc(base64), name };
    case "md":
      return { kind: "doc", doc: markdownToDoc(base64), name };
    case "pdf":
      return { kind: "text", text: await pdfToText(base64), name };
    case "docx":
      return { kind: "doc", doc: htmlToDoc(await docxToHtml(base64)), name };
    case "doc":
      return { kind: "text", text: await docToText(base64), name };
    case "epub":
      return { kind: "text", text: await epubToText(base64), name };
    default:
      throw new Error(`不支持的导入格式：.${ext}`);
  }
}

/** 把 ParsedImport 规整为统一的章节文档（text 走 textToDoc）。 */
export function importToDoc(parsed: ParsedImport): ChapterDoc {
  if (parsed.kind === "doc" && parsed.doc) return parsed.doc as ChapterDoc;
  return textToDoc(parsed.text ?? "");
}

/** 规整为纯文本（TXT 类导出、检索等）。 */
export function importToText(parsed: ParsedImport): string {
  if (parsed.kind === "doc" && parsed.doc) {
    const top = (parsed.doc as { content?: { type?: string; text?: string; content?: unknown[] }[] })?.content ?? [];
    return top
      .map((n) => (n.type === "text" ? (n.text ?? "") : n.type === "paragraph" || n.type === "heading" ? (n.content ?? []).map((c) => (c as { text?: string }).text ?? "").join("") : ""))
      .join("\n");
  }
  return parsed.text ?? "";
}
