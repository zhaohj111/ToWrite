// 时间轴主视图的轻量 UI 状态。
// 供主区工具栏与时间轴画布共享：实例「当前使用颜色」；图例 / 浏览滑动条的显隐开关。
// 「当前使用颜色」按工程隔离：随工程写入 settingsStore.instanceSettings（project-config.json），
// 打开工程时由 projectStore 读回（restoreProjectColors），关闭工程时 reset 清空。
// 「图例显隐」「滑动条显隐」同为工程级：写入实例设置（见下方 resolve/set 帮助函数），
// 无实例覆盖时回落到插件设置里的默认值（legendDefault / scrollbarDefault）。

import { create } from "zustand";
import { resolveSetting, useSettingsStore } from "@/stores/settingsStore";
import { TIMELINE_PROTOTYPE } from "@/stores/pluginStore";

interface TimelineUiState {
  /** 插件实例 id -> 当前使用颜色 */
  currentColors: Record<string, string>;
  /** 设置某实例的当前使用颜色（随工程持久化，工程隔离） */
  setCurrentColor: (instanceId: string, color: string) => void;
  /** 打开工程：从工程持久化颜色恢复 */
  loadProject: (colors: Record<string, string>) => void;
  /** 关闭工程：清空当前颜色（避免泄漏到下一工程） */
  reset: () => void;
}

export const useTimelineUiStore = create<TimelineUiState>((set) => ({
  currentColors: {},
  setCurrentColor: (instanceId, color) => {
    set((s) => ({ currentColors: { ...s.currentColors, [instanceId]: color } }));
    // 写入实例设置（settingsStore 已订阅 saveController → 随工程落盘）
    useSettingsStore.getState().setInstanceSetting(instanceId, "currentColor", color);
  },
  loadProject: (colors) => set({ currentColors: colors }),
  reset: () => set({ currentColors: {} }),
}));

// —— 工程级布尔开关（实例设置，随 project-config.json 落盘）——
// 取值：实例覆盖 > 插件设置里的默认值（defaultKey）> 出厂默认 true。
const KEY_LEGEND_VISIBLE = "legendVisible";
const KEY_SCROLLBAR_VISIBLE = "scrollbarVisible";

/** 读实例布尔开关 */
function resolveInstanceFlag(instanceId: string, key: string, defaultKey: string): boolean {
  const st = useSettingsStore.getState();
  const override = st.getInstanceSetting(instanceId, key);
  if (override !== undefined) return override !== false;
  return resolveSetting(TIMELINE_PROTOTYPE, instanceId, defaultKey) !== false;
}

/** 写实例布尔开关（settingsStore 已订阅 saveController → 随工程落盘） */
function setInstanceFlag(instanceId: string, key: string, value: boolean): void {
  useSettingsStore.getState().setInstanceSetting(instanceId, key, value);
}

/** 颜色图例当前是否显示（工具栏开关 > 设置「默认图例显示状态」） */
export function resolveTimelineLegendVisible(instanceId: string): boolean {
  return resolveInstanceFlag(instanceId, KEY_LEGEND_VISIBLE, "legendDefault");
}

/** 设置颜色图例显示状态（按工程持久化） */
export function setTimelineLegendVisible(instanceId: string, visible: boolean): void {
  setInstanceFlag(instanceId, KEY_LEGEND_VISIBLE, visible);
}

/** 浏览滑动条当前是否显示（工具栏开关 > 设置「默认滑动条显示状态」） */
export function resolveTimelineScrollbarVisible(instanceId: string): boolean {
  return resolveInstanceFlag(instanceId, KEY_SCROLLBAR_VISIBLE, "scrollbarDefault");
}

/** 设置浏览滑动条显示状态（按工程持久化） */
export function setTimelineScrollbarVisible(instanceId: string, visible: boolean): void {
  setInstanceFlag(instanceId, KEY_SCROLLBAR_VISIBLE, visible);
}
