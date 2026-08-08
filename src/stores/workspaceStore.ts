// 工作区状态：应用视图（开始页/内容页）与当前打开的工程。

import { create } from "zustand";
import type { ProjectData, ProjectMeta } from "@/types/writeproj";

interface WorkspaceState {
  view: "start" | "content";
  project: ProjectData | null;
  showStart: () => void;
  showContent: () => void;
  openProject: (data: ProjectData) => void;
  closeProject: () => void;
  updateProjectMeta: (patch: Partial<ProjectMeta>) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  view: "start",
  project: null,
  showStart: () => set({ view: "start" }),
  showContent: () => set({ view: "content" }),
  openProject: (data) => set({ project: data, view: "content" }),
  closeProject: () => set({ project: null, view: "start" }),
  updateProjectMeta: (patch) => {
    const project = get().project;
    if (!project) return;
    set({ project: { ...project, meta: { ...project.meta, ...patch } } });
  },
}));
