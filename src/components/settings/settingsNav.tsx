// 设置导航：一级分类栏始终同时展示全部分类（应用/插件/工程/AI/关于），
// 点击分类 → 右侧抽屉滑入该分类下的二级页面导航（取代原先的下拉切换）。
// 工程作用域分组/页面在无工程打开时灰置；AI 占位分组整体灰置（v0.7）。

import {
  AppWindow,
  ChevronRight,
  FolderKanban,
  Info,
  Puzzle,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { SETTINGS_GROUPS, type SettingsPageContribution } from "@/types/settings";
import { cn } from "@/lib/cn";

const GROUP_ICONS: Record<string, LucideIcon> = {
  app: AppWindow,
  plugin: Puzzle,
  project: FolderKanban,
  ai: Sparkles,
  about: Info,
};

export function SettingsNav({
  group,
  hasProject,
  pages,
  activePageId,
  onNavigate,
}: {
  group: string;
  hasProject: boolean;
  pages: SettingsPageContribution[];
  activePageId: string | null;
  onNavigate: (group: string, pageId: string) => void;
}) {
  const groupDef = SETTINGS_GROUPS.find((g) => g.id === group);
  const groupPages = pages.filter((p) => p.group === group);
  const groupDisabled = (g: (typeof SETTINGS_GROUPS)[number]) =>
    (g.scope === "project" && !hasProject) || !!g.placeholder;
  const pageDisabled = (p: SettingsPageContribution) => p.scope === "project" && !hasProject;
  const pageCount = (gid: string) => pages.filter((p) => p.group === gid).length;

  const firstSelectable = (gid: string) =>
    pages.find((p) => p.group === gid && !pageDisabled(p))?.id ?? "";

  const selectGroup = (gid: string) => {
    if (gid === group) return; // 已在此分类：保持当前页面不重跳
    onNavigate(gid, firstSelectable(gid));
  };

  return (
    <div className="flex h-full">
      {/* 一级：分类栏（全部同时展示） */}
      <div className="flex w-56 shrink-0 flex-col border-r border-line/60 py-4">
        <div className="px-4 pb-2 text-xs font-semibold tracking-[0.2em] text-fg-muted/70">
          分类
        </div>
        <nav className="flex flex-col gap-1 px-2">
          {SETTINGS_GROUPS.map((g) => {
            const Icon = GROUP_ICONS[g.id] ?? Puzzle;
            const disabled = groupDisabled(g);
            const active = g.id === group;
            return (
              <button
                key={g.id}
                disabled={disabled}
                onClick={() => selectGroup(g.id)}
                className={cn(
                  "group flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all",
                  active
                    ? "bg-accent/10 font-medium text-accent shadow-[inset_3px_0_0_var(--color-accent)]"
                    : "text-fg-muted hover:bg-hover hover:text-fg",
                  disabled &&
                    "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-fg-muted",
                )}
              >
                <Icon className="size-[18px] shrink-0" />
                <span className="min-w-0 flex-1 truncate text-[15px]">{g.title}</span>
                <span className="shrink-0 text-xs tabular-nums text-fg-muted/70">
                  {pageCount(g.id)}
                </span>
                {g.placeholder && (
                  <span className="shrink-0 rounded border border-line px-1 text-[10px] text-fg-muted">
                    v0.7
                  </span>
                )}
                <ChevronRight
                  className={cn(
                    "size-4 shrink-0 transition-transform",
                    active ? "text-accent" : "text-fg-muted/50 group-hover:text-fg-muted",
                  )}
                />
              </button>
            );
          })}
        </nav>
      </div>

      {/* 二级：抽屉（随分类切换以 key 重播滑入动画） */}
      <div
        key={group}
        className="anim-drawer flex w-60 shrink-0 flex-col border-r border-line/60 bg-panel py-4"
      >
        <div className="px-4 pb-2">
          <div className="text-[11px] uppercase tracking-[0.2em] text-fg-muted/70">分类</div>
          <div className="mt-0.5 text-lg font-semibold text-fg-strong">
            {groupDef?.title ?? "设置"}
          </div>
        </div>
        <nav className="flex flex-col gap-1 px-2">
          {groupPages.length === 0 ? (
            <div className="px-3 py-2 text-sm text-fg-muted">该分类暂无页面</div>
          ) : (
            groupPages.map((p) => (
              <button
                key={p.id}
                disabled={pageDisabled(p)}
                onClick={() => onNavigate(group, p.id)}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[15px] transition-all",
                  p.id === activePageId
                    ? "bg-accent/12 font-medium text-accent"
                    : "text-fg-muted hover:bg-hover hover:text-fg",
                  pageDisabled(p) &&
                    "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-fg-muted",
                )}
              >
                <span className="truncate">{p.title}</span>
                {pageDisabled(p) && (
                  <span className="ml-auto shrink-0 text-[11px] text-fg-muted">需工程</span>
                )}
              </button>
            ))
          )}
        </nav>
      </div>
    </div>
  );
}
