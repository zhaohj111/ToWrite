// core.lore —— 操作指引数据（工具栏「?」按钮与画布空态卡共用）。
// 展示组件为通用实现（components/guides/quickGuide），本文件只声明插件自身的文案与跳转目标。

import { Grid3x3, Link2, PenLine, Plus } from "lucide-react";
import type { QuickGuideData } from "@/components/ui/quickGuide";

export const loreGuide: QuickGuideData = {
  prototypeId: "core.lore",
  title: "构建你的设定世界",
  subtitle: "新建卡片、连线关系，双视图组织设定",
  steps: [
    { icon: Plus, text: "右键空白，点击「新建」创建卡片，弹出编辑器填写标题与内容" },
    { icon: PenLine, text: "双击卡片再次编辑；右键卡片：编辑 / 连接 / 快速连接 / 删除" },
    { icon: Link2, text: "右键「连接…」再点目标卡片建立关系；双击连线改关系名" },
    { icon: Grid3x3, text: "工具栏切换 网格 / 连接图；标签筛选与搜索组合过滤" },
  ],
  footerHint: "标签筛选、导出与更多",
};
