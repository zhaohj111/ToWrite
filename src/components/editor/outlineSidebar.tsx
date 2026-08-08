// 大纲侧边栏（core.editor 的 outline 变体）：当前章节的标题层级（H1/H2/H3），点击定位到正文对应位置。

import { useMemo } from "react";
import { ListTree } from "lucide-react";
import { useEditorInstance, useEditorSlice } from "@/components/editor/editorInstanceContext";
import { getActiveEditor } from "@/lib/editorBus";
import { cn } from "@/lib/cn";
import type { ChapterDoc } from "@/types/writeproj";

interface OutlineItem {
  text: string;
  level: number;
  /** 正文中该标题文本的起始文档位置（供 setTextSelection 定位） */
  pos: number;
}

/** 递归计算节点在 ProseMirror 文档中的大小（block = 2 + 子内容；text = 长度） */
function nodeSize(node: unknown): number {
  const n = node as { type?: string; text?: string; content?: unknown[] } | null;
  if (!n) return 0;
  if (n.type === "text") return (n.text ?? "").length;
  const content: unknown[] = Array.isArray(n.content) ? n.content : [];
  return 2 + content.reduce<number>((sum, c) => sum + nodeSize(c), 0);
}

function extractText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((n) => {
      const node = n as { type?: string; text?: string; content?: unknown } | null;
      if (node?.type === "text") return node.text ?? "";
      return extractText(node?.content);
    })
    .join("");
}

function collectOutline(doc: ChapterDoc): OutlineItem[] {
  const content = (doc?.content as unknown[] | undefined) ?? [];
  const items: OutlineItem[] = [];
  let cursor = 1; // 顶层第一个节点从文档位置 1 开始
  for (const node of content) {
    const start = cursor;
    cursor += nodeSize(node);
    const n = node as { type?: string; attrs?: { level?: number }; content?: unknown } | null;
    if (n?.type === "heading") {
      const level = n.attrs?.level ?? 1;
      const text = extractText(n.content);
      if (text.trim()) items.push({ text, level, pos: start + 1 });
    }
  }
  return items;
}

export function OutlineSidebar() {
  const instanceId = useEditorInstance();
  const { chapters, contents, currentChapterId: currentId } = useEditorSlice();
  const doc = currentId ? contents[currentId] : undefined;
  const items = useMemo(() => (doc ? collectOutline(doc) : []), [doc]);
  const current = chapters.find((c) => c.id === currentId);

  const jump = (pos: number) => {
    const editor = getActiveEditor(instanceId);
    if (!editor) return;
    editor.chain().setTextSelection(pos).focus().run();
  };

  if (!currentId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-xs text-fg-muted">
        <ListTree className="size-5 opacity-40" />
        打开一个章节即可查看大纲
      </div>
    );
  }

  return (
    <div className="p-2.5">
      <div className="mb-2.5 px-1.5">
        <span className="block truncate font-display text-sm font-semibold text-fg-strong">
          {current?.title ?? "章节"}
        </span>
        <span className="mt-0.5 block text-[11px] text-fg-muted">
          {items.length} 个标题 · 点击跳转
        </span>
      </div>
      {items.length === 0 ? (
        <div className="px-2.5 py-8 text-center text-xs leading-relaxed text-fg-muted">
          本章还没有标题
          <br />
          在正文里用 H1 / H2 / H3 添加
        </div>
      ) : (
        <ul className="space-y-0.5">
          {items.map((it, i) => (
            <li key={i}>
              <button
                onClick={() => jump(it.pos)}
                title={`跳转到「${it.text}」`}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-fg-muted transition-colors hover:bg-hover hover:text-fg",
                  it.level === 1 && "pl-2 font-semibold text-fg",
                  it.level === 2 && "pl-5",
                  it.level >= 3 && "pl-8",
                )}
              >
                <span className="shrink-0 font-mono text-[10px] text-fg-muted/50">
                  H{it.level}
                </span>
                <span className="truncate">{it.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
