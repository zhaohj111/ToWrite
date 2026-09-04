// core.editor —— 操作指引数据（工具栏「?」按钮共用；编辑器无画布空态卡）。
// 展示组件为通用实现（components/ui/quickGuide），本文件只声明插件自身的文案与跳转目标。
// 内容随编辑器工具栏分组简述：撤销重做 / 文字格式 / 段落结构 / 内容插入与导入导出。

import { List, Quote, Redo2, Table2, TextCursorInput } from "lucide-react";
import type { QuickGuideData } from "@/components/ui/quickGuide";

export const editorGuide: QuickGuideData = {
  prototypeId: "core.editor",
  title: "工具栏快速指南",
  subtitle: "常用格式与插入，一项一按钮",
  steps: [
    { icon: Redo2, text: "撤销 / 重做：改错随时回退（Ctrl+Z / Ctrl+Shift+Z）" },
    { icon: TextCursorInput, text: "文字格式：加粗 / 斜体 / 删除线，标题 1 / 2 / 3" },
    { icon: List, text: "段落结构：无序 / 有序列表、引用、代码块" },
    { icon: Table2, text: "内容插入：图片、表格；导入 / 导出（当前或全部章节 → TXT / Markdown / PDF）" },
    { icon: Quote, text: "更多：清空格式、插入分隔线、引用选中" },
  ],
  footerHint: "更多格式与导入导出",
};