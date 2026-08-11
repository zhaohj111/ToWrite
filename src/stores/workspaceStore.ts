// 工作区状态：应用视图（开始页/内容页）与当前打开的工程。

import { create } from "zustand";
import type { ProjectData, ProjectMeta } from "@/types/writeproj";

interface WorkspaceState {
  view: "start" | "content" | "settings";
  /** 进入设置视图前的视图，设置页「返回」时回到它 */
  settingsReturnTo: "start" | "content";
  project: ProjectData | null;
  showStart: () => void;
  showContent: () => void;
  openProject: (data: ProjectData) => void;
  closeProject: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  updateProjectMeta: (patch: Partial<ProjectMeta>) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  view: "start",
  settingsReturnTo: "start",
  project: null,
  showStart: () => set({ view: "start" }),
  showContent: () => set({ view: "content" }),
  openProject: (data) => set({ project: data, view: "content" }),
  closeProject: () => set({ project: null, view: "start" }),
  // 进入设置时记住来源视图（开始页/内容页），设置页返回时回到它；工程保持打开
  openSettings: () => set((s) => ({ settingsReturnTo: s.view === "settings" ? s.settingsReturnTo : (s.view === "start" ? "start" : "content"), view: "settings" })),
  closeSettings: () => set((s) => ({ view: s.settingsReturnTo })),
  updateProjectMeta: (patch) => {
    const project = get().project;
    if (!project) return;
    set({ project: { ...project, meta: { ...project.meta, ...patch } } });
  },
}));
