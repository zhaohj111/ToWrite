// 设定库侧「关联时间轴」弹窗（设定卡片 ↔ 时间轴文件）。
// 固定宽高左右结构，与添加标签面板一致：编辑区显示阴影遮罩。

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link2, Search, X } from "lucide-react";
import { useAssociationStore } from "@/stores/associationStore";
import { getAllTimelineFiles, getFileRefsForCard, openTimelineFromLoreFile } from "@/lib/associationUtils";

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

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60] bg-scrim/50" onPointerDown={onClose} />
      <div className="fixed left-1/2 top-1/2 z-[70] flex h-[400px] w-[560px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-line/70 bg-app shadow-pop">
        <div className="flex shrink-0 items-center justify-between border-b border-line/50 px-3.5 py-2">
          <span className="text-xs font-semibold tracking-wide text-fg">关联时间轴</span>
          <button
            onClick={onClose}
            title="关闭"
            className="flex h-6 w-6 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* 左侧：已关联，纵向排列、左对齐、右侧截断 */}
          <div className="w-48 shrink-0 overflow-hidden border-r border-line/50">
            <div className="px-3 pb-1 pt-2 text-[11px] font-semibold tracking-[0.14em] text-fg-muted">
              已关联 {linked.length}
            </div>
            <div className="space-y-0.5 px-1.5 pb-2">
              {linked.length === 0 ? (
                <div className="px-2 py-2 text-[11px] text-fg-muted">暂无关联</div>
              ) : (
                linked.map((f) => (
                  <div
                    key={f.fileId}
                    className="group flex w-full items-center gap-1.5 overflow-hidden rounded-md px-2 py-1 text-[11px] font-medium text-accent"
                  >
                    <Link2 className="size-3 shrink-0" />
                    <button
                      className="min-w-0 flex-1 truncate text-left"
                      title={`打开「${f.title}」`}
                      onClick={() => openTimelineFromLoreFile(f.fileId)}
                    >
                      {f.instanceName} / {f.title}
                    </button>
                    <button
                      title="移除关联"
                      onClick={() => unlink(f.fileId)}
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-fg-muted hover:bg-hover hover:text-fg"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 右侧：可关联文件，按内容自适应 */}
          <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-hidden p-2.5">
            <div className="relative shrink-0">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-fg-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索时间轴文件…"
                className="h-7 w-full rounded-md border border-line/70 !bg-app pl-6 pr-1.5 text-[11px] text-fg outline-none placeholder:text-fg-muted/50 focus:!bg-app focus:border-accent/40"
              />
            </div>
            <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
              {visible.length === 0 ? (
                <div className="px-2 py-4 text-center text-xs text-fg-muted">
                  {timelineFiles.length === 0 ? "暂无启用的时间轴实例/文件" : "没有更多可关联的时间轴文件"}
                </div>
              ) : (
                visible.map((f) => (
                  <button
                    key={f.fileId}
                    onClick={() => link(f.fileId)}
                    className="flex w-full items-center gap-2 overflow-hidden rounded-md px-2 py-1.5 text-left text-xs text-fg transition-colors hover:bg-hover"
                  >
                    <Link2 className="size-3.5 shrink-0 text-fg-muted" />
                    <span className="min-w-0 flex-1 truncate">{f.title}</span>
                    <span className="shrink-0 text-[10px] text-fg-muted/60">{f.instanceName}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
