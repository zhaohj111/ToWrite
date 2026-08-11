// 设置全屏视图：以 settings.pages 贡献点为目录树数据源，顶栏（返回/标题/全局搜索/分组下拉）
// + 左子导航 + 右内容区；面包屑来自当前页面 path。工程作用域页面在无工程时灰置不可达。

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { pluginRegistry } from "@/plugins/registry";
import { useRegistryVersion } from "@/plugins/hooks";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type { SettingsPageContribution } from "@/types/settings";
import { SettingsNav } from "@/components/settings/settingsNav";
import { SettingsSearch } from "@/components/settings/settingsSearch";
import { SettingsItem } from "@/components/settings/settingsItem";
import { SettingsNavContext } from "@/components/settings/settingsNavContext";

export function SettingsPage() {
  // 订阅贡献注册表版本（settings.pages 由插件动态注册/更新时刷新目录树）
  useRegistryVersion();
  const hasProject = !!useWorkspaceStore((s) => s.project);
  const closeSettings = useWorkspaceStore((s) => s.closeSettings);

  const [group, setGroup] = useState("app");
  const [pageId, setPageId] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);

  // 插件自有设置页（prototypeId）只在该插件详情的「配置」tab 内展示，不进分类导航与搜索
  const pages = (
    pluginRegistry.getContributions("settings.pages") as SettingsPageContribution[]
  ).filter((p) => !p.prototypeId);
  const groupPages = pages.filter((p) => p.group === group);
  const pageDisabled = (p: SettingsPageContribution) => p.scope === "project" && !hasProject;
  const selectable = groupPages.filter((p) => !pageDisabled(p));
  // 选中页：优先保留用户选择；选择的是灰置页或已不存在时回退分组内第一个可用页
  const activePage =
    selectable.find((p) => p.id === pageId) ?? selectable[0] ?? groupPages[0];

  const navigate = (g: string, p: string) => {
    setGroup(g);
    setPageId(p);
    setFocusKey(null);
  };

  /** 搜索结果点击：跳到对应分组/页面，并让该项滚动到可视区 + 高亮 */
  const searchPick = (page: SettingsPageContribution, itemId: string) => {
    setGroup(page.group);
    setPageId(page.id);
    setFocusKey(`${page.id}:${itemId}`);
  };

  return (
    <div className="settings-surface flex h-full flex-col bg-panel">
      {/* ===== 顶栏：返回 / 标题 / 全局搜索 ===== */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line/60 px-4">
        <button
          onClick={closeSettings}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-fg-muted transition-colors hover:bg-hover hover:text-fg"
        >
          <ArrowLeft className="size-4" /> 返回
        </button>
        <span className="h-4 w-px bg-line" />
        <span className="text-[15px] font-semibold text-fg-strong">设置</span>
        <div className="flex-1" />
        <SettingsSearch onPick={searchPick} />
      </div>

      {/* ===== 主体：分类栏 + 抽屉 + 右内容区 ===== */}
      <div className="flex min-h-0 flex-1">
        <SettingsNav
          group={group}
          hasProject={hasProject}
          pages={pages}
          activePageId={activePage?.id ?? null}
          onNavigate={navigate}
        />

        <div className="hidden-scrollbar min-h-0 flex-1 overflow-y-auto">
          {activePage ? (
            <>
              {/* 面包屑 + 页头 */}
              <div className="border-b border-line/50 px-8 py-4">
                <div className="text-xs text-fg-muted">{activePage.path}</div>
                <h2 className="mt-1 font-display text-xl font-semibold text-fg-strong">
                  {activePage.title}
                </h2>
              </div>
              {/* 页面内容：自定义布局组件（可经 SettingsNavContext 跳转其他页面），或按 items 自动渲染 */}
              <div className="px-8 py-6">
                <SettingsNavContext.Provider value={{ navigate }}>
                  {activePage.component ? (
                    <activePage.component />
                  ) : (
                    <div className="flex max-w-3xl flex-col divide-y divide-line/50">
                      {activePage.items.map((item) => (
                        <SettingsItem
                          key={item.id}
                          item={item}
                          focused={focusKey === `${activePage.id}:${item.id}`}
                          onFocusDone={() => setFocusKey(null)}
                        />
                      ))}
                    </div>
                  )}
                </SettingsNavContext.Provider>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-fg-muted">
              当前分类暂无可用设置页面
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
