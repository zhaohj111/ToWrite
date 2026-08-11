// 应用 > 外观与界面：主题、界面缩放。
// 默认主视图已移到工程作用域（工程 > 视图与布局，见 coreConfig），此处仍导出供其复用。

import { SettingSelect } from "@/components/settings/controls";
import { cn } from "@/lib/cn";
import { computeActivityItems, resolveDefaultView, useMainViews } from "@/plugins/hooks";
import { useLayoutStore } from "@/stores/layoutStore";
import { usePluginStore } from "@/stores/pluginStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useThemeStore, type ThemeMode } from "@/stores/themeStore";

/** 主题：纸白（浅色）/ 墨夜（深色） */
export function ThemeControl() {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  return (
    <div className="flex overflow-hidden rounded-lg border border-line">
      {(["paper", "ink"] as ThemeMode[]).map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          className={cn(
            "px-4 py-2 text-[15px] transition-all",
            mode === m
              ? "bg-accent/15 font-medium text-accent shadow-[inset_0_-2px_0_var(--color-accent)]"
              : "text-fg-muted hover:bg-hover hover:text-fg",
          )}
        >
          {m === "paper" ? "纸白（浅色）" : "墨夜（深色）"}
        </button>
      ))}
    </div>
  );
}

/** 界面缩放档位 */
export function ZoomControl() {
  const zoom = useLayoutStore((s) => s.zoom);
  const setZoom = useLayoutStore((s) => s.setZoom);
  const levels = [90, 100, 120, 150];
  return (
    <div className="flex overflow-hidden rounded-lg border border-line">
      {levels.map((z) => (
        <button
          key={z}
          onClick={() => setZoom(z)}
          className={cn(
            "px-4 py-2 font-mono text-[15px] transition-all",
            zoom === z
              ? "bg-accent/15 font-medium text-accent shadow-[inset_0_-2px_0_var(--color-accent)]"
              : "text-fg-muted hover:bg-hover hover:text-fg",
          )}
        >
          {z}%
        </button>
      ))}
    </div>
  );
}

/**
 * 默认主视图：候选来自可用主视图（无工程时回退模板实例）。
 * 切换时侧边栏与主视图一并改为该实例；无侧栏时回退活动栏第一个带侧栏的实例
 * （与打开工程时 projectStore 的解析规则一致，见 resolveDefaultView）。
 */
export function MainViewControl() {
  const views = useMainViews();
  const mainViewId = useLayoutStore((s) => s.mainViewId);
  const setMainView = useLayoutStore((s) => s.setMainView);
  const setSidebar = useLayoutStore((s) => s.setSidebar);
  const valid = views.find((v) => v.id === mainViewId) ? mainViewId : views[0]?.id ?? "editor";
  return (
    <SettingSelect
      value={valid}
      onChange={(id) => {
        setMainView(id);
        const items = computeActivityItems(
          usePluginStore.getState().instances,
          useSettingsStore.getState().prototypeEnabled,
        );
        setSidebar(resolveDefaultView(items, id).sidebarId);
      }}
      options={views.map((v) => ({ label: v.title, value: v.id }))}
    />
  );
}
