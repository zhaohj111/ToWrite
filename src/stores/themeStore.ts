// 主题状态：纸白（浅）/ 墨夜（深）。独立于 layoutStore（布局契约冻结，主题属外观态）。
// 持久化复用 settings.ts（Tauri 落 config.json / 浏览器落 localStorage）。

import { create } from "zustand";
import { getSetting, setSetting } from "@/lib/settings";

export type ThemeMode = "paper" | "ink";

interface ThemeState {
  mode: ThemeMode;
  init: () => Promise<void>;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

function applyMode(mode: ThemeMode) {
  document.documentElement.classList.toggle("dark", mode === "ink");
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: "paper",

  init: async () => {
    const mode = await getSetting<ThemeMode>("theme", "paper");
    set({ mode });
    applyMode(mode);
  },

  setMode: (mode) => {
    set({ mode });
    applyMode(mode);
    void setSetting("theme", mode);
  },

  toggle: () => {
    get().setMode(get().mode === "paper" ? "ink" : "paper");
  },
}));
