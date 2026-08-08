// 时间轴主视图的轻量 UI 状态（不持久化，仅本会话）。
// 供主区工具栏与时间轴画布共享：右上角图例是否显示、实例「当前使用颜色」。
// 当前使用颜色 = 新建标签 / 替换颜色时使用的默认色，在「颜色管理」面板中选取。

import { create } from "zustand";

interface TimelineUiState {
  /** 右上角颜色图例是否显示 */
  legendVisible: boolean;
  setLegendVisible: (visible: boolean) => void;
  /** 插件实例 id -> 当前使用颜色 */
  currentColors: Record<string, string>;
  /** 设置某实例的当前使用颜色 */
  setCurrentColor: (instanceId: string, color: string) => void;
}

export const useTimelineUiStore = create<TimelineUiState>((set) => ({
  legendVisible: true,
  setLegendVisible: (visible) => set({ legendVisible: visible }),
  currentColors: {},
  setCurrentColor: (instanceId, color) =>
    set((s) => ({ currentColors: { ...s.currentColors, [instanceId]: color } })),
}));
