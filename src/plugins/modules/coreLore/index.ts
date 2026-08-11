// core.lore —— 重型模块插件：设定库（人物/世界/物品/势力档案）。
// 侧边栏 = 设定库文件树；主视图 = 力导向图 / 网格双布局的卡片编辑区。

import { Library } from "lucide-react";
import type { ModuleContract, SettingFieldDef } from "@/types/plugin";
// 内容解耦：详情 / 更新日志为 .md，设置字段为 .json，与模块代码同目录
import loreReadme from "./README.md?raw";
import loreChangelog from "./CHANGELOG.md?raw";
import loreSettings from "./settings.json";
import { LoreSidebar } from "@/components/lore/loreSidebar";
import { LorePane } from "@/components/lore/lorePane";

export const coreLoreModule: ModuleContract = {
  id: "core.lore",
  name: "设定库",
  description: "官方重型模块：设定库文件树 + 力导向图/网格卡片编辑区。",
  readme: loreReadme,
  changelogMd: loreChangelog,
  kind: "heavy",
  enabled: true,
  author: "拓文官方",
  version: "0.6.0",
  // 侧栏命名配置（文件名 / 文件夹名）出厂默认在 settings.json
  settings: loreSettings as unknown as Record<string, SettingFieldDef>,
  views: {
    activityBar: { id: "lore", label: "设定库", icon: Library },
    sidebars: [{ id: "lore", title: "设定库", component: LoreSidebar }],
    mainView: { id: "lore", title: "设定库", component: LorePane },
  },
  activate: (ctx) => {
    ctx.registerContribution("sidebar.views", {
      id: "lore",
      title: "设定库",
      component: LoreSidebar,
    });
  },
};
