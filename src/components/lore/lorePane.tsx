// 设定库主视图（core.lore 编辑区）：
// 头部搜索（按设定名 / 内容）+ 标签筛选 chips；主体 = 力导向图 / 网格双布局。
// 持有卡片编辑器 Dialog；删除直接执行（可撤销，无需确认）；
// 撤销/重做/布局切换由宿主工具栏驱动（见 mainArea）。

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useLoreStore } from "@/stores/loreStore";
import { useAssociationStore } from "@/stores/associationStore";
import { EMPTY_LORE_UI_SLICE, useLoreUiStore } from "@/stores/loreUiStore";
import { useInstanceId, useLoreSlice } from "@/components/editor/editorInstanceContext";
import { LoreGraphRoot } from "@/components/lore/loreGraph";
import { LoreGrid } from "@/components/lore/loreGrid";
import { LoreCardEditor } from "@/components/lore/loreCardEditor";
import { LoreTimelineAssociationDialog } from "@/components/lore/LoreTimelineAssociationDialog";
import type { LoreData } from "@/types/writeproj";
import { readTextFile, writeBinaryFile, writeTextFile } from "@/lib/tauri";
import { serializeLore, parseLore } from "@/lib/fileFormats/loreFormat";
import { getAllTimelineFiles } from "@/lib/associationUtils";
import { captureLoreGraph } from "@/lib/loreBus";
import { registerLoreIo } from "@/lib/loreBus";
import { requestLoreRedo, requestLoreUndo } from "@/lib/loreBus";
import { commandMatches, keybindingRegistry } from "@/lib/keybindings";
import { resolveSetting } from "@/stores/settingsStore";
import { LORE_PROTOTYPE } from "@/stores/loreStore";
import { notifyError, notifyInfo, notifySuccess } from "@/lib/notify";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { EmptyStateGuide } from "@/components/ui/quickGuide";
import { loreGuide } from "@/plugins/modules/coreLore/guideData";
import { useWorkspaceStore } from "@/stores/workspaceStore";

export function LorePane() {
  // 空态引导卡按「工程 + 插件」仅弹一次
  const projectId = useWorkspaceStore((s) => s.project?.meta.id ?? "");
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

    const [assocCardId, setAssocCardId] = useState<string | null>(null);
  // —— 标签筛选 chips：左键拖动横向滚动（隐藏滚动条，多标签时可拖动）——
    const [confirmDeleteCards, setConfirmDeleteCards] = useState<string[] | null>(null);
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

  // 切换当前文件：清空文件级视图状态（搜索词/标签筛选/选中/编辑目标保留在上一个文件）。
  // 否则旧文件的筛选会套到新文件上（网格被强制、结果被滤空），表现为「显示的不是目标文件」。
  // 仅在文件真正变化时执行（挂载/主视图切换不重置）。
  const prevFileRef = useRef(fileId);
  useEffect(() => {
    if (prevFileRef.current === fileId) return;
    prevFileRef.current = fileId;
    useLoreUiStore.getState().resetForFile(instanceId);
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

  /** 删除设定卡片：有关联时先确认解除数量；无关联直接删除（进撤销栈） */
  const performDeleteCards = (ids: string[]) => {
    if (!fileId) return;
    for (const id of ids) deleteCard(instanceId, fileId, id);
    if (editingId && ids.includes(editingId)) closeCard(instanceId);
  };
  const deleteCards = (ids: string[]) => {
    if (!fileId) return;
    const assocCount = ids.reduce((sum, id) => sum + useAssociationStore.getState().getFilesForCard(id).length, 0);
    if (assocCount > 0) {
      setConfirmDeleteCards(ids);
      return;
    }
    performDeleteCards(ids);
  };

  // —— v0.7：导出（.lore / .png）与导入（.lore）——
  const [ioBusy, setIoBusy] = useState(false);
  const exportLore = async (kind: "lore" | "png") => {
    if (!fileId) return;
    const st = useLoreStore.getState();
    const cur = st.getSlice(instanceId);
    const data = cur.docs[fileId] ?? { cards: [], edges: [] };
    const title = cur.files.find((f) => f.id === fileId)?.title ?? "设定库";
    const path = await save({
      title: kind === "png" ? "导出设定库 PNG" : "导出设定库",
      defaultPath: `${title}.${kind}`,
      filters:
        kind === "png"
          ? [{ name: "PNG 图片", extensions: ["png"] }]
          : [{ name: "设定库文件", extensions: ["lore"] }],
    });
    if (!path) return;
    setIoBusy(true);
    try {
      if (kind === "png") {
        // 截图式导出：直接截取应用内连接图的 DOM；网格/搜索筛选时连接图未挂载，引导切换
        const base64 = await captureLoreGraph(instanceId);
        if (!base64) {
          notifyError("无法导出设定库 PNG", "请在「连接图」视图下导出（网格布局 / 搜索筛选时会切换到网格）。");
          return;
        }
        await writeBinaryFile(path, base64);
        notifySuccess(`已导出设定库「${title}」PNG`, path, path);
      } else {
                  const assocMap: Record<string, string[]> = {};
          for (const c of data.cards) {
            const ids = useAssociationStore.getState().getFilesForCard(c.id);
            if (ids.length > 0) assocMap[c.id] = ids;
          }
          await writeTextFile(path, serializeLore(title, data, cur.tags, assocMap));
        notifySuccess(`已导出设定库「${title}」`, path, path);
      }
    } catch (e) {
      console.error("导出设定库失败", e);
      notifyError(
        "导出设定库失败",
        e instanceof Error ? e.message : typeof e === "string" ? e : "导出失败，请重试。",
      );
    } finally {
      setIoBusy(false);
    }
  };
  const importLore = async () => {
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "设定库文件", extensions: ["lore"] }],
    });
    if (typeof path !== "string") return;
    setIoBusy(true);
    try {
      const text = await readTextFile(path);
      const parsed = parseLore(text);
      const st = useLoreStore.getState();
      const cur = st.getSlice(instanceId);
      // 合并文件内标签到实例级：同名复用既有标签，否则新建；建立旧 id → 新 id 映射
      const idMap = new Map<string, string>();
      for (const t of parsed.tags ?? []) {
        const existing = cur.tags.find((x) => x.name === t.name);
        if (existing) idMap.set(t.id, existing.id);
        else idMap.set(t.id, st.addTag(instanceId, t.name, t.color).id);
      }
      // 重映射卡片标签引用，避免指向导入前的旧 id
      const data: LoreData = {
        cards: parsed.data.cards.map((c) => ({
          ...c,
          tags: c.tags.map((id) => idMap.get(id) ?? id),
        })),
        edges: parsed.data.edges,
      };
      // 新增一条设定库文件（导入数据写盘；addFile 自动切换到新文件）
      const file = st.addFile(instanceId, parsed.title);
      st.setFileData(instanceId, file.id, data);
      // 导入卡片关联的时间轴 id（逐条校验，缺失丢弃并提示）
      const validTimelineIds = new Set(getAllTimelineFiles().map((f) => f.fileId));
      let missing = 0;
      const assocByFile: Record<string, string[]> = {};
      const importedCardIds = new Set(data.cards.map((c) => c.id));
      for (const [cardId, ids] of Object.entries(parsed.associations ?? {})) {
        if (!importedCardIds.has(cardId)) {
          missing += ids.length;
          continue;
        }
        for (const tid of ids) {
          if (validTimelineIds.has(tid)) {
            (assocByFile[tid] ??= []).push(cardId);
          } else {
            missing++;
          }
        }
      }
      for (const [tid, cardIds] of Object.entries(assocByFile)) {
        useAssociationStore.getState().setFileCards(instanceId, tid, cardIds);
      }
      if (missing > 0) notifyInfo(`导入设定库完成，已丢弃 ${missing} 条不存在的关联。`);
    } catch (e) {
      console.error("导入设定库失败", e);
    } finally {
      setIoBusy(false);
    }
  };

  // —— 导入 / 导出（工具栏经 bus 调用）——
  useEffect(() =>
    registerLoreIo(instanceId, {
      exportLoreFile: () => void exportLore("lore"),
      exportLorePng: () => void exportLore("png"),
      importLoreFile: () => void importLore(),
    }),
    [instanceId, exportLore, importLore],
  );

  // —— 全局快捷键（撤销 / 重做 / 视图切换；配置页可改绑）——
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const defs = keybindingRegistry.list("plugin:core.lore");
      const hit = (cmd: string) => commandMatches(e, defs.find((d) => d.command === cmd));
      if (hit("lore.undo")) { e.preventDefault(); requestLoreUndo(instanceId); return; }
      if (hit("lore.redo")) { e.preventDefault(); requestLoreRedo(instanceId); return; }
      if (hit("lore.toggleLayout")) {
        e.preventDefault();
        const st = useLoreUiStore.getState();
        const cur = st.slices[instanceId]?.view.layout ?? "graph";
        st.setLayout(instanceId, cur === "graph" ? "grid" : "graph");
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [instanceId]);

  // —— 默认视图（设置项）：进入视图时应用 ——
  useEffect(() => {
    const d = resolveSetting(LORE_PROTOTYPE, instanceId, "defaultView");
    useLoreUiStore.getState().setLayout(instanceId, d === "grid" ? "grid" : "graph");
  }, [instanceId]);

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
      <div className="relative min-h-0 flex-1">
        {showGrid || !fileId ? (
          <LoreGrid
            onNew={handleNew}
            onEdit={(c) => openCard(instanceId, c.id)}
            onDelete={(c) => deleteCards([c.id])}
            onAssociate={(c) => setAssocCardId(c.id)}
          />
        ) : (
          <LoreGraphRoot
            onDeleteCard={(c) => deleteCards([c.id])}
            onDeleteCards={(cards) => deleteCards(cards.map((c) => c.id))}
          />
        )}

        {/* 空态引导卡：当前文件无卡片时居中显示（首个卡片出现后自动消失） */}
        {fileId && (slice.docs[fileId]?.cards.length ?? 0) === 0 && <EmptyStateGuide projectId={projectId} data={loreGuide} />}

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
      {/* 关联时间轴弹窗（网格/右键共用） */}
      {assocCardId && fileId && (
        <LoreTimelineAssociationDialog
          loreInstanceId={instanceId}
          fileId={fileId}
          cardId={assocCardId}
          onClose={() => setAssocCardId(null)}
        />
      )}

      {/* 删除设定确认：有关联时提示解除数量 */}
      <Dialog open={!!confirmDeleteCards} onOpenChange={(open) => !open && setConfirmDeleteCards(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除设定</DialogTitle>
            <DialogDescription>
              {confirmDeleteCards && `将解除 ${confirmDeleteCards.reduce((sum, id) => sum + useAssociationStore.getState().getFilesForCard(id).length, 0)} 条关联，删除后无法撤销。`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setConfirmDeleteCards(null)}
              className="rounded-md px-3 py-1.5 text-xs text-fg-muted transition-colors hover:bg-hover hover:text-fg"
            >
              取消
            </button>
            <button
              onClick={() => {
                if (confirmDeleteCards) {
                  useAssociationStore.getState().removeCards(confirmDeleteCards);
                  performDeleteCards(confirmDeleteCards);
                }
                setConfirmDeleteCards(null);
              }}
              className="rounded-md bg-danger px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              删除
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
