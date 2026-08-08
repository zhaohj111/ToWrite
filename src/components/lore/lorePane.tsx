// 设定库主视图（core.lore 编辑区）：
// 头部搜索（按设定名 / 内容）+ 标签筛选 chips；主体 = 力导向图 / 网格双布局。
// 持有卡片编辑器 Dialog；删除直接执行（可撤销，无需确认）；
// 撤销/重做/布局切换由宿主工具栏驱动（见 mainArea）。

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useLoreStore } from "@/stores/loreStore";
import { EMPTY_LORE_UI_SLICE, useLoreUiStore } from "@/stores/loreUiStore";
import { useInstanceId, useLoreSlice } from "@/components/editor/editorInstanceContext";
import { LoreGraphRoot } from "@/components/lore/loreGraph";
import { LoreGrid } from "@/components/lore/loreGrid";
import { LoreCardEditor } from "@/components/lore/loreCardEditor";
import { cn } from "@/lib/cn";

export function LorePane() {
  const instanceId = useInstanceId();
  const slice = useLoreSlice();
  const fileId = slice.currentFileId;
  const tags = slice.tags;
  // 视图状态缺省回退 graph（未初始化时保证展示与工具栏切换严格一致）
  const view = useLoreUiStore((s) => s.slices[instanceId]?.view) ?? EMPTY_LORE_UI_SLICE.view;
  const setQuery = useLoreUiStore((s) => s.setQuery);
  const toggleTagFilter = useLoreUiStore((s) => s.toggleTagFilter);
  const clearTagFilter = useLoreUiStore((s) => s.clearTagFilter);
  const openCard = useLoreUiStore((s) => s.openCard);
  const closeCard = useLoreUiStore((s) => s.closeCard);
  const deleteCard = useLoreStore((s) => s.deleteCard);
  const addCard = useLoreStore((s) => s.addCard);

  const [searchDraft, setSearchDraft] = useState(view?.query ?? "");
  const [tagSearch, setTagSearch] = useState("");

  // —— 标签筛选 chips：左键拖动横向滚动（隐藏滚动条，多标签时可拖动）——
  const chipsScrollRef = useRef<HTMLDivElement>(null);
  const chipsDragRef = useRef<{ startClientX: number; startLeft: number; moved: boolean } | null>(null);
  const suppressChipClickRef = useRef(false);

  const startChipsDrag = (e: React.PointerEvent) => {
    if (e.button !== 0 || e.pointerType !== "mouse") return;
    if ((e.target as HTMLElement).closest("input")) return;
    suppressChipClickRef.current = false;
    const el = chipsScrollRef.current;
    chipsDragRef.current = { startClientX: e.clientX, startLeft: el?.scrollLeft ?? 0, moved: false };
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = chipsDragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startClientX;
      if (!d.moved && Math.abs(dx) < 4) return;
      d.moved = true;
      const el = chipsScrollRef.current;
      if (el) el.scrollLeft = d.startLeft - dx;
    };
    const onUp = () => {
      const d = chipsDragRef.current;
      if (d && d.moved) suppressChipClickRef.current = true;
      chipsDragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const onClearFilter = () => {
    if (suppressChipClickRef.current) {
      suppressChipClickRef.current = false;
      return;
    }
    clearTagFilter(instanceId);
  };
  const onToggleFilter = (tagId: string) => {
    if (suppressChipClickRef.current) {
      suppressChipClickRef.current = false;
      return;
    }
    toggleTagFilter(instanceId, tagId);
  };

  // 撤销/重做（视图历史）改变 query 时同步搜索框
  useEffect(() => {
    setSearchDraft(view?.query ?? "");
  }, [view?.query]);

  // 无文件时自动创建一个默认设定库文件（删除全部文件后仍可继续工作）
  useEffect(() => {
    if (!fileId) useLoreStore.getState().ensureFile(instanceId);
  }, [instanceId, fileId]);

  // 搜索/标签筛选激活时结果按网格展示；布局为网格时也走网格
  const activeTags = view?.activeTags ?? [];
  const showGrid =
    view?.layout === "grid" ||
    (view?.query ?? "").trim() !== "" ||
    activeTags.length > 0;

  // 标签搜索：收窄候选 chips，但始终保留已选中的筛选标签
  const qTag = tagSearch.trim().toLowerCase();
  const visibleTags = qTag
    ? tags.filter((t) => activeTags.includes(t.id) || t.name.toLowerCase().includes(qTag))
    : tags;

  const editingId = view?.editingId ?? null;
  const editingCard =
    fileId && editingId ? slice.docs[fileId]?.cards.find((c) => c.id === editingId) : undefined;

  const commitSearch = () => setQuery(instanceId, searchDraft);

  const handleNew = () => {
    const card = fileId ? addCard(instanceId, fileId) : null;
    if (card) openCard(instanceId, card.id);
  };

  /** 直接删除（进撤销栈，无需确认） */
  const deleteCards = (ids: string[]) => {
    if (!fileId) return;
    for (const id of ids) deleteCard(instanceId, fileId, id);
    if (editingId && ids.includes(editingId)) closeCard(instanceId);
  };

  return (
    <div className="flex h-full flex-col">
      {/* 面板头部：搜索 */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line/60 bg-app px-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-muted" />
          <input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitSearch();
              if (e.key === "Escape") {
                setSearchDraft("");
                setQuery(instanceId, "");
              }
            }}
            onBlur={commitSearch}
            placeholder="按设定名 / 内容搜索…"
            className="h-7 w-full rounded-md border border-line/70 !bg-app pl-8 pr-8 text-xs text-fg outline-none placeholder:text-fg-muted/50 focus:!bg-app focus:border-accent/40"
          />
          {(searchDraft || view?.query) && (
            <button
              title="清空搜索"
              onClick={() => {
                setSearchDraft("");
                setQuery(instanceId, "");
              }}
              className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 标签筛选 chips：追加式多选；列表隐藏滚动条可左键拖动；搜索框固定在右侧独占区域 */}
      {tags.length > 0 && (
        <div className="flex h-10 shrink-0 items-stretch border-b border-line/60 bg-app">
          <div
            ref={chipsScrollRef}
            onPointerDown={startChipsDrag}
            className="hidden-scrollbar flex min-w-0 flex-1 cursor-grab items-center gap-1 overflow-x-auto px-3 active:cursor-grabbing"
          >
            <button
              onClick={onClearFilter}
              title="清空标签筛选"
              className={cn(
                "shrink-0 rounded px-2 py-0.5 text-[11px] transition-colors",
                activeTags.length === 0
                  ? "bg-accent text-white"
                  : "bg-panel-3 text-fg-muted hover:bg-hover hover:text-fg",
              )}
            >
              全部
            </button>
            {visibleTags.map((t) => {
              const active = activeTags.includes(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => onToggleFilter(t.id)}
                  className={cn(
                    "shrink-0 rounded px-2 py-0.5 text-[11px] transition-colors",
                    active ? "text-white" : "text-fg-muted hover:bg-hover hover:text-fg",
                  )}
                  style={
                    active ? { background: t.color } : { background: t.color + "26", color: t.color }
                  }
                >
                  {t.name}
                </button>
              );
            })}
          </div>
          {/* 标签搜索：固定右侧独占区域，底色与主搜索框一致 */}
          <div className="flex shrink-0 items-center border-l border-line/50 bg-app px-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-fg-muted" />
              <input
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
                placeholder="搜索标签添加筛选…"
                className="h-7 w-40 rounded-md border border-line/70 !bg-app pl-6 pr-1.5 text-[11px] text-fg outline-none placeholder:text-fg-muted/50 focus:!bg-app focus:border-accent/40"
              />
            </div>
          </div>
        </div>
      )}

      {/* 主体 */}
      <div className="min-h-0 flex-1">
        {showGrid || !fileId ? (
          <LoreGrid
            onNew={handleNew}
            onEdit={(c) => openCard(instanceId, c.id)}
            onDelete={(c) => deleteCards([c.id])}
          />
        ) : (
          <LoreGraphRoot
            onDeleteCard={(c) => deleteCards([c.id])}
            onDeleteCards={(cards) => deleteCards(cards.map((c) => c.id))}
          />
        )}
      </div>

      {/* 卡片编辑器 */}
      {editingCard && fileId && (
        <LoreCardEditor
          key={editingCard.id}
          fileId={fileId}
          cardId={editingCard.id}
          onClose={() => closeCard(instanceId)}
        />
      )}
    </div>
  );
}
