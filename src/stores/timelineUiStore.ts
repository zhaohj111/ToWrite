// 时间轴主视图的轻量 UI 状态（视图类状态仅本会话）。
// 供主区工具栏与时间轴画布共享：右上角图例是否显示、实例「当前使用颜色」。
// 当前使用颜色 = 新建标签 / 替换颜色时使用的默认色，在「颜色管理」面板中选取。
// 「当前使用颜色」按工程隔离：随工程写入 settingsStore.instanceSettings（project-config.json），
// 打开工程时由 projectStore 读回（restoreProjectColors），关闭工程时 reset 清空。

import { create } from "zustand";
import { useSettingsStore } from "@/stores/settingsStore";

interface TimelineUiState {
  /** 右上角颜色图例是否显示 */
  legendVisible: boolean;
  setLegendVisible: (visible: boolean) => void;
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
  legendVisible: true,
  setLegendVisible: (visible) => set({ legendVisible: visible }),
  currentColors: {},
  setCurrentColor: (instanceId, color) => {
    set((s) => ({ currentColors: { ...s.currentColors, [instanceId]: color } }));
    // 写入实例设置（settingsStore 已订阅 saveController → 随工程落盘）
    useSettingsStore.getState().setInstanceSetting(instanceId, "currentColor", color);
  },
  loadProject: (colors) => set({ currentColors: colors }),
  reset: () => set({ currentColors: {} }),
}));
