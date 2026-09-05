// 宿主主区域：模块声明的主视图以标签页呈现。
// 顶部标签栏按“当前插件下的文件”渲染：正文类实例显示该实例最近打开的章节标签，
// 其他实例显示其自身标签；插件切换由左侧 Activity Bar 完成。

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BookMarked,
  CalendarRange,
  FileText,
  Link2,
  X,
} from "lucide-react";
import { useMainViews } from "@/plugins/hooks";
import { pluginRegistry } from "@/plugins/registry";
import type { ViewToolbarContext, ViewToolbarItem } from "@/types/plugin";
import { useLayoutStore } from "@/stores/layoutStore";
import { useEditorStore, EMPTY_SLICE } from "@/stores/editorStore";
import { useTimelineStore, EMPTY_TIMELINE_SLICE } from "@/stores/timelineStore";
import { useAssociationStore } from "@/stores/associationStore";
import { useTimelineUiStore } from "@/stores/timelineUiStore";
import { resolveSetting } from "@/stores/settingsStore";
import { TIMELINE_PROTOTYPE } from "@/stores/pluginStore";
import { LORE_PROTOTYPE } from "@/stores/loreStore";
import { useLoreStore, EMPTY_LORE_SLICE } from "@/stores/loreStore";
import { useLoreUiStore } from "@/stores/loreUiStore";
import { EditorInstanceProvider } from "@/components/editor/editorInstanceContext";
import { requestTimelineUndo, requestTimelineRedo } from "@/lib/timelineBus";
import { getCardRefsForTimelineFile, openLoreFromTimelineCard } from "@/lib/associationUtils";
import { LegendManager } from "@/components/timeline/legendManager";
import { TimelineAssociationPanel } from "@/components/timeline/timelineAssociationPanel";
import { TagManager } from "@/components/lore/tagManager";
import { cn } from "@/lib/cn";
import type { ChapterMeta, LoreFileMeta, TimelineFileMeta } from "@/types/writeproj";

export function MainArea() {
  const views = useMainViews();
  const mainViewId = useLayoutStore((s) => s.mainViewId);
  const active = views.find((v) => v.id === mainViewId) ?? views[0];
  const [legendOpen, setLegendOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const legendVisible = useTimelineUiStore((s) => s.legendVisible);

  // —— 时间轴关联 chips 横向滚动（隐藏滚动条 + 左键拖动） ——
  const timelineChipsRef = useRef<HTMLDivElement>(null);
  const timelineChipsDragRef = useRef<{ startClientX: number; startLeft: number; moved: boolean } | null>(null);
  const startTimelineChipsDrag = (e: React.PointerEvent) => {
    if (e.button !== 0 || e.pointerType !== "mouse") return;
    if ((e.target as HTMLElement).closest("button, input")) return;
    const el = timelineChipsRef.current;
    timelineChipsDragRef.current = { startClientX: e.clientX, startLeft: el?.scrollLeft ?? 0, moved: false };
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = timelineChipsDragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startClientX;
      if (!d.moved && Math.abs(dx) < 4) return;
      d.moved = true;
      const el = timelineChipsRef.current;
      if (el) el.scrollLeft = d.startLeft - dx;
    };
    const onUp = () => { timelineChipsDragRef.current = null; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);
    const [assocOpen, setAssocOpen] = useState(false);
  const setLegendVisible = useTimelineUiStore((s) => s.setLegendVisible);
  const setLoreLayout = useLoreUiStore((s) => s.setLayout);
  // 布局以「图」为缺省，且计入「搜索/标签筛选强制网格」：
  // 展示与工具栏切换严格一致（显示网格时按钮显示为切换到力导向图，反之亦然）
  const loreLayout = useLoreUiStore((s) => {
    if (active?.prototypeId !== "core.lore") return "graph";
    const v = s.slices[active.instanceId]?.view;
    const base = v?.layout ?? "graph";
    if (base === "grid" || (v?.query ?? "").trim() !== "" || (v?.activeTags?.length ?? 0) > 0) {
      return "grid";
    }
    return "graph";
  });
  // 连接线 / 关系文本颜色（新建连线、更改关系名时起效）；实例未单独设置时回退到全局持久化值
  const loreEdgeColor = useLoreUiStore((s) =>
    active?.prototypeId === "core.lore"
      ? (s.slices[active.instanceId]?.edgeColor ?? s.edgeColor)
      : undefined,
  );
  const loreEdgeLabelColor = useLoreUiStore((s) =>
    active?.prototypeId === "core.lore"
      ? (s.slices[active.instanceId]?.edgeLabelColor ?? s.edgeLabelColor)
      : undefined,
  );
  const setLoreEdgeColor = useLoreUiStore((s) => s.setEdgeColor);
  const setLoreEdgeLabelColor = useLoreUiStore((s) => s.setEdgeLabelColor);
  const loreEdgeColorResolved = loreEdgeColor ?? "#8a8f98";
  const loreEdgeLabelColorResolved = loreEdgeLabelColor ?? "#8a8f98";
  // 时间轴「当前使用颜色」：面板中选取，未设置时回退到实例图例首色
  const timelineCurrentColor = useTimelineUiStore((s) =>
    active?.prototypeId === "core.timeline" ? s.currentColors[active.instanceId] : undefined,
  );
  const timelineLegendFirst = useTimelineStore((s) =>
    active?.prototypeId === "core.timeline" ? s.slices[active.instanceId]?.colorLegend?.[0]?.color : undefined,
  );
  const timelineCurrentColorResolved = timelineCurrentColor ?? timelineLegendFirst ?? "#d7b25c";

    const timelineFileId = useTimelineStore((s) =>
      active?.prototypeId === "core.timeline" ? s.slices[active.instanceId]?.currentFileId ?? null : null,
    );
    const timelineAssocMap = useAssociationStore((s) => s.timelineToLore);
    const timelineAssocCards = useMemo(() =>
      timelineFileId ? getCardRefsForTimelineFile(timelineFileId) : [],
      [timelineFileId, timelineAssocMap],
    );
  // 切换主视图时关闭图例/标签管理面板
  useEffect(() => {
    setLegendOpen(false);
    setAssocOpen(false);
    setTagOpen(false);
  }, [active?.id]);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <TabStrip>
        {active?.prototypeId === "core.editor" ? (
          <EditorTabs instanceId={active.instanceId} />
        ) : active?.prototypeId === "core.timeline" ? (
          <TimelineTabs instanceId={active.instanceId} />
        ) : active?.prototypeId === "core.lore" ? (
          <LoreTabs instanceId={active.instanceId} />
        ) : (
          active && (
            <div className="relative flex shrink-0 cursor-default items-center rounded-t-lg px-4 pb-2 pt-1.5 text-xs font-medium text-fg-strong">
              {active.title}
              <span className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-accent" />
            </div>
          )
        )}
      </TabStrip>
        {/* 时间轴工具行：timeline.toolbar 贡献点注册渲染（撤销/重做、图例、颜色管理、关联管理） */}
        {active?.prototypeId === "core.timeline" && (
          <ViewToolbarRow
            items={pluginRegistry.getContributions("timeline.toolbar")}
            protoId={TIMELINE_PROTOTYPE}
            ctx={{
              instanceId: active.instanceId,
              legendVisible,
              currentColor: timelineCurrentColorResolved,
              openPanelId: assocOpen ? "assoc" : legendOpen ? "legend" : null,
              openPanel: (panel) => {
                if (panel === "legend") setLegendOpen((v) => !v);
                if (panel === "assoc") setAssocOpen((v) => !v);
              },
            }}
          />
        )}
        {/* 时间轴面板浮层锚点：贴齐工具栏下、在自定义区域内水平居中 */}
        {active?.prototypeId === "core.timeline" && (
          <div className="relative z-40">
            {legendOpen && (
              <LegendManager instanceId={active.instanceId} onClose={() => setLegendOpen(false)} />
            )}
            {assocOpen && timelineFileId && (
              <TimelineAssociationPanel
                instanceId={active.instanceId}
                fileId={timelineFileId}
                onClose={() => setAssocOpen(false)}
              />
            )}
          </div>
        )}
        {/* 时间轴关联 chips：当前文件关联的设定卡片（横向拖动浏览） */}
          {active?.prototypeId === "core.timeline" && timelineFileId && (
            <div ref={timelineChipsRef} onPointerDown={startTimelineChipsDrag} className="hidden-scrollbar flex h-10 shrink-0 cursor-grab items-center gap-1 overflow-x-auto border-b border-line/60 bg-app px-3 active:cursor-grabbing">
              {timelineAssocCards.length === 0 ? (
                <span className="whitespace-nowrap text-[11px] text-fg-muted/60">暂无关联设定</span>
              ) : timelineAssocCards.map((c) => (
                <button
                  key={c.cardId}
                  title={`打开设定「${c.title}」`}
                  onClick={() => openLoreFromTimelineCard(c.cardId)}
                  className="flex shrink-0 items-center gap-1 rounded bg-accent-soft px-2 py-1 text-[11px] font-medium text-accent transition-opacity hover:opacity-80"
                >
                  <Link2 className="size-3" />
                  {c.title}
                </button>
              ))}
            </div>
          )}
        {/* 设定库工具行：lore.toolbar 贡献点注册渲染（撤销/重做、布局切换、连线/文本颜色、标签管理） */}
        {active?.prototypeId === "core.lore" && (
          <ViewToolbarRow
            items={pluginRegistry.getContributions("lore.toolbar")}
            protoId={LORE_PROTOTYPE}
            ctx={{
              instanceId: active.instanceId,
              layout: loreLayout,
              edgeColor: loreEdgeColorResolved,
              edgeLabelColor: loreEdgeLabelColorResolved,
              onSetEdgeColor: (c) => setLoreEdgeColor(active.instanceId, c),
              onSetEdgeLabelColor: (c) => setLoreEdgeLabelColor(active.instanceId, c),
              onToggleLayout: () =>
                setLoreLayout(active.instanceId, loreLayout === "graph" ? "grid" : "graph"),
              openPanelId: tagOpen ? "tags" : null,
              openPanel: (panel) => {
                if (panel === "tags") setTagOpen((v) => !v);
              },
            }}
          />
        )}
        {/* 设定库面板浮层锚点：贴齐工具栏下、在自定义区域内水平居中 */}
        {active?.prototypeId === "core.lore" && (
          <div className="relative z-40">
            {tagOpen && (
              <TagManager instanceId={active.instanceId} onClose={() => setTagOpen(false)} />
            )}
          </div>
        )}
      <div key={active?.id ?? "empty"} className="anim-tab relative min-h-0 flex-1 overflow-hidden">
        {active ? (
          <EditorInstanceProvider value={active.instanceId}>
            <active.component />
          </EditorInstanceProvider>
        ) : (
          <div className="flex h-full items-center justify-center text-fg-muted">
            暂无可用主视图（可选中时间轴模块）
          </div>
        )}
      </div>
    </div>
  );
}

/** 视图工具栏行（时间轴/设定库）：由 timeline.toolbar / lore.toolbar 贡献点注册渲染，
 *  与编辑器工具栏同构 —— 分隔线 / 内联自定义渲染 / 图标按钮（含激活态）。 */
function ViewToolbarRow({
  items,
  ctx,
  protoId,
}: {
  items: ViewToolbarItem[];
  ctx: ViewToolbarContext;
  protoId: string;
}) {
  // 按设置项的显示开关过滤（groupId 布尔值 false 隐藏），并清理孤立分隔线
  const visible = (() => {
    const shown = items.filter(
      (i) => !i.groupId || resolveSetting(protoId, ctx.instanceId, i.groupId) !== false,
    );
    return shown.filter((item, idx, arr) => {
      if (!item.divider) return true;
      const prevIsDivider = !!arr[idx - 1]?.divider;
      const nextIsDivider = !!arr[idx + 1]?.divider;
      const atEdge = idx === 0 || idx === arr.length - 1;
      return !prevIsDivider && !nextIsDivider && !atEdge;
    });
  })();
  return (
    <div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-line/60 bg-app px-2">
      {visible.map((item) => {
        if (item.divider) {
          return <span key={item.id} className="mx-1.5 h-4 w-px shrink-0 bg-line" />;
        }
        if (item.render) {
          return (
            <span key={item.id} className="flex shrink-0 items-center">
              {item.render(ctx)}
            </span>
          );
        }
        const active = item.isActive?.(ctx) ?? false;
        return (
          <button
            key={item.id}
            title={item.title}
            onClick={() => item.action?.(ctx)}
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-all duration-150 active:scale-95",
              active ? "bg-accent-soft text-accent" : "text-fg-muted hover:bg-hover hover:text-fg",
            )}
          >
            {item.icon ? <item.icon className="size-4" /> : null}
          </button>
        );
      })}
    </div>
  );
}
/** 主体区域文件标签条（所有插件变体共用）：
 *  隐藏滚动条 + 左键拖动横向滚动（WebView2 下与侧栏同款 pointer 方案）；
 *  拖动超过 4px 判定为滚动，吞掉释放时的 click，避免误切换文件。 */
function TabStrip({ children }: { children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startClientX: number; startLeft: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  const startDrag = (e: React.PointerEvent) => {
    if (e.button !== 0 || e.pointerType !== "mouse") return;
    // 关闭等交互控件上不启动拖动（其上点击仍交给各自 onClick）
    if ((e.target as HTMLElement).closest("button, input, a")) return;
    suppressClickRef.current = false;
    const el = scrollRef.current;
    dragRef.current = { startClientX: e.clientX, startLeft: el?.scrollLeft ?? 0, moved: false };
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startClientX;
      if (!d.moved && Math.abs(dx) < 4) return; // 4px 判定为点击
      d.moved = true;
      const el = scrollRef.current;
      if (el) el.scrollLeft = d.startLeft - dx;
    };
    const onUp = () => {
      const d = dragRef.current;
      if (d && d.moved) {
        suppressClickRef.current = true; // 拖拽释放后吞掉这次 release click
        // 兜底：释放后没有紧跟 click（拖出标签条释放）时，标志不能滞留，
        // 否则下一次点标签/关闭按钮会被误吞（表现为「点了没切换」）
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 150);
      }
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  return (
    <div
      ref={scrollRef}
      onPointerDown={startDrag}
      onClickCapture={(e) => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          e.stopPropagation();
        }
      }}
      className="hidden-scrollbar flex h-10 shrink-0 cursor-grab items-end gap-0.5 overflow-x-auto overflow-y-hidden border-b border-line/60 bg-app px-2 pt-2 active:cursor-grabbing"
    >
      {children}
    </div>
  );
}

/** 正文类实例的文件标签：该实例最近打开的章节（最新在前），点击切换、X 关闭 */
function EditorTabs({ instanceId }: { instanceId: string }) {
  const slice = useEditorStore((s) => s.slices[instanceId] ?? EMPTY_SLICE);
  const setCurrentChapter = useEditorStore((s) => s.setCurrentChapter);
  const closeTab = useEditorStore((s) => s.closeTab);

  const tabs = slice.openTabs
    .map((id) => slice.chapters.find((c) => c.id === id))
    .filter((c): c is ChapterMeta => !!c);

  if (tabs.length === 0) {
    return <span className="px-2 pb-1.5 text-xs text-fg-muted">暂无打开的章节</span>;
  }

  return (
    <>
      {tabs.map((c) => (
        <div
          key={c.id}
          role="button"
          title={c.title}
          onClick={() => setCurrentChapter(instanceId, c.id)}
          className={cn(
            "group relative flex max-w-[200px] shrink-0 cursor-pointer items-center gap-1.5 rounded-t-lg px-3 pb-2 pt-1.5 text-xs transition-colors",
            c.id === slice.currentChapterId ? "text-fg-strong" : "text-fg-muted hover:text-fg",
          )}
        >
          <FileText
            className={cn(
              "size-3.5 shrink-0",
              c.id === slice.currentChapterId ? "text-accent" : "text-fg-muted/70",
            )}
          />
          <span className="truncate">{c.title}</span>
          <button
            title="关闭"
            onClick={(e) => {
              e.stopPropagation();
              closeTab(instanceId, c.id);
            }}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md text-fg-muted/70 opacity-0 transition-all hover:bg-active hover:text-fg group-hover:opacity-100"
          >
            <X className="size-3" />
          </button>
          {c.id === slice.currentChapterId && (
            <span className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-accent" />
          )}
        </div>
      ))}
    </>
  );
}

/** 时间轴类实例的文件标签：该实例最近打开的时间轴文件（最新在前），点击切换、X 关闭 */
function TimelineTabs({ instanceId }: { instanceId: string }) {
  const slice = useTimelineStore((s) => s.slices[instanceId] ?? EMPTY_TIMELINE_SLICE);
  const setCurrentFile = useTimelineStore((s) => s.setCurrentFile);
  const closeTab = useTimelineStore((s) => s.closeTab);

  const tabs = slice.openTabs
    .map((id) => slice.files.find((f) => f.id === id))
    .filter((f): f is TimelineFileMeta => !!f);

  if (tabs.length === 0) {
    return <span className="px-2 pb-1.5 text-xs text-fg-muted">暂无打开的时间轴</span>;
  }

  return (
    <>
      {tabs.map((f) => (
        <div
          key={f.id}
          role="button"
          title={f.title}
          onClick={() => setCurrentFile(instanceId, f.id)}
          className={cn(
            "group relative flex max-w-[200px] shrink-0 cursor-pointer items-center gap-1.5 rounded-t-lg px-3 pb-2 pt-1.5 text-xs transition-colors",
            f.id === slice.currentFileId ? "text-fg-strong" : "text-fg-muted hover:text-fg",
          )}
        >
          <CalendarRange
            className={cn(
              "size-3.5 shrink-0",
              f.id === slice.currentFileId ? "text-accent" : "text-fg-muted/70",
            )}
          />
          <span className="truncate">{f.title}</span>
          <button
            title="关闭"
            onClick={(e) => {
              e.stopPropagation();
              closeTab(instanceId, f.id);
            }}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md text-fg-muted/70 opacity-0 transition-all hover:bg-active hover:text-fg group-hover:opacity-100"
          >
            <X className="size-3" />
          </button>
          {f.id === slice.currentFileId && (
            <span className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-accent" />
          )}
        </div>
      ))}
    </>
  );
}

/** 设定库类实例的文件标签：该实例最近打开的设定库文件（最新在前），点击切换、X 关闭 */
function LoreTabs({ instanceId }: { instanceId: string }) {
  const slice = useLoreStore((s) => s.slices[instanceId] ?? EMPTY_LORE_SLICE);
  const setCurrentFile = useLoreStore((s) => s.setCurrentFile);
  const closeTab = useLoreStore((s) => s.closeTab);

  const tabs = slice.openTabs
    .map((id) => slice.files.find((f) => f.id === id))
    .filter((f): f is LoreFileMeta => !!f);

  if (tabs.length === 0) {
    return <span className="px-2 pb-1.5 text-xs text-fg-muted">暂无打开的设定库文件</span>;
  }

  return (
    <>
      {tabs.map((f) => (
        <div
          key={f.id}
          role="button"
          title={f.title}
          onClick={() => setCurrentFile(instanceId, f.id)}
          className={cn(
            "group relative flex max-w-[200px] shrink-0 cursor-pointer items-center gap-1.5 rounded-t-lg px-3 pb-2 pt-1.5 text-xs transition-colors",
            f.id === slice.currentFileId ? "text-fg-strong" : "text-fg-muted hover:text-fg",
          )}
        >
          <BookMarked
            className={cn(
              "size-3.5 shrink-0",
              f.id === slice.currentFileId ? "text-accent" : "text-fg-muted/70",
            )}
          />
          <span className="truncate">{f.title}</span>
          <button
            title="关闭"
            onClick={(e) => {
              e.stopPropagation();
              closeTab(instanceId, f.id);
            }}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md text-fg-muted/70 opacity-0 transition-all hover:bg-active hover:text-fg group-hover:opacity-100"
          >
            <X className="size-3" />
          </button>
          {f.id === slice.currentFileId && (
            <span className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-accent" />
          )}
        </div>
      ))}
    </>
  );
}

