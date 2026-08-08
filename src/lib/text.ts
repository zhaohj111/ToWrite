// 文本统计工具：从 TipTap JSON 文档提取纯文本并计算字数。

import type { ChapterDoc } from "@/types/writeproj";

const CJK_RE = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/g;

/** 从 TipTap JSON 递归提取纯文本 */
export function extractTextFromDoc(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  const node = doc as { type?: string; text?: string; content?: unknown[] };
  if (typeof node.text === "string") return node.text;
  if (Array.isArray(node.content)) {
    return node.content.map((child) => extractTextFromDoc(child)).join("");
  }
  return "";
}

/**
 * 中文字符按 1 计，连续西文按单词计。
 * 与网文平台的“字数”口径接近。
 */
export function countWords(text: string): number {
  const cjk = (text.match(CJK_RE) ?? []).length;
  const latinPart = text
    .replace(CJK_RE, " ")
    .replace(/[\s　]+/g, " ")
    .trim();
  const latinWords = latinPart.length > 0 ? latinPart.split(" ").filter(Boolean).length : 0;
  return cjk + latinWords;
}

export function countDocWords(doc?: ChapterDoc | null): number {
  if (!doc) return 0;
  return countWords(extractTextFromDoc(doc));
}
