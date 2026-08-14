// 轻量 Markdown 渲染（插件详情 / 更新日志 / 自有设置页 / 更新说明用）：无外部依赖。
// 支持子集：标题（#~####）、段落、**加粗**、*斜体*、`行内代码`、[链接](url)、
// 多级无序/有序列表（缩进逐级嵌套，支持「松散列表」空行分隔与条目续行）、
// > 引用、--- 分隔线、``` 围栏代码块。超出子集的语法按纯文本展示。
// 第三方插件把详情/更新日志写成 .md，用 Vite `?raw` 导入传入即可。

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** 列表条目：text 为条目文本（续行以 \n 连接），children 为更深缩进的嵌套条目 */
type ListItem = {
  text: string;
  depth: number;
  ordered: boolean;
  children: ListItem[];
};

type Block =
  | { t: "heading"; level: number; text: string }
  | { t: "paragraph"; text: string }
  | { t: "list"; items: ListItem[] }
  | { t: "quote"; text: string }
  | { t: "code"; lang: string; code: string }
  | { t: "hr" };

const HEADING_SIZES = ["text-xl", "text-lg", "text-base", "text-[15px]"];

/** 列表行：缩进 + 标记（- / * / 1.）+ 内容 */
const LIST_LINE_RE = /^(\s*)([-*]|\d+\.)\s+(.*)$/;

/**
 * 从 start 行开始解析一段连续列表（含缩进嵌套）为条目树。
 * - 嵌套深度按相对基础缩进的 2 空格一级换算；
 * - 松散列表：条目间空行后若跟更深缩进的列表行，视为同一列表继续（不打断嵌套）；
 * - 比基础缩进更深、且不是列表标记的行，作为最近条目的续行追加。
 * 返回条目树与消费到的下一行下标。
 */
function parseList(lines: string[], start: number): { items: ListItem[]; next: number } {
  const first = LIST_LINE_RE.exec(lines[start]);
  const baseIndent = first?.[1].length ?? 0;
  const root: ListItem[] = [];
  const stack: ListItem[] = [];
  let i = start;
  while (i < lines.length) {
    const raw = lines[i];
    if (raw.trim() === "") {
      // 空行：向后看第一个非空行，若是更深缩进的列表行则跳过空行继续（松散列表）
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j++;
      const peek = LIST_LINE_RE.exec(lines[j] ?? "");
      if (peek && peek[1].length > baseIndent) {
        i++;
        continue;
      }
      break;
    }
    const m = LIST_LINE_RE.exec(raw);
    if (m) {
      const indent = m[1].length;
      const depth = Math.max(0, Math.round((indent - baseIndent) / 2));
      const item: ListItem = {
        text: m[3],
        depth,
        ordered: /^\d+\.$/.test(m[2]),
        children: [],
      };
      // 栈式建树：弹出深度不小于当前项的条目，挂到最近的更浅条目下
      while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop();
      if (stack.length === 0) root.push(item);
      else stack[stack.length - 1].children.push(item);
      stack.push(item);
      i++;
      continue;
    }
    // 非列表行：比基础缩进更深 → 最近条目的续行
    const indent = (raw.match(/^\s*/)?.[0] ?? "").length;
    if (indent > baseIndent && stack.length > 0) {
      stack[stack.length - 1].text += "\n" + raw.trim();
      i++;
      continue;
    }
    break;
  }
  return { items: root, next: i };
}

/** 按空行 / 块标记切分为块 */
function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed === "") {
      i++;
      continue;
    }
    if (trimmed === "---") {
      blocks.push({ t: "hr" });
      i++;
      continue;
    }
    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        code.push(lines[i]);
        i++;
      }
      i++; // 跳过闭合围栏
      blocks.push({ t: "code", lang, code: code.join("\n") });
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (h) {
      blocks.push({ t: "heading", level: h[1].length, text: h[2] });
      i++;
      continue;
    }
    if (trimmed.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quote.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ t: "quote", text: quote.join("\n") });
      continue;
    }
    if (LIST_LINE_RE.test(trimmed)) {
      const { items, next } = parseList(lines, i);
      if (items.length > 0) blocks.push({ t: "list", items });
      i = next;
      continue;
    }
    const para: string[] = [trimmed];
    i++;
    while (i < lines.length) {
      const l = lines[i].trim();
      if (
        l === "" ||
        l.startsWith("#") ||
        l.startsWith(">") ||
        l.startsWith("```") ||
        l === "---" ||
        LIST_LINE_RE.test(l)
      ) {
        break;
      }
      para.push(l);
      i++;
    }
    blocks.push({ t: "paragraph", text: para.join("\n") });
  }
  return blocks;
}

/** 提取文档中的标题（含层级，按出现顺序）：与 Markdown 渲染同走 parseBlocks，供大纲/锚点对齐 */
export function parseHeadings(source: string): { level: number; text: string }[] {
  return parseBlocks(source)
    .filter((b): b is { t: "heading"; level: number; text: string } => b.t === "heading")
    .map(({ level, text }) => ({ level, text }));
}

/** 行内切分：行内代码 / 加粗 / 斜体 / 链接（代码优先，避免内容再被解析） */
function tokenizeInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("`") && tok.endsWith("`") && tok.length > 2) {
      nodes.push(
        <code
          key={k++}
          className="rounded bg-panel-2 px-1 py-0.5 font-mono text-[13px] text-accent"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith("**") && tok.endsWith("**") && tok.length > 4) {
      nodes.push(
        <strong key={k++} className="font-semibold text-fg-strong">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else if (tok.startsWith("*") && tok.endsWith("*") && tok.length > 2) {
      nodes.push(<em key={k++} className="italic">{tok.slice(1, -1)}</em>);
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
      if (link) {
        nodes.push(
          <a
            key={k++}
            href={link[2]}
            target="_blank"
            rel="noreferrer"
            className="text-accent underline underline-offset-2"
          >
            {link[1]}
          </a>,
        );
      } else {
        nodes.push(tok);
      }
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function Inline({ text }: { text: string }) {
  return <>{tokenizeInline(text)}</>;
}

/** 递归渲染列表条目：每条目按自身标记（有序/无序）独立渲染，嵌套子条目挂在条目下方 */
function ListItemView({ item }: { item: ListItem }) {
  const Tag = item.ordered ? "ol" : "ul";
  return (
    <Tag className={cn("space-y-1 pl-5", item.ordered ? "list-decimal" : "list-disc")}>
      <li>
        <Inline text={item.text} />
        {item.children.length > 0 && (
          <div className="mt-1">
            {item.children.map((c, j) => (
              <ListItemView key={j} item={c} />
            ))}
          </div>
        )}
      </li>
    </Tag>
  );
}

export function Markdown({
  source,
  headingId,
}: {
  source: string;
  /** 为标题提供锚点 id（按标题出现顺序回调，用于大纲跳转；缺省不生成 id） */
  headingId?: (heading: { level: number; text: string }, index: number) => string;
}) {
  const blocks = parseBlocks(source);
  let headingIndex = 0;
  return (
    <div className="flex flex-col gap-3 text-[14px] leading-relaxed text-fg">
      {blocks.map((b, i) => {
        switch (b.t) {
          case "heading": {
            const size = HEADING_SIZES[Math.min(Math.max(b.level, 1), 4) - 1];
            const Tag = (["h1", "h2", "h3", "h4"][
              Math.min(Math.max(b.level, 1), 4) - 1
            ] ?? "h4") as "h1" | "h2" | "h3" | "h4";
            const idx = headingIndex++;
            return (
              <Tag
                key={i}
                id={headingId ? headingId(b, idx) : undefined}
                className={cn("font-semibold text-fg-strong", size)}
              >
                <Inline text={b.text} />
              </Tag>
            );
          }
          case "paragraph":
            return (
              <p key={i}>
                <Inline text={b.text} />
              </p>
            );
          case "list":
            return (
              <div key={i} className="space-y-1">
                {b.items.map((it, j) => (
                  <ListItemView key={j} item={it} />
                ))}
              </div>
            );
          case "quote":
            return (
              <blockquote
                key={i}
                className="border-l-2 border-accent/40 pl-3 italic text-fg-muted"
              >
                <Inline text={b.text} />
              </blockquote>
            );
          case "code":
            return (
              <pre
                key={i}
                className="overflow-x-auto rounded-lg border border-line bg-panel-2/60 p-3 font-mono text-[13px] leading-relaxed text-fg"
              >
                <code>{b.code}</code>
              </pre>
            );
          case "hr":
            return <hr key={i} className="border-line" />;
          default:
            return null;
        }
      })}
    </div>
  );
}
