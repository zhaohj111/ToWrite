// 工作区状态：应用视图（开始页/内容页）与当前打开的工程。

import { create } from "zustand";
import type { ProjectData, ProjectMeta } from "@/types/writeproj";

interface WorkspaceState {
  view: "start" | "content" | "settings";
  /** 进入设置视图前的视图，设置页「返回」时回到它 */
  settingsReturnTo: "start" | "content";
  /** 打开设置时希望定位到的分组/页面（如「查看完整说明」跳插件详情页）；null = 默认 */
  settingsTarget: { group: string; pageId: string } | null;
  /** 插件详情定位目标（原型 id）：设置页打开后由插件详情消费并清除 */
  pluginGuideTarget: string | null;
  project: ProjectData | null;
  showStart: () => void;
  showContent: () => void;
  openProject: (data: ProjectData) => void;
  closeProject: () => void;
  openSettings: (target?: { group: string; pageId: string; pluginGuide?: string }) => void;
  closeSettings: () => void;
  updateProjectMeta: (patch: Partial<ProjectMeta>) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  view: "start",
  settingsReturnTo: "start",
  settingsTarget: null,
  pluginGuideTarget: null,
  project: null,
  showStart: () => set({ view: "start" }),
  showContent: () => set({ view: "content" }),
  openProject: (data) => set({ project: data, view: "content" }),
  closeProject: () => set({ project: null, view: "start" }),
  // 进入设置时记住来源视图（开始页/内容页），设置页返回时回到它；工程保持打开
  openSettings: (target) =>
    set((s) => ({
      settingsTarget: target ? { group: target.group, pageId: target.pageId } : null,
      pluginGuideTarget: target?.pluginGuide ?? null,
      settingsReturnTo: s.view === "settings" ? s.settingsReturnTo : (s.view === "start" ? "start" : "content"),
      view: "settings",
    })),
  closeSettings: () => set((s) => ({ view: s.settingsReturnTo })),
  updateProjectMeta: (patch) => {
    const project = get().project;
    if (!project) return;
    set({ project: { ...project, meta: { ...project.meta, ...patch } } });
  },
}));
