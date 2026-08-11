// 轻量 Markdown 渲染（插件详情 / 更新日志 / 自有设置页用）：无外部依赖。
// 支持子集：标题（#~####）、段落、**加粗**、*斜体*、`行内代码`、[链接](url)、
// 无序/有序列表、> 引用、--- 分隔线、``` 围栏代码块。
// 第三方插件把详情/更新日志写成 .md，用 Vite `?raw` 导入传入即可；超出子集的语法按纯文本展示。

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Block =
  | { t: "heading"; level: number; text: string }
  | { t: "paragraph"; text: string }
  | { t: "ul"; items: string[] }
  | { t: "ol"; items: string[] }
  | { t: "quote"; text: string }
  | { t: "code"; lang: string; code: string }
  | { t: "hr" };

const HEADING_SIZES = ["text-xl", "text-lg", "text-base", "text-[15px]"];

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
    const isOl = /^\d+\.\s+/.test(trimmed);
    if (isOl || /^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      let ol = isOl;
      while (i < lines.length) {
        const l = lines[i].trim();
        if (/^\d+\.\s+/.test(l)) {
          ol = true;
          items.push(l.replace(/^\d+\.\s+/, ""));
          i++;
        } else if (/^[-*]\s+/.test(l)) {
          items.push(l.replace(/^[-*]\s+/, ""));
          i++;
        } else break;
      }
      blocks.push({ t: ol ? "ol" : "ul", items });
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
        /^[-*]\s+/.test(l) ||
        /^\d+\.\s+/.test(l)
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
          case "ul":
            return (
              <ul key={i} className="list-disc space-y-1 pl-5">
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Inline text={it} />
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="list-decimal space-y-1 pl-5">
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Inline text={it} />
                  </li>
                ))}
              </ol>
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
