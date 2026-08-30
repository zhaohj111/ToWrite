// 时间轴「关联管理」悬浮面板：展示当前时间轴文件关联的设定卡片，支持添加与删除。
// 样式参考颜色管理面板，置于主区工具栏下方。

import { useMemo, useState } from "react";
import { Link2, Plus, Search, Trash2, X } from "lucide-react";
import { useAssociationStore } from "@/stores/associationStore";
import { getAllLoreCards, getCardRefsForTimelineFile, openLoreFromTimelineCard } from "@/lib/associationUtils";
import { cn } from "@/lib/cn";

export function TimelineAssociationPanel({
  instanceId,
  fileId,
  onClose,
}: {
  instanceId: string;
  fileId: string;
  onClose: () => void;
}) {
  const timelineToLore = useAssociationStore((s) => s.timelineToLore);
  const linked = useMemo(() => getCardRefsForTimelineFile(fileId), [fileId, timelineToLore]);
  const allCards = useMemo(() => getAllLoreCards(), []);
  const [q, setQ] = useState("");

  const linkedIds = new Set(linked.map((c) => c.cardId));
  const qLower = q.trim().toLowerCase();
  const candidates = allCards.filter(
    (c) => !linkedIds.has(c.cardId) && (qLower === "" || c.title.toLowerCase().includes(qLower) || c.instanceName.toLowerCase().includes(qLower)),
  );

  const link = (cardId: string) => {
    if (!allCards.some((c) => c.cardId === cardId)) return;
    useAssociationStore.getState().link(instanceId, fileId, cardId);
  };

  const unlink = (cardId: string) => {
    useAssociationStore.getState().unlink(instanceId, fileId, cardId);
  };

  return (
    <div
      data-overlay
      className="absolute left-1/2 top-2 z-40 flex max-h-[min(480px,80vh)] w-[min(560px,94vw)] -translate-x-1/2 select-none flex-col overflow-hidden rounded-xl border border-line/70 bg-app shadow-pop"
    >
      <div className="flex items-center justify-between border-b border-line/50 px-3.5 py-2">
        <span className="text-xs font-semibold tracking-wide text-fg">关联管理</span>
        <button onClick={onClose} title="关闭" className="flex h-6 w-6 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg">
          <X className="size-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 border-b border-line/50 p-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索设定卡片…"
            className="h-7 w-full rounded-md border border-line/70 bg-app pl-8 pr-2 text-xs text-fg outline-none placeholder:text-fg-muted/50 focus:border-accent/40"
          />
        </div>
        <span className="shrink-0 text-[11px] text-fg-muted">已关联 {linked.length}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {linked.length === 0 && (
          <div className="mb-2 rounded-lg border border-dashed border-line/70 px-3 py-2 text-center text-xs text-fg-muted">
            当前时间轴文件暂无关联设定
          </div>
        )}
        {linked.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {linked.map((c) => (
              <span
                key={c.cardId}
                className="group flex shrink-0 cursor-pointer items-center gap-1 rounded bg-accent-soft px-2 py-1 text-[11px] font-medium text-accent"
                title={c.title}
                onClick={() => openLoreFromTimelineCard(c.cardId)}
              >
                <Link2 className="size-3" />
                {c.instanceName} / {c.title}
                <button
                  title="移除关联"
                  onClick={(e) => {
                    e.stopPropagation();
                    unlink(c.cardId);
                  }}
                  className="flex h-4 w-4 items-center justify-center rounded text-fg-muted hover:bg-hover hover:text-fg"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="mb-1 text-[11px] font-semibold tracking-[0.14em] text-fg-muted">可关联的设定卡片</div>
        <div className="flex flex-col gap-0.5">
          {candidates.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-fg-muted">没有更多可关联的设定卡片</div>
          ) : (
            candidates.map((c) => (
              <button
                key={c.cardId}
                onClick={() => link(c.cardId)}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-fg transition-colors hover:bg-hover"
              >
                <Plus className="size-3.5 shrink-0 text-fg-muted" />
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
                <span className="shrink-0 text-[10px] text-fg-muted/60">{c.instanceName}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
