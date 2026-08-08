// 宿主从插件注册表 + 插件实例读取 Activity Bar / 主视图 / 侧边栏的 React Hooks。
// v0.6：插件支持多实例（PluginInstance），视图 id 一律用实例 id，名称用实例自定义名。

import { useSyncExternalStore } from "react";
import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import { pluginRegistry } from "@/plugins/registry";
import { usePluginStore } from "@/stores/pluginStore";

export function useRegistryVersion(): number {
  return useSyncExternalStore(
    (cb) => pluginRegistry.subscribe(cb),
    () => pluginRegistry.getVersion(),
  );
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

export function useActivityItems(): ActivityItem[] {
  useRegistryVersion();
  const instances = usePluginStore((s) => s.instances);
  const items: ActivityItem[] = [];
  for (const inst of instances) {
    if (!inst.enabled) continue;
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

export function useMainViews(): MainViewItem[] {
  useRegistryVersion();
  const instances = usePluginStore((s) => s.instances);
  const views: MainViewItem[] = [];
  for (const inst of instances) {
    if (!inst.enabled) continue;
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
  if (!sidebarId) return null;
  const inst = instances.find((i) => i.id === sidebarId);
  if (!inst || !inst.enabled || !inst.sidebarViewId) return null;
  const proto = getPrototype(inst.prototypeId);
  const sb = proto?.views?.sidebars?.find((s) => s.id === inst.sidebarViewId);
  if (!sb) return null;
  return { id: inst.id, title: inst.name, component: sb.component };
}
