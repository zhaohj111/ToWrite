// 关于 > 支持者名单：展示仓库根目录 Supporter.md 的内容。
// 页面仅在启动检查确认「文件存在」时由设置导航显示（见 updateStore.fetchSupporter）；
// 文件不存在（或尚未完成检查）时该页面不可达。
//
// 展示优化：把「无序列表」渲染为流式标签（flex-wrap，一行自动放多个、间距均匀、自动换行），
// 作者只需每行写一个名字（- 名字），无需用 Tab/空格拉开间距（Markdown 会折叠空白）。
// 其它块（标题/段落）正常渲染；含引用/代码块/表格等复杂语法时回退为通用 Markdown 渲染。

import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { Markdown } from "@/components/ui/markdown";
import { useUpdateStore } from "@/stores/updateStore";

type SupporterBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "chips"; items: string[] }
  | { kind: "text"; text: string };

/**
 * 名字显示长度预算（单位：全角字）：中文/全角 = 1，英文/数字/空格 = 0.5。
 * 即中文最多 10 字，英文最多 20 字符，混合按实际宽度折算；超出截断显示省略号（完整名保留在 title）。
 */
const MAX_NAME_UNITS = 10;

/** 字符宽度（单位：全角字） */
function charWidth(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  if (
    (code >= 0x3000 && code <= 0x303f) || // CJK 标点（含全角空格）
    (code >= 0x3040 && code <= 0x30ff) || // 假名
    (code >= 0x3400 && code <= 0x4dbf) || // CJK 扩展 A
    (code >= 0x4e00 && code <= 0x9fff) || // CJK 统一表意文字
    (code >= 0xac00 && code <= 0xd7af) || // 谚文
    (code >= 0xf900 && code <= 0xfaff) || // CJK 兼容表意文字
    (code >= 0xff00 && code <= 0xffef) // 全角形式
  ) {
    return 1;
  }
  return 0.5;
}

/** 按预算截断名字，超出追加省略号 */
function truncateName(name: string): string {
  let units = 0;
  let out = "";
  for (const ch of name) {
    const w = charWidth(ch);
    if (units + w > MAX_NAME_UNITS) break;
    units += w;
    out += ch;
  }
  return out === name ? name : out + "…";
}

/** 简单语法解析：标题 / 无序列表（→ 标签流）/ 段落；空行分段 */
function parseSupporter(source: string): SupporterBlock[] {
  const out: SupporterBlock[] = [];
  const lines = source.split(/\r?\n/);
  let i = 0;
  let buffer: string[] = [];
  const flushText = () => {
    if (buffer.length > 0) {
      out.push({ kind: "text", text: buffer.join("\n") });
      buffer = [];
    }
  };
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      flushText();
      i++;
      continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      flushText();
      out.push({ kind: "heading", level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    if (bullet) {
      flushText();
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^[-*]\s+(.+)$/.exec(lines[i].trim());
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      out.push({ kind: "chips", items });
      continue;
    }
    buffer.push(line);
    i++;
  }
  flushText();
  return out;
}

export function SupporterListPage() {
  const supporter = useUpdateStore((s) => s.supporter);

  // 含引用/代码块/表格等复杂语法时回退到通用 Markdown 渲染（保证不失真）
  const needsMarkdown = useMemo(
    () => /^\s*(>|```|\|)/m.test(supporter ?? ""),
    [supporter],
  );

  if (supporter == null) {
    return <div className="text-sm text-fg-muted">支持者名单暂不可用</div>;
  }

  if (needsMarkdown) {
    return (
      <div className="w-full">
        <Markdown source={supporter} />
      </div>
    );
  }

  const blocks = parseSupporter(supporter);
  return (
    <div className="w-full">
      <div className="flex flex-col gap-3">
        {blocks.map((b, i) => {
          if (b.kind === "heading") {
            const size =
              b.level <= 1 ? "text-lg" : b.level === 2 ? "text-base" : "text-sm";
            return (
              <h2 key={i} className={cn("font-semibold text-fg-strong", size)}>
                {b.text}
              </h2>
            );
          }
          if (b.kind === "chips") {
            return (
              <div key={i} className="flex flex-wrap gap-4">
                {b.items.map((name, j) => (
                  <span
                    key={j}
                    title={name}
                    className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-line bg-panel-2/60 px-3 py-1 text-xs text-fg transition-colors hover:border-accent/40"
                  >
                    {truncateName(name)}
                  </span>
                ))}
              </div>
            );
          }
          return (
            <p
              key={i}
              className="whitespace-pre-wrap text-[13px] leading-relaxed text-fg-muted"
            >
              {b.text}
            </p>
          );
        })}
      </div>
    </div>
  );
}

export default SupporterListPage;
