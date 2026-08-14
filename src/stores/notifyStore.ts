// 窗口顶部结果提示（Toast）状态：宿主统一渲染（components/toasts.tsx）。
// 各插件的导出功能在成功 / 失败后经这里弹出提示；插件契约经 PluginContext.notify 暴露，
// 内部组件可直接使用 @/lib/notify 的助手函数。

import { create } from "zustand";

export type ToastKind = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  /** 副文本（如导出路径、错误详情），可选 */
  detail?: string;
  /** 导出文件路径：有值时成功提示显示「在文件夹中显示」按钮 */
  filePath?: string;
  /** 展示时长（毫秒）；0 = 常驻，不自动关闭 */
  durationMs: number;
}

export interface ToastInput {
  kind: ToastKind;
  message: string;
  detail?: string;
  filePath?: string;
  durationMs?: number;
}

/** 各类型默认展示时长：错误停留更久，便于阅读报错详情 */
const DEFAULT_DURATION_MS: Record<ToastKind, number> = {
  success: 4200,
  info: 4200,
  error: 8000,
};

/** 同屏最多保留的提示条数，超出时丢弃最早的一条 */
const MAX_TOASTS = 5;

interface NotifyState {
  toasts: ToastItem[];
  push: (input: ToastInput) => number;
  dismiss: (id: number) => void;
}

let nextToastId = 1;

export const useNotifyStore = create<NotifyState>((set) => ({
  toasts: [],

  push: (input) => {
    const id = nextToastId++;
    const durationMs = input.durationMs ?? DEFAULT_DURATION_MS[input.kind];
    set((s) => {
      const next = [...s.toasts, { ...input, id, durationMs }];
      return { toasts: next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next };
    });
    if (durationMs > 0) {
      window.setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      }, durationMs);
    }
    return id;
  },

  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
