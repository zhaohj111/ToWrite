// TipTap JSON（ChapterDoc）↔ 文本/块/Markdown/HTML 转换。
// 供编辑器导入导出、PDF 导出、以及「导入文件为工程」共用。

import type { ChapterDoc } from "@/types/writeproj";
import { getSchema } from "@tiptap/core";
import { MarkdownParser, defaultMarkdownParser } from "@tiptap/pm/markdown";
import type { ParseSpec } from "@tiptap/pm/markdown";
import { editorExtensions } from "../../components/editor/extensions";

interface MDNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: MDNode[];
  content?: MDNode[];
}

function textContent(n: MDNode): string {
  if (n.type === "text") return n.text ?? "";
  return (n.content ?? []).map((c) => textContent(c)).join("");
}

// ---------- 文档 → 纯文本 ----------

/** 文档 → 纯文本（每块一行，空块保留为空行）。 */
export function docToPlainText(doc: unknown): string {
  const top = (doc as { content?: MDNode[] })?.content ?? [];
  return top.map((n) => textContent(n)).join("\n");
}

// ---------- 文档 → Markdown ----------

/** 转义 Markdown 特殊字符（反斜杠优先），避免正文被当作语法。 */
function mdEscape(text: string): string {
  return text.replace(/([\\`*_\[\]])/g, "\\$1");
}

function inlineMd(n: MDNode): string {
  if (n.type === "text") {
    const raw = n.text ?? "";
    let out = mdEscape(raw);
    for (const m of n.marks ?? []) {
      switch (m.type) {
        case "bold":
          out = `**${out}**`;
          break;
        case "italic":
          out = `*${out}*`;
          break;
        case "strike":
          out = `~~${out}~~`;
          break;
        case "code":
          out = `\`${raw.replace(/`/g, "\\`")}\``;
          break;
        case "link": {
          const href = m.attrs?.href ?? "";
          const title = m.attrs?.title ? ` "${m.attrs.title}"` : "";
          out = `[${out}](${href}${title})`;
          break;
        }
        default:
          // textStyle/color 等未知标记：原样输出
          break;
      }
    }
    return out;
  }
  if (n.type === "image") {
    const a = n.attrs ?? {};
    return `![${a.alt ?? ""}](${a.src ?? ""})`;
  }
  if (n.type === "hardBreak") return "\\\n";
  return (n.content ?? []).map(inlineMd).join("");
}

function blockMd(n: MDNode, prefix = ""): string {
  switch (n.type) {
    case "paragraph":
      return prefix + (n.content ?? []).map(inlineMd).join("") + "\n";
    case "heading": {
      const lvl = Math.min(Math.max(Number(n.attrs?.level) || 1, 1), 6);
      return prefix + "#".repeat(lvl) + " " + (n.content ?? []).map(inlineMd).join("") + "\n";
    }
    case "blockquote": {
      const inner = (n.content ?? [])
        .map((c) => blockMd(c))
        .join("")
        .trimEnd();
      return (
        inner
          .split("\n")
          .map((l) => prefix + "> " + l)
          .join("\n") + "\n"
      );
    }
    case "codeBlock": {
      const lang = n.attrs?.language ?? "";
      return prefix + "```" + lang + "\n" + textContent(n) + "\n" + prefix + "```\n";
    }
    case "bulletList":
      return (n.content ?? []).map((li) => listItemMd(li, prefix + "- ")).join("");
    case "orderedList":
      return (n.content ?? []).map((li) => listItemMd(li, prefix + "1. ")).join("");
    case "horizontalRule":
      return prefix + "---\n";
    case "table":
      return tableMd(n);
    case "listItem":
      // 兜底（正常由列表容器处理）
      return prefix + (n.content ?? []).map((c) => blockMd(c)).join("").trimEnd() + "\n";
    default:
      // doc / 未知容器：逐块输出
      return (n.content ?? []).map((c) => blockMd(c)).join("");
  }
}

function listItemMd(li: MDNode, prefix: string): string {
  const children = li.content ?? [];
  const first = children[0];
  let out = "";
  if (first) {
    if (first.type === "paragraph") {
      out += prefix + (first.content ?? []).map(inlineMd).join("") + "\n";
    } else {
      out += prefix + blockMd(first).trimEnd() + "\n";
    }
  }
  // 其余子块（含嵌套列表）：整体缩进 2 格
  for (const c of children.slice(1)) {
    const rendered = blockMd(c);
    out += rendered
      .split("\n")
      .map((l) => (l.length ? `  ${l}` : l))
      .join("\n");
  }
  return out;
}

function tableMd(t: MDNode): string {
  const rows = (t.content ?? []).filter((r) => r.type === "tableRow");
  const cellsOf = (row: MDNode) =>
    (row.content ?? []).filter((c) => c.type === "tableCell" || c.type === "tableHeader");
  if (rows.length === 0) return "";
  const numCols = Math.max(...rows.map((r) => cellsOf(r).length));
  const cellMd = (c: MDNode | undefined) =>
    ((c ? (c.content ?? []) : []).map(inlineMd).join("")).replace(/\|/g, "\\|");
  const rowMd = (r: MDNode) =>
    "| " + Array.from({ length: numCols }, (_, i) => cellMd(cellsOf(r)[i])).join(" | ") + " |";
  const lines = [rowMd(rows[0])];
  lines.push("|" + Array.from({ length: numCols }, () => " --- ").join("|") + "|");
  for (const r of rows.slice(1)) lines.push(rowMd(r));
  return lines.join("\n") + "\n";
}

export function docToMarkdown(doc: unknown): string {
  const top = (doc as { content?: MDNode[] })?.content ?? [];
  return top.map((n) => blockMd(n)).join("");
}

// ---------- 文本 → 文档 ----------

const CJK_RE = /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af\u3000]/;

/** 相邻行合并进同一段落：中文字符相接不加空格，否则以空格分隔。 */
function joinLines(buf: string[]): string {
  let out = "";
  for (const line of buf) {
    const prev = out ? out[out.length - 1] : "";
    const sep = out && !CJK_RE.test(prev) && !CJK_RE.test(line[0]) ? " " : "";
    out += sep + line;
  }
  return out;
}

/** 纯文本 → 章节文档（空行分段，连续非空行合并为一段）。 */
export function textToDoc(text: string): ChapterDoc {
  const content: unknown[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length === 0) return;
    const t = joinLines(buf.map((l) => l.trim()));
    if (t) content.push({ type: "paragraph", content: [{ type: "text", text: t }] });
    buf = [];
  };
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === "") {
      flush();
      continue;
    }
    buf.push(raw);
  }
  flush();
  if (content.length === 0) content.push({ type: "paragraph" });
  return { type: "doc", content };
}

// ---------- HTML → 文档 ----------

function pushElement(el: Element, into: unknown[]) {
  const tag = el.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag)) {
    const level = +tag[1];
    into.push({ type: "heading", attrs: { level }, content: [{ type: "text", text: el.textContent ?? "" }] });
  } else if (tag === "p") {
    const text = (el.textContent ?? "").trim();
    if (text) into.push({ type: "paragraph", content: [{ type: "text", text }] });
  } else if (tag === "blockquote") {
    const inner: unknown[] = [];
    for (const c of Array.from(el.children)) pushElement(c, inner);
    into.push({ type: "blockquote", content: inner });
  } else if (tag === "pre") {
    into.push({ type: "codeBlock", content: [{ type: "text", text: el.textContent ?? "" }] });
  } else if (tag === "ul" || tag === "ol") {
    const items = Array.from(el.children).map((li) => ({
      type: "listItem",
      content: [{ type: "paragraph", content: [{ type: "text", text: li.textContent ?? "" }] }],
    }));
    into.push({ type: tag === "ul" ? "bulletList" : "orderedList", content: items });
  } else if (tag === "hr") {
    into.push({ type: "horizontalRule" });
  } else if (tag === "table") {
    // 表格简化为一整段文本（HTML 导入保语义，不保表格结构）
    const text = (el.textContent ?? "").trim();
    if (text) into.push({ type: "paragraph", content: [{ type: "text", text }] });
  } else {
    // div / section / li 等容器：递归子元素
    for (const c of Array.from(el.children)) pushElement(c, into);
  }
}

/** HTML → 章节文档（mammoth/docx 产物走这里，保留标题语义）。 */
export function htmlToDoc(html: string): ChapterDoc {
  const body = new DOMParser().parseFromString(html, "text/html").body;
  const content: unknown[] = [];
  for (const el of Array.from(body.children)) pushElement(el, content);
  if (content.length === 0) content.push({ type: "paragraph" });
  return { type: "doc", content };
}

// ---------- Markdown → 文档 ----------

let mdParser: MarkdownParser | null = null;

/** 由编辑器扩展集构建 schema，保证节点名与编辑器一致。 */
function getParser(): MarkdownParser {
  if (!mdParser) {
    const schema = getSchema(editorExtensions);
    const tokens: Record<string, ParseSpec> = {
      blockquote: { block: "blockquote" },
      paragraph: { block: "paragraph" },
      list_item: { block: "listItem" },
      bullet_list: { block: "bulletList" },
      ordered_list: { block: "orderedList" },
      heading: { block: "heading", getAttrs: (tok) => ({ level: +tok.tag.slice(1) }) },
      code_block: { block: "codeBlock", noCloseToken: true },
      fence: { block: "codeBlock", getAttrs: (tok) => ({ language: tok.info || "" }), noCloseToken: true },
      hr: { node: "horizontalRule" },
      image: {
        node: "image",
        getAttrs: (tok) => ({ src: tok.attrGet("src") ?? null, alt: tok.attrGet("alt") ?? null, title: tok.attrGet("title") ?? null }),
      },
      hard_break: { node: "hardBreak" },
      text: { block: "text" },
    };
    if (schema.marks.bold) tokens.strong = { mark: "bold" };
    if (schema.marks.italic) tokens.em = { mark: "italic" };
    if (schema.marks.code) tokens.code = { mark: "code" };
    if (schema.marks.strike) tokens.s = { mark: "strike" };
    if (schema.marks.link) {
      tokens.link = { mark: "link", getAttrs: (tok) => ({ href: tok.attrGet("href"), title: tok.attrGet("title") ?? null }) };
    }
    mdParser = new MarkdownParser(schema, defaultMarkdownParser.tokenizer, tokens);
  }
  return mdParser;
}

/** Markdown → 章节文档；解析失败回退纯文本导入。 */
export function markdownToDoc(md: string): ChapterDoc {
  try {
    const node = getParser().parse(md);
    return node.toJSON();
  } catch (e) {
    console.warn("markdown 解析失败，回退文本导入", e);
    return textToDoc(md);
  }
}
