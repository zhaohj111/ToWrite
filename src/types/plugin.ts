// 模块契约（Module Contract）与贡献点（Contribution Point）骨架 —— v0.5 冻结 / v0.6 扩展。

import type { ComponentType, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { Editor } from "@tiptap/react";
import type { SettingsPageContribution } from "@/types/settings";

export type ContributionPoint =
  | "editor.toolbar"
  | "editor.commands"
  | "editor.hoverActions"
  | "editor.blockTypes"
  | "timeline.toolbar"
  | "lore.toolbar"
  | "sidebar.views"
  | "theme"
  | "i18n.resources"
  | "settings.pages";

export interface EditorContext {
  editor: Editor;
  /** 当前编辑器实例 id（core.editor 插件实例，用于实例级设置读写） */
  instanceId: string;
}

/** 工具栏下拉菜单项（v0.7：导出/导入/表格等多项操作收进菜单）。
 *  带 children 时渲染为二级子菜单（DropdownMenuSub），run 可省略。 */
export interface ToolbarMenuItem {
  title: string;
  icon?: LucideIcon;
  danger?: boolean;
  run?: (ctx: EditorContext) => void;
  children?: ToolbarMenuItem[];
}

export interface ToolbarItem {
  id: string;
  title: string;
  icon: LucideIcon;
  action: (ctx: EditorContext) => void;
  isActive?: (ctx: EditorContext) => boolean;
  divider?: boolean;
  /** 有值时渲染为下拉菜单（点图标展开），而非直接执行 action */
  menu?: ToolbarMenuItem[];
  /** 自定义内联渲染（优先于 icon/action/menu），可嵌入取色块等交互组件 */
  render?: (ctx: EditorContext) => ReactNode;
  /**
   * 显示开关分组：对应 core.editor 设置里的 toolbar* 布尔项（如 toolbarImage）。
   * 工具栏按 resolveSetting(EDITOR_PROTOTYPE, instanceId, groupId) 过滤，false 时隐藏。
   */
  groupId?: string;
}

/**
 * 视图工具栏上下文（时间轴/设定库等非编辑器主视图的工具行动作参数）：
 * 由宿主（MainArea）注入当前实例 id、状态与回调，贡献条目据此渲染与执行。
 */
export interface ViewToolbarContext {
  /** 当前插件实例 id */
  instanceId: string;
  /** 打开宿主浮层面板（timeline: legend / assoc；lore: tags） */
  openPanel: (panel: "legend" | "tags" | "assoc") => void;
  /** 当前打开的宿主面板（供 isActive 判断） */
  openPanelId?: string | null;
  /** 时间轴：图例显隐状态 / 当前使用颜色 */
  legendVisible?: boolean;
  currentColor?: string;
  /** 设定库：当前实际布局（含强制网格规则）/ 连线与关系文本颜色 */
  layout?: "graph" | "grid";
  edgeColor?: string;
  edgeLabelColor?: string;
  onSetEdgeColor?: (color: string) => void;
  onSetEdgeLabelColor?: (color: string) => void;
  /** 设定库：切换布局（宿主按实际规则执行并回注 layout） */
  onToggleLayout?: () => void;
}

/** 视图工具栏条目（与编辑器工具栏同构，但上下文为实例级宿主服务） */
export interface ViewToolbarItem {
  id: string;
  title: string;
  icon?: LucideIcon;
  divider?: boolean;
  isActive?: (ctx: ViewToolbarContext) => boolean;
  /** 自定义内联渲染（优先于 icon/action），可嵌入色块等交互组件 */
  render?: (ctx: ViewToolbarContext) => ReactNode;
  action?: (ctx: ViewToolbarContext) => void;
  /** 显示开关分组：对应设置项布尔值（resolveSetting 取 false 时隐藏），同编辑器工具栏 */
  groupId?: string;
}
export interface CommandItem {
  id: string;
  title: string;
  keywords: string[];
  run: (ctx: EditorContext) => void;
}

export interface HoverAction {
  id: string;
  title: string;
  icon: LucideIcon;
  run: (ctx: EditorContext) => void;
}

export interface BlockType {
  name: string;
  title: string;
}

export interface SidebarViewContribution {
  id: string;
  title: string;
  component: ComponentType;
}

export interface ThemeContribution {
  id: string;
  name: string;
  colors: Record<string, string>;
}

export interface I18nResourceContribution {
  locale: string;
  resources: Record<string, string>;
}

export interface ContributionMap {
  "editor.toolbar": ToolbarItem;
  "editor.commands": CommandItem;
  "editor.hoverActions": HoverAction;
  "editor.blockTypes": BlockType;
  "timeline.toolbar": ViewToolbarItem;
  "lore.toolbar": ViewToolbarItem;
  "sidebar.views": SidebarViewContribution;
  "theme": ThemeContribution;
  "i18n.resources": I18nResourceContribution;
  "settings.pages": SettingsPageContribution;
}

export type ContributionOf<P extends ContributionPoint> = ContributionMap[P];

export interface ModuleViews {
  /** Activity Bar 入口（宿主据此渲染图标；实际 id/名称由插件实例决定） */
  activityBar?: { id: string; label: string; icon: LucideIcon };
  /** 该原型可提供的侧边栏变体：插件实例通过 sidebarViewId 选择其一 */
  sidebars?: SidebarViewContribution[];
  /** 主区域视图（宿主以标签页形式呈现；实际 id/名称由插件实例决定） */
  mainView?: { id: string; title: string; component: ComponentType };
}

export interface PluginContext {
  registerContribution<P extends ContributionPoint>(
    point: P,
    contribution: ContributionOf<P>,
  ): void;
  /**
   * 宿主服务：窗口顶部结果提示（如导出成功/失败）。
   * kind 缺省 info；detail 显示为副文本；filePath 有值时成功提示带「在文件夹中显示」按钮。
   */
  notify(message: string, options?: NotifyOptions): void;
}

/** PluginContext.notify 的可选项 */
export interface NotifyOptions {
  kind?: "success" | "error" | "info";
  detail?: string;
  filePath?: string;
}

/** 插件设置项出厂定义（级联第 ③ 层默认值）；instances 是否可覆盖由 instanceOverridable 声明 */
export interface SettingFieldDef {
  /** 出厂默认值 */
  default: unknown;
  label: string;
  type: "number" | "boolean" | "select" | "string" | "color";
  /** 是否允许逐实例覆盖；自动保存间隔等整工程语义的设置设为 false */
  instanceOverridable?: boolean;
  options?: { label: string; value: string }[];
  min?: number;
  max?: number;
  step?: number;
}

/** 更新日志条目（官方模块内置；v1.0 随市场拉取） */
export interface ChangelogEntry {
  version: string;
  date: string;
  notes: string[];
}

/** 重型模块插件契约：官方提供、可选择性启用；第三方实现同一接口即可替换。 */
export interface ModuleContract {
  id: string;
  name: string;
  /** 短描述（详情页摘要 / 列表展示；详情正文见 readme） */
  description: string;
  /** core = 应用核心（core.config，不可启停/不可替换）；heavy/light 为可管理模块 */
  kind: "core" | "heavy" | "light";
  enabled: boolean;
  /** 插件设置出厂默认（级联第 ③ 层） */
  settings?: Record<string, SettingFieldDef>;
  /** 作者 / 版本（已安装插件详情页展示） */
  author?: string;
  version?: string;
  /**
   * 完整详情：Markdown 源文（Vite `?raw` 导入，如 README.md）。
   * 有值时详情 tab 渲染为富文本，缺省回退展示 description。
   */
  readme?: string;
  /**
   * 操作说明：Markdown 源文（Vite `?raw` 导入，如 GUIDE.md）。
   * 有值时「操作说明」tab 渲染为富文本（详情 tab 展示 readme 宣传内容）。
   */
  guideMd?: string;
  /** 版本历史（结构化条目） */
  changelog?: ChangelogEntry[];
  /**
   * 更新日志 Markdown 源文（Vite `?raw` 导入，如 CHANGELOG.md）。
   * 与 changelog 二选一，有值时优先渲染为富文本。
   */
  changelogMd?: string;
  views?: ModuleViews;
  activate(ctx: PluginContext): void | (() => void);
}
