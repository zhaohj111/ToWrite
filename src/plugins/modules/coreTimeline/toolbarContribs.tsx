// core.timeline —— 视图工具栏贡献点（timeline.toolbar）：
// 撤销/重做、图例显隐、颜色管理（含当前使用颜色指示）由宿主 MainArea 按注册渲染。
// 与主文件解耦：新增/调整工具项只改本文件。

import { Layers, Link2, Palette, Redo2, Undo2 } from "lucide-react";
import type { PluginContext, ViewToolbarContext } from "@/types/plugin";
import { requestTimelineRedo, requestTimelineUndo } from "@/lib/timelineBus";
import { cn } from "@/lib/cn";
import { useTimelineUiStore } from "@/stores/timelineUiStore";
import { ToolbarGuideButton } from "@/components/ui/quickGuide";
import { timelineGuide } from "./guideData";

/** 注册时间轴视图工具栏全部条目 */
export function registerTimelineToolbar(ctx: PluginContext): void {
  // 操作指引置于最左（与撤销/重做以分隔线隔开）
  ctx.registerContribution("timeline.toolbar", {
    id: "guide",
    title: "操作指引（新用户上手）",
    render: () => <ToolbarGuideButton data={timelineGuide} />,
  });
  ctx.registerContribution("timeline.toolbar", {
    id: "divider-guide",
    title: "",
    divider: true,
  });
  ctx.registerContribution("timeline.toolbar", {
    id: "undo",
    title: "撤销",
    icon: Undo2,
    action: ({ instanceId }) => requestTimelineUndo(instanceId),
  });
  ctx.registerContribution("timeline.toolbar", {
    id: "redo",
    title: "重做",
    icon: Redo2,
    action: ({ instanceId }) => requestTimelineRedo(instanceId),
  });
  ctx.registerContribution("timeline.toolbar", {
    id: "divider-0",
    title: "",
    divider: true,
  });
  ctx.registerContribution("timeline.toolbar", {
    id: "legend",
    title: "显示/隐藏图例",
    icon: Layers,
    isActive: ({ legendVisible }) => legendVisible === true,
    action: () =>
      useTimelineUiStore.getState().setLegendVisible(!useTimelineUiStore.getState().legendVisible),
  });
  ctx.registerContribution("timeline.toolbar", {
    id: "assoc",
    title: "关联管理",
    icon: Link2,
    isActive: ({ openPanelId }) => openPanelId === "assoc",
    action: ({ openPanel }) => openPanel("assoc"),
  });
  ctx.registerContribution("timeline.toolbar", {
    id: "color-manager",
    title: "颜色管理（点选图例设为当前使用颜色）",
    render: (tctx: ViewToolbarContext) => (
      <button
        title="颜色管理（点选图例设为当前使用颜色）"
        onClick={() => tctx.openPanel("legend")}
        className={cn(
          "relative flex h-7 w-7 items-center justify-center rounded-md transition-all duration-150 active:scale-95",
          tctx.openPanelId === "legend"
            ? "bg-accent-soft text-accent"
            : "text-fg-muted hover:bg-hover hover:text-fg",
        )}
      >
        <Palette className="size-4" />
        <span
          title="当前使用颜色"
          className="absolute right-[3px] top-[3px] size-2 rounded-full ring-1 ring-line"
          style={{ background: tctx.currentColor ?? "#d7b25c" }}
        />
      </button>
    ),
  });

}