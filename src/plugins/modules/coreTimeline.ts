// core.timeline —— 重型模块插件：水平轴体时间轴（侧栏文件树 + 主视图画布）。

import { Workflow } from "lucide-react";
import type { ModuleContract } from "@/types/plugin";
import { TimelinePane } from "@/components/timeline/timelinePane";
import { TimelineSidebar } from "@/components/timeline/timelineSidebar";

export const coreTimelineModule: ModuleContract = {
  id: "core.timeline",
  name: "时间轴",
  description: "官方重型模块：分卷 + 时间轴文件树，水平轴体上可拖动的故事事件标签。",
  kind: "heavy",
  enabled: true,
  views: {
    activityBar: { id: "timeline", label: "时间轴", icon: Workflow },
    sidebars: [{ id: "timeline-files", title: "时间轴文件", component: TimelineSidebar }],
    mainView: { id: "timeline", title: "时间轴", component: TimelinePane },
  },
  activate: () => {
    // v0.7 骨架：暂无额外贡献点。
  },
};
