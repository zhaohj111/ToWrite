// 模块契约（Module Contract）与贡献点（Contribution Point）骨架 —— v0.5 冻结。

import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import type { Editor } from "@tiptap/react";

export type ContributionPoint =
  | "editor.toolbar"
  | "editor.commands"
  | "editor.hoverActions"
  | "editor.blockTypes"
  | "sidebar.views"
  | "theme"
  | "i18n.resources";

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

/** 重型模块插件契约：官方提供、可选择性启用；第三方实现同一接口即可替换。 */
export interface ModuleContract {
  id: string;
  name: string;
  description: string;
  kind: "heavy" | "light";
  enabled: boolean;
  views?: ModuleViews;
  activate(ctx: PluginContext): void | (() => void);
}
