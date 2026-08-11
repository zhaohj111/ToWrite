// 设置体系类型：settings.pages 贡献契约 + 顶级分组定义。
// v0.6：设置目录树以 settings.pages 为唯一数据源，每个设置项携带搜索元数据
// { title, keywords, path, scope }，path 即面包屑（如「应用 > 通用与启动」）。

import type { ComponentType, ReactNode } from "react";

/** 设置项作用域：应用级 / 工程级 / 插件自有用例 */
export type SettingScope = "app" | "project" | "plugin";

/** 设置项内容布局：row = 标题与控件同一横排（默认）；stack = 标题在上、控件独占整行 */
export type SettingItemLayout = "row" | "stack";

/** 单个设置项：携带搜索元数据，render 内联渲染控件（页面内与搜索结果复用） */
export interface SettingItemMeta {
  id: string;
  title: string;
  description?: string;
  /** 搜索关键词（全局搜索对 title + keywords + path 各段匹配） */
  keywords: string[];
  scope: SettingScope;
  /** 面包屑路径，如「应用 > 通用与启动」 */
  path: string;
  /** 内联渲染该设置项的控件 */
  render: () => ReactNode;
  /**
   * 控件布局。多行/多元素控件（快捷键列表、统计卡、元数据清单等）用 stack：
   * 标题与描述占一行、控件独占下方整行，避免全部挤在单横栏。
   */
  layout?: SettingItemLayout;
}

/** settings.pages 贡献：一个设置页面 = 若干设置项（或自定义布局组件） */
export interface SettingsPageContribution {
  /** 页面 id（稳定持久），如 app.general */
  id: string;
  /** 页面标题，如「通用与启动」 */
  title: string;
  /** 顶级分组 id：应用 / 插件 / 工程 / AI / 关于 */
  group: string;
  path: string;
  scope: SettingScope;
  /** 插件自有的设置页：仅在插件详情「配置」tab 内展示，不进下拉导航（无值 = 应用核心页） */
  prototypeId?: string;
  /** 设置项列表：全局搜索索引 + 页面内容（缺省 component 时自动渲染） */
  items: SettingItemMeta[];
  /** 自定义布局页（插件管理双栏用）；缺省时按 items 渲染 */
  component?: ComponentType;
}

/** 顶级分组定义（下拉导航） */
export interface SettingsGroupDef {
  id: string;
  title: string;
  /** 作用域为 project 的分组在无工程打开时灰置 */
  scope: SettingScope;
  /** 占位分组（AI，v0.7 实现）：整体灰置 */
  placeholder?: boolean;
}

export const SETTINGS_GROUPS: SettingsGroupDef[] = [
  { id: "app", title: "应用", scope: "app" },
  { id: "plugin", title: "插件", scope: "app" },
  { id: "project", title: "工程", scope: "project" },
  { id: "ai", title: "AI", scope: "app", placeholder: true },
  { id: "about", title: "关于", scope: "app" },
];

/** 从完整 path（如「应用 > 通用与启动」）取顶级分组 id */
export function groupOf(path: string): string {
  const first = path.split(">")[0]?.trim() ?? "";
  return SETTINGS_GROUPS.find((g) => g.title === first)?.id ?? "app";
}

/** 显示键位：["mod+r"] → "Ctrl + R"；双键序列 "mod+a v" → "Ctrl + A → V"（空格分隔的组合键用箭头串接） */
export function formatKeys(keys: string[]): string {
  if (keys.length === 0) return "—";
  return keys
    .map((k) =>
      k
        .toLowerCase()
        .split(" ")
        .filter(Boolean)
        .map((chord) =>
          chord
            .split("+")
            .map((p) =>
              p === "mod"
                ? "Ctrl"
                : p === "shift"
                  ? "Shift"
                  : p === "alt"
                    ? "Alt"
                    : p === "meta"
                      ? "Cmd"
                      : p.length === 1
                        ? p.toUpperCase()
                        : p.charAt(0).toUpperCase() + p.slice(1),
            )
            .join(" + "),
        )
        .join(" → "),
    )
    .join(" / ");
}
