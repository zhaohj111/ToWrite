// core.timeline —— 重型模块插件：水平轴体时间轴（侧栏文件树 + 主视图画布）。

import { Workflow } from "lucide-react";
import type { ModuleContract, SettingFieldDef } from "@/types/plugin";
// 内容解耦：详情 / 更新日志为 .md，设置字段为 .json，与模块代码同目录
import timelineReadme from "./README.md?raw";
import timelineGuide from "./GUIDE.md?raw";
import timelineChangelog from "./CHANGELOG.md?raw";
import timelineSettings from "./settings.json";
import { TimelinePane } from "@/components/timeline/timelinePane";
import { TimelineSidebar } from "@/components/timeline/timelineSidebar";
import { registerTimelineToolbar } from "./toolbarContribs";

export const coreTimelineModule: ModuleContract = {
  id: "core.timeline",
  name: "时间轴",
  description: "官方重型模块：分卷 + 时间轴文件树，水平轴体上可拖动的故事事件标签。",
  readme: timelineReadme,
  guideMd: timelineGuide,
  changelogMd: timelineChangelog,
  kind: "heavy",
  enabled: true,
  author: "拓文官方",
  version: "0.6.2",
  // 侧栏命名配置（文件名 / 文件夹名）出厂默认在 settings.json
  settings: timelineSettings as unknown as Record<string, SettingFieldDef>,
  views: {
    activityBar: { id: "timeline", label: "时间轴", icon: Workflow },
    sidebars: [{ id: "timeline-files", title: "时间轴文件", component: TimelineSidebar }],
    mainView: { id: "timeline", title: "时间轴", component: TimelinePane },
  },
  activate: (ctx) => {
    // 视图工具栏（撤销/重做、图例、颜色管理、关联管理）注册于 ./toolbarContribs
    registerTimelineToolbar(ctx);
  },
};
