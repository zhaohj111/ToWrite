// 宿主从插件注册表 + 插件实例读取 Activity Bar / 主视图 / 侧边栏的 React Hooks。
// v0.6：插件支持多实例（PluginInstance），视图 id 一律用实例 id，名称用实例自定义名。

import { useSyncExternalStore } from "react";
import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import { pluginRegistry } from "@/plugins/registry";
import { usePluginStore, type PluginInstance } from "@/stores/pluginStore";
import { useSettingsStore } from "@/stores/settingsStore";

export function useRegistryVersion(): number {
  return useSyncExternalStore(
    (cb) => pluginRegistry.subscribe(cb),
    () => pluginRegistry.getVersion(),
  );
}

/** 插件原型是否被应用级启停关闭（config.json pluginEnabled；缺省视为启用） */
function usePrototypeDisabled(prototypeId: string): boolean {
  return useSettingsStore((s) => s.prototypeEnabled[prototypeId] === false);
}

export interface ActivityItem {
  instanceId: string;
  prototypeId: string;
  /** Activity Bar 入口 id（= 实例 id） */
  id: string;
  label: string;
  icon: LucideIcon;
  sidebarId: string | null;
  mainViewId: string | null;
}

export interface MainViewItem {
  /** 主视图 id（= 实例 id），供 layoutStore.mainViewId 选中 */
  id: string;
  title: string;
  component: ComponentType;
  prototypeId: string;
  instanceId: string;
}

function getPrototype(prototypeId: string) {
  return pluginRegistry.getModule(prototypeId) ?? null;
}

/** 纯函数版活动栏条目计算：React Hook 与宿主 store（打开工程时）共用同一套实例→视图映射规则 */
export function computeActivityItems(
  instances: PluginInstance[],
  prototypeEnabled: Record<string, boolean>,
): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const inst of instances) {
    if (!inst.enabled) continue;
    if (prototypeEnabled[inst.prototypeId] === false) continue; // 原型被应用级禁用
    const proto = getPrototype(inst.prototypeId);
    const ab = proto?.views?.activityBar;
    if (!ab) continue;
    const hasSidebar =
      !!inst.sidebarViewId && !!proto.views?.sidebars?.some((s) => s.id === inst.sidebarViewId);
    const hasMain = !!proto.views?.mainView;
    items.push({
      instanceId: inst.id,
      prototypeId: inst.prototypeId,
      id: inst.id,
      label: inst.name,
      icon: ab.icon,
      sidebarId: hasSidebar ? inst.id : null,
      mainViewId: hasMain ? inst.id : null,
    });
  }
  return items;
}

/**
 * 由默认插件实例 id 解析「主视图 + 侧边栏」：目标实例没有主视图/侧栏时，
 * 回退活动栏自上而下第一个带主视图/侧栏的实例；都没有则返回 null（调用方自行回退 editor / 无侧栏）。
 * 打开工程与设置中修改默认主视图共用此规则，保证两者行为一致。
 */
export function resolveDefaultView(
  items: ActivityItem[],
  targetId: string,
): { mainViewId: string | null; sidebarId: string | null } {
  const target = items.find((it) => it.id === targetId);
  const mainItem =
    (target && target.mainViewId ? target : null) ?? items.find((it) => it.mainViewId) ?? null;
  const sidebarItem =
    (target && target.sidebarId ? target : null) ?? items.find((it) => it.sidebarId) ?? null;
  return {
    mainViewId: mainItem?.mainViewId ?? null,
    sidebarId: sidebarItem?.sidebarId ?? null,
  };
}

export function useActivityItems(): ActivityItem[] {
  useRegistryVersion();
  const instances = usePluginStore((s) => s.instances);
  const prototypeEnabled = useSettingsStore((s) => s.prototypeEnabled);
  return computeActivityItems(instances, prototypeEnabled);
}

export function useMainViews(): MainViewItem[] {
  useRegistryVersion();
  const instances = usePluginStore((s) => s.instances);
  const prototypeEnabled = useSettingsStore((s) => s.prototypeEnabled);
  const views: MainViewItem[] = [];
  for (const inst of instances) {
    if (!inst.enabled) continue;
    if (prototypeEnabled[inst.prototypeId] === false) continue; // 原型被应用级禁用
    const proto = getPrototype(inst.prototypeId);
    const mv = proto?.views?.mainView;
    if (!mv) continue;
    views.push({
      id: inst.id,
      title: inst.name,
      component: mv.component,
      prototypeId: inst.prototypeId,
      instanceId: inst.id,
    });
  }
  return views;
}

export function useSidebarView(sidebarId: string | null) {
  useRegistryVersion();
  const instances = usePluginStore((s) => s.instances);
  const prototypeEnabled = useSettingsStore((s) => s.prototypeEnabled);
  if (!sidebarId) return null;
  const inst = instances.find((i) => i.id === sidebarId);
  if (!inst || !inst.enabled || !inst.sidebarViewId) return null;
  if (prototypeEnabled[inst.prototypeId] === false) return null; // 原型被应用级禁用
  const proto = getPrototype(inst.prototypeId);
  const sb = proto?.views?.sidebars?.find((s) => s.id === inst.sidebarViewId);
  if (!sb) return null;
  return { id: inst.id, title: inst.name, component: sb.component };
}
