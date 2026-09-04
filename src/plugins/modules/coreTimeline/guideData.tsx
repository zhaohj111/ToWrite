// core.timeline —— 操作指引数据（工具栏「?」按钮与画布空态卡共用）。
// 展示组件为通用实现（components/guides/quickGuide），本文件只声明插件自身的文案与跳转目标。

import { Link2, MousePointerClick, Move, PenLine } from "lucide-react";
import type { QuickGuideData } from "@/components/ui/quickGuide";

export const timelineGuide: QuickGuideData = {
  prototypeId: "core.timeline",
  title: "从第一个标签开始",
  subtitle: "右键空白处新建标签，拖拽串联故事脉络",
  steps: [
    { icon: MousePointerClick, text: "画布空白处右键 → 新建标签，自动使用当前颜色并可直接输入名称" },
    { icon: Move, text: "拖拽标签移动位置；按住拖动可框选多个标签批量操作" },
    { icon: PenLine, text: "标签上右键改名 / 换色 / 删除，双击快速改名" },
    { icon: Link2, text: "工具栏「关联管理」把标签关联到设定库卡片" },
  ],
  footerHint: "时间区间、导出与更多",
};
