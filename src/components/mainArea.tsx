// 宿主主区域：模块声明的主视图以标签页呈现。
// 顶部标签栏按“当前插件下的文件”渲染：正文类实例显示该实例最近打开的章节标签，
// 其他实例显示其自身标签；插件切换由左侧 Activity Bar 完成。

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookMarked,
  CalendarRange,
  FileText,
  Grid3x3,
  Layers,
  Palette,
  Redo2,
  Share2,
  Tags,
  Undo2,
  X,
} from "lucide-react";
import { useMainViews } from "@/plugins/hooks";
import { useLayoutStore } from "@/stores/layoutStore";
import { useEditorStore, EMPTY_SLICE } from "@/stores/editorStore";
import { useTimelineStore, EMPTY_TIMELINE_SLICE } from "@/stores/timelineStore";
import { useTimelineUiStore } from "@/stores/timelineUiStore";
import { useLoreStore, EMPTY_LORE_SLICE } from "@/stores/loreStore";
import { useLoreUiStore } from "@/stores/loreUiStore";
import { EditorInstanceProvider } from "@/components/editor/editorInstanceContext";
import { requestLoreRedo, requestLoreUndo } from "@/lib/loreBus";
import { requestTimelineUndo, requestTimelineRedo } from "@/lib/timelineBus";
import { LegendManager } from "@/components/timeline/legendManager";
import { TagManager } from "@/components/lore/tagManager";
import { ColorPickerPanel } from "@/components/ui/colorPicker";
import { cn } from "@/lib/cn";
import type { ChapterMeta, LoreFileMeta, TimelineFileMeta } from "@/types/writeproj";

export function MainArea() {
  const views = useMainViews();
  const mainViewId = useLayoutStore((s) => s.mainViewId);
  const active = views.find((v) => v.id === mainViewId) ?? views[0];
  const [legendOpen, setLegendOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const legendVisible = useTimelineUiStore((s) => s.legendVisible);
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

  // 切换主视图时关闭图例/标签管理面板
  useEffect(() => {
    setLegendOpen(false);
    setTagOpen(false);
  }, [active?.id]);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-end gap-0.5 overflow-x-auto overflow-y-hidden border-b border-line/60 bg-app px-2 pt-2">
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
      </div>
        {/* 时间轴工具行：文件标签下方（间距与编辑器工具栏一致）。
            概览/适应已移至画布左下角缩放控件，此处保留图例开关与颜色管理（含当前使用颜色指示）。 */}
        {active?.prototypeId === "core.timeline" && (
          <div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-line/60 bg-app px-2">
            <button
              title="撤销"
              onClick={() => requestTimelineUndo(active.instanceId)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-all duration-150 hover:bg-hover hover:text-fg active:scale-95"
            >
              <Undo2 className="size-4" />
            </button>
            <button
              title="重做"
              onClick={() => requestTimelineRedo(active.instanceId)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-all duration-150 hover:bg-hover hover:text-fg active:scale-95"
            >
              <Redo2 className="size-4" />
            </button>
            <span className="mx-1.5 h-4 w-px bg-line" />
            <button
              title={legendVisible ? "隐藏图例" : "显示图例"}
              onClick={() => setLegendVisible(!legendVisible)}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md transition-all duration-150 active:scale-95",
                legendVisible
                  ? "bg-accent-soft text-accent"
                  : "text-fg-muted hover:bg-hover hover:text-fg",
              )}
            >
              <Layers className="size-4" />
            </button>
            <button
              title="颜色管理（点选图例设为当前使用颜色）"
              onClick={() => setLegendOpen((v) => !v)}
              className={cn(
                "relative flex h-7 w-7 items-center justify-center rounded-md transition-all duration-150 active:scale-95",
                legendOpen
                  ? "bg-accent-soft text-accent"
                  : "text-fg-muted hover:bg-hover hover:text-fg",
              )}
            >
              <Palette className="size-4" />
              <span
                title="当前使用颜色"
                className="absolute right-[3px] top-[3px] size-2 rounded-full ring-1 ring-line"
                style={{ background: timelineCurrentColorResolved }}
              />
            </button>
          </div>
        )}
        {/* 设定库工具行：撤销/重做在最左，其后为布局切换 / 连线颜色 / 关系文本颜色 / 标签管理 */}
        {active?.prototypeId === "core.lore" && (
          <div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-line/60 bg-app px-2">
            <button
              title="撤销（编辑内容 / 返回上一步视图）"
              onClick={() => requestLoreUndo(active.instanceId)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-all duration-150 hover:bg-hover hover:text-fg active:scale-95"
            >
              <Undo2 className="size-4" />
            </button>
            <button
              title="重做"
              onClick={() => requestLoreRedo(active.instanceId)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-all duration-150 hover:bg-hover hover:text-fg active:scale-95"
            >
              <Redo2 className="size-4" />
            </button>
            <span className="mx-1.5 h-4 w-px bg-line" />
            <button
              title={loreLayout === "graph" ? "切换为网格布局" : "切换为连接图"}
              onClick={() =>
                setLoreLayout(
                  active.instanceId,
                  loreLayout === "graph" ? "grid" : "graph",
                )
              }
              className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-all duration-150 hover:bg-hover hover:text-fg active:scale-95"
            >
              {loreLayout === "graph" ? (
                <Grid3x3 className="size-4" />
              ) : (
                <Share2 className="size-4" />
              )}
            </button>
            <ColorSwatchButton
              value={loreEdgeColorResolved}
              onChange={(c) => setLoreEdgeColor(active.instanceId, c)}
              title="连接线颜色（新建连线 / 更改关系名时起效）"
              label="连线"
            />
            <ColorSwatchButton
              value={loreEdgeLabelColorResolved}
              onChange={(c) => setLoreEdgeLabelColor(active.instanceId, c)}
              title="关系文本颜色（新建连线 / 更改关系名时起效）"
              label="文本"
            />
            <button
              title="标签管理"
              onClick={() => setTagOpen((v) => !v)}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md transition-all duration-150 active:scale-95",
                tagOpen
                  ? "bg-accent-soft text-accent"
                  : "text-fg-muted hover:bg-hover hover:text-fg",
              )}
            >
              <Tags className="size-4" />
            </button>
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
        {active?.prototypeId === "core.timeline" && legendOpen && (
          <LegendManager instanceId={active.instanceId} onClose={() => setLegendOpen(false)} />
        )}
        {active?.prototypeId === "core.lore" && tagOpen && (
          <TagManager instanceId={active.instanceId} onClose={() => setTagOpen(false)} />
        )}
      </div>
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

/** 工具栏色块按钮：色块 + 文字标签，点击弹出通用取色面板（Portal 到 body，避免被工具栏裁剪） */
function ColorSwatchButton({
  value,
  onChange,
  title,
  label,
}: {
  value: string;
  onChange: (color: string) => void;
  title: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const rect = btnRef.current?.getBoundingClientRect();

  return (
    <>
      <button
        ref={btnRef}
        title={title}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-md px-1.5 transition-all duration-150 active:scale-95",
          open ? "bg-accent-soft" : "text-fg-muted hover:bg-hover hover:text-fg",
        )}
      >
        <span className="size-3.5 rounded-[4px] ring-1 ring-line" style={{ background: value }} />
        <span className="text-[11px] leading-none">{label}</span>
      </button>
      {open &&
        rect &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div
              className="fixed z-50 overflow-hidden rounded-xl border border-line/70 bg-app shadow-pop"
              style={{
                left: Math.min(rect.left, window.innerWidth - 268),
                top: rect.bottom + 4,
              }}
            >
              <div className="border-b border-line/50 px-3 py-1.5">
                <span className="text-[11px] font-medium text-fg">当前{label}颜色</span>
              </div>
              <ColorPickerPanel value={value} onChange={onChange} />
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
