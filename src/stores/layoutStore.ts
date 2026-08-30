// 布局状态：Activity Bar 侧边栏切换、主区域视图、UI 缩放。

import { create } from "zustand";
import { getSetting, setSetting } from "@/lib/settings";

export const ZOOM_LEVELS = [90, 100, 120, 150];

/** 侧边栏宽度（应用级 UI 偏好，随 zoom 存 config.json）；拖右边界调整 */
export const DEFAULT_SIDEBAR_WIDTH = 300;
export const MIN_SIDEBAR_WIDTH = 200;
export const MAX_SIDEBAR_WIDTH = 640;

/** 开始页背景效果（应用级 UI 偏好，持久化到 config.json；默认无） */
export type StartBackgroundMode = "none" | "lines" | "poem";
const START_BACKGROUND_MODES: StartBackgroundMode[] = ["none", "lines", "poem"];

interface LayoutState {
  sidebarId: string | null;
  mainViewId: string;
  zoom: number;
  /** 侧边栏宽度（px） */
  sidebarWidth: number;
  /** 开始页背景效果 */
  startBackground: StartBackgroundMode;
  init: () => Promise<void>;
  toggleSidebar: (id: string | null) => void;
  setSidebar: (id: string | null) => void;
  setMainView: (id: string) => void;
  setZoom: (zoom: number) => void;
  cycleZoom: () => void;
  setSidebarWidth: (width: number) => void;
  setStartBackground: (mode: StartBackgroundMode) => void;
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  sidebarId: "editor",
  mainViewId: "editor",
  zoom: 100,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  startBackground: "none",

  init: async () => {
    const zoom = await getSetting<number>("zoom", 100);
    const sidebarWidth = await getSetting<number>("sidebarWidth", DEFAULT_SIDEBAR_WIDTH);
    const startBackground = await getSetting<StartBackgroundMode>("startBackground", "none");
    set({
      // 界面缩放默认 100%：存储值不在预设档位（90/100/120/150）时回退默认 100
      zoom: ZOOM_LEVELS.includes(zoom) ? zoom : 100,
      // 默认主视图已移到工程作用域：无工程时为默认值，打开工程后按工程配置读取
      sidebarWidth: Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, sidebarWidth)),
      // 开始页背景：存储值不在已知档位时回退默认「无」
      startBackground: START_BACKGROUND_MODES.includes(startBackground) ? startBackground : "none",
    });
  },

  toggleSidebar: (id) => {
    const current = get().sidebarId;
    set({ sidebarId: current === id ? null : id });
  },

  setSidebar: (id) => set({ sidebarId: id }),

  setSidebarWidth: (width) => {
    const w = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, Math.round(width)));
    set({ sidebarWidth: w });
    void setSetting("sidebarWidth", w);
  },

  setStartBackground: (mode) => {
    if (!START_BACKGROUND_MODES.includes(mode)) return;
    set({ startBackground: mode });
    void setSetting("startBackground", mode);
  },

  // 主视图改为工程作用域：仅更新内存态，随工程持久化（saveController 收集到 project-config.json）。
  setMainView: (id) => {
    set({ mainViewId: id });
  },

  setZoom: (zoom) => {
    set({ zoom });
    void setSetting("zoom", zoom);
  },

  cycleZoom: () => {
    const levels = ZOOM_LEVELS;
    const cur = get().zoom;
    const next = levels[(levels.indexOf(cur) + 1 + levels.length) % levels.length];
    get().setZoom(next);
  },
}));
