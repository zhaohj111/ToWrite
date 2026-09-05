// 设定库网格（core.lore 网格布局）：搜索 / 标签筛选结果的卡片网格。
// 卡片：标题、分类、标签（点击快捷搜索）、正文摘要、备注；
// 操作：关联时间轴、在导向图中显示、编辑、删除。

import { useMemo } from "react";
import { BookMarked, Link2, Pencil, Plus, Share2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLoreStore } from "@/stores/loreStore";
import { useLoreUiStore } from "@/stores/loreUiStore";
import { useInstanceId, useLoreSlice } from "@/components/editor/editorInstanceContext";
import { extractTextFromDoc } from "@/lib/text";
import type { LoreEntry } from "@/types/writeproj";

export function LoreGrid({
  onNew,
  onEdit,
  onDelete,
  onAssociate,
}: {
  onNew: () => void;
  onEdit: (card: LoreEntry) => void;
  onDelete: (card: LoreEntry) => void;
  onAssociate: (card: LoreEntry) => void;
}) {
  const instanceId = useInstanceId();
  const slice = useLoreSlice();
  const fileId = slice.currentFileId;
  const doc = fileId ? slice.docs[fileId] : undefined;
  const cards = doc?.cards ?? [];
  const tags = slice.tags;
  const view = useLoreUiStore((s) => s.slices[instanceId]?.view);
  const toggleTagFilter = useLoreUiStore((s) => s.toggleTagFilter);
  const showInGraph = useLoreUiStore((s) => s.showInGraph);

  const query = (view?.query ?? "").trim().toLowerCase();
  // 追加式标签筛选：命中任一标签即入结果
  const activeTags = view?.activeTags ?? [];

  const filtered = useMemo(
    () =>
      cards.filter((c) => {
        if (activeTags.length > 0 && !activeTags.some((t) => c.tags.includes(t))) return false;
        if (!query) return true;
        const title = c.title.toLowerCase().includes(query);
        const content = extractTextFromDoc(c.content).toLowerCase().includes(query);
        const note = (c.note ?? "").toLowerCase().includes(query);
        return title || content || note;
      }),
    [cards, query, activeTags],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-line/60 px-3">
        <span className="text-xs text-fg-muted">
          {filtered.length} 个设定{activeTags.length || query ? "（筛选结果）" : ""}
        </span>
        <Button size="sm" onClick={onNew}>
          <Plus className="size-3.5" /> 新建设定
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-xs text-fg-muted">
          未找到匹配的设定卡片
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div
            className="grid gap-2.5"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
          >
            {filtered.map((c) => {
              const excerpt = extractTextFromDoc(c.content).trim();
              const cardTags = c.tags
                .map((t) => tags.find((x) => x.id === t))
                .filter((t): t is NonNullable<typeof t> => !!t);
              return (
                <div
                  key={c.id}
                  className="group flex h-[184px] flex-col overflow-hidden rounded-xl border border-line bg-app/95 p-3 transition-colors hover:border-accent/30"
                >
                  <div className="flex items-center gap-1.5">
                    <BookMarked className="size-4 shrink-0 text-accent" />
                    <span className="truncate text-sm font-medium text-fg-strong">
                      {c.title || "未命名设定"}
                    </span>
                  </div>

                  <div className="mt-1.5 flex items-center gap-1 overflow-hidden">
                    {cardTags.map((t) => (
                      <button
                        key={t.id}
                        title={
                          activeTags.includes(t.id)
                            ? `「${t.name}」已在筛选中，点击移除`
                            : `按「${t.name}」追加筛选`
                        }
                        onClick={() => toggleTagFilter(instanceId, t.id)}
                        className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] transition-opacity hover:opacity-80"
                        style={{ background: t.color + "26", color: t.color }}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>

                  {excerpt && (
                    <p className="mt-2 line-clamp-2 overflow-hidden text-xs leading-relaxed text-fg-muted">
                      {excerpt}
                    </p>
                  )}
                  {c.note && (
                    <p className="mt-1 truncate text-[10px] text-fg-muted/60">备注：{c.note}</p>
                  )}

                  {/* 按钮固定在右下角 */}
                  <div className="mt-auto flex items-center justify-end gap-1 border-t border-line/50 pt-2">
                    <button
                      title="关联时间轴"
                      onClick={() => onAssociate(c)}
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-panel-3/60 text-fg-muted transition-colors hover:bg-active hover:text-fg"
                    >
                      <Link2 className="size-3.5" />
                    </button>
                    <button
                      title="在导向图中显示"
                      onClick={() => showInGraph(instanceId, c.id)}
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-panel-3/60 text-fg-muted transition-colors hover:bg-active hover:text-fg"
                    >
                      <Share2 className="size-3.5" />
                    </button>
                    <button
                      title="编辑"
                      onClick={() => onEdit(c)}
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-panel-3/60 text-fg-muted transition-colors hover:bg-active hover:text-fg"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      title="删除"
                      onClick={() => onDelete(c)}
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-panel-3/60 text-fg-muted transition-colors hover:bg-danger/15 hover:text-danger"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
