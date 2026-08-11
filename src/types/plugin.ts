// 模块契约（Module Contract）与贡献点（Contribution Point）骨架 —— v0.5 冻结 / v0.6 扩展。

import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import type { Editor } from "@tiptap/react";
import type { SettingsPageContribution } from "@/types/settings";

export type ContributionPoint =
  | "editor.toolbar"
  | "editor.commands"
  | "editor.hoverActions"
  | "editor.blockTypes"
  | "sidebar.views"
  | "theme"
  | "i18n.resources"
  | "settings.pages";

export interface EditorContext {
  editor: Editor;
}

export interface ToolbarItem {
  id: string;
  title: string;
  icon: LucideIcon;
  action: (ctx: EditorContext) => void;
  isActive?: (ctx: EditorContext) => boolean;
  divider?: boolean;
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
