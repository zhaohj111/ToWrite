// core.lore —— 重型模块插件：设定库（人物/世界/物品/势力档案）。
// 侧边栏 = 设定库文件树；主视图 = 力导向图 / 网格双布局的卡片编辑区。

import { Library } from "lucide-react";
import type { ModuleContract } from "@/types/plugin";
import { LoreSidebar } from "@/components/lore/loreSidebar";
import { LorePane } from "@/components/lore/lorePane";

export const coreLoreModule: ModuleContract = {
  id: "core.lore",
  name: "设定库",
  description: "官方重型模块：设定库文件树 + 力导向图/网格卡片编辑区。",
  kind: "heavy",
  enabled: true,
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
