// 设定库侧「关联时间轴」弹窗（设定卡片 ↔ 时间轴文件）。
// 打开时不切换宿主侧栏；点击文件行直接关联。

import { useMemo, useState } from "react";
import { Link2, Search, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAssociationStore } from "@/stores/associationStore";
import { getAllTimelineFiles, getFileRefsForCard, findLoreCard, openTimelineFromLoreFile } from "@/lib/associationUtils";

export function LoreTimelineAssociationDialog({
  loreInstanceId,
  fileId,
  cardId,
  onClose,
}: {
  loreInstanceId: string;
  fileId: string;
  cardId: string;
  onClose: () => void;
}) {
  const association = useAssociationStore();
  const linked = useMemo(() => getFileRefsForCard(cardId), [cardId, association.timelineToLore]);
  const timelineFiles = useMemo(() => getAllTimelineFiles(), []);
  const [search, setSearch] = useState("");

  const linkedIds = new Set(linked.map((f) => f.fileId));
  const q = search.trim().toLowerCase();
  const visible = timelineFiles.filter(
    (f) => !linkedIds.has(f.fileId) && (q === "" || f.title.toLowerCase().includes(q) || f.instanceName.toLowerCase().includes(q)),
  );

  const link = (timelineFileId: string) => {
    if (!timelineFiles.some((f) => f.fileId === timelineFileId)) return;
    if (linkedIds.has(timelineFileId)) return;
    association.link(loreInstanceId, timelineFileId, cardId);
  };

  const unlink = (timelineFileId: string) => {
    association.unlink(loreInstanceId, timelineFileId, cardId);
  };

  return (
    <Dialog open modal={false} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(560px,92vw)] !bg-app">
        <DialogHeader>
          <DialogTitle>关联时间轴</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* 当前已关联列表 */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-[0.14em] text-fg-muted">
                已关联 {linked.length} 条时间轴
              </span>
              {linked.length > 0 && <span className="text-[10px] text-fg-muted/60">点击可跳转，右侧移除</span>}
            </div>
            {linked.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line/70 px-3 py-2 text-xs text-fg-muted">
                暂无关联，可从下方选择时间轴文件。
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {linked.map((f) => (
                  <span
                    key={f.fileId}
                    className="group flex shrink-0 items-center gap-1 rounded px-2 py-1 text-[11px] font-medium cursor-pointer bg-accent-soft text-accent transition-opacity hover:opacity-80"
                    onClick={() => openTimelineFromLoreFile(f.fileId)}
                    title={`打开「${f.title}」`}
                  >
                    <Link2 className="size-3" />
                    {f.instanceName} / {f.title}
                    <button
                      title="移除关联"
                      onClick={(e) => {
                        e.stopPropagation();
                        unlink(f.fileId);
                      }}
                      className="flex h-4 w-4 items-center justify-center rounded text-fg-muted hover:bg-hover hover:text-fg"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 可选文件列表（点击关联） */}
          <div>
            <div className="mb-1.5 text-[11px] font-semibold tracking-[0.14em] text-fg-muted">
              可关联的时间轴文件
            </div>
            <div className="relative mb-1.5">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-fg-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索时间轴文件…"
                className="h-7 w-full rounded-md border border-line/70 !bg-app pl-6 pr-1.5 text-[11px] text-fg outline-none placeholder:text-fg-muted/50 focus:!bg-app focus:border-accent/40"
              />
            </div>
            <div className="max-h-[260px] overflow-y-auto rounded-lg border border-line/70 p-1.5">
              {visible.length === 0 ? (
                <div className="px-2 py-4 text-center text-xs text-fg-muted">
                  {timelineFiles.length === 0 ? "暂无启用的时间轴实例/文件" : "没有更多可关联的时间轴文件"}
                </div>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {visible.map((f) => (
                    <button
                      key={f.fileId}
                      onClick={() => link(f.fileId)}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-fg transition-colors hover:bg-hover"
                    >
                      <Link2 className="size-3.5 shrink-0 text-fg-muted" />
                      <span className="min-w-0 flex-1 truncate">{f.title}</span>
                      <span className="shrink-0 text-[10px] text-fg-muted/60">{f.instanceName}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
