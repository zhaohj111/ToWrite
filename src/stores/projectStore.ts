// 工程列表、近期工程与 CRUD；打开工程时把数据灌入各业务 store。

import { create } from "zustand";
import { open } from "@tauri-apps/plugin-dialog";
import type { ProjectMeta } from "@/types/writeproj";
import {
  createProject as apiCreateProject,
  deleteProject as apiDeleteProject,
  getProjectsDir,
  importProject as apiImportProject,
  listProjects,
  readProject,
  renameProject as apiRenameProject,
  setProjectNote as apiSetProjectNote,
} from "@/lib/tauri";
import { getSetting, setSetting } from "@/lib/settings";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useEditorStore } from "@/stores/editorStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { LORE_PROTOTYPE, useLoreStore } from "@/stores/loreStore";
import { useLoreUiStore } from "@/stores/loreUiStore";
import { useLayoutStore } from "@/stores/layoutStore";
import { usePluginStore, EDITOR_PROTOTYPE, TIMELINE_PROTOTYPE } from "@/stores/pluginStore";

export interface RecentItem {
  id: string;
  lastOpened: string;
}

const RECENT_KEY = "recentProjects";
const RECENT_LIMIT = 8;

interface ProjectState {
  projects: ProjectMeta[];
  recent: RecentItem[];
  loading: boolean;
  projectsDir: string | null;
  loadProjects: () => Promise<void>;
  refreshRecent: () => Promise<void>;
  createProject: (name: string) => Promise<ProjectMeta | null>;
  deleteProject: (id: string) => Promise<void>;
  renameProject: (id: string, name: string) => Promise<void>;
  setProjectNote: (id: string, note: string) => Promise<void>;
  importProjectFile: () => Promise<void>;
  openProjectById: (id: string) => Promise<void>;
  closeProject: () => void;
  markRecent: (meta: ProjectMeta) => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  recent: [],
  loading: false,
  projectsDir: null,

  loadProjects: async () => {
    set({ loading: true });
    try {
      const projects = await listProjects();
      const projectsDir = await getProjectsDir().catch(() => null);
      set({ projects, projectsDir });
      await get().refreshRecent();
    } catch (e) {
      console.warn("加载工程列表失败（非 Tauri 环境？）", e);
      set({ projects: [], projectsDir: null });
    } finally {
      set({ loading: false });
    }
  },

  refreshRecent: async () => {
    const recent = await getSetting<RecentItem[]>(RECENT_KEY, []);
    const ids = new Set(get().projects.map((p) => p.id));
    set({ recent: recent.filter((r) => ids.has(r.id)) });
  },

  createProject: async (name) => {
    try {
      const meta = await apiCreateProject(name);
      const projects = [meta, ...get().projects];
      set({ projects });
      return meta;
    } catch (e) {
      console.error("新建工程失败", e);
      return null;
    }
  },

  deleteProject: async (id) => {
    try {
      await apiDeleteProject(id);
      set({ projects: get().projects.filter((p) => p.id !== id) });
      await get().refreshRecent();
    } catch (e) {
      console.error("删除工程失败", e);
    }
  },

  renameProject: async (id, name) => {
    try {
      const meta = await apiRenameProject(id, name);
      set({
        projects: get().projects.map((p) => (p.id === id ? meta : p)),
      });
      useWorkspaceStore.getState().updateProjectMeta({ name: meta.name });
    } catch (e) {
      console.error("重命名失败", e);
    }
  },

  setProjectNote: async (id, note) => {
    try {
      const meta = await apiSetProjectNote(id, note);
      set({
        projects: get().projects.map((p) => (p.id === id ? meta : p)),
      });
      useWorkspaceStore.getState().updateProjectMeta({ note: meta.note });
    } catch (e) {
      console.error("设置备注失败", e);
    }
  },

  importProjectFile: async () => {
    try {
      const path = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "拓文工程", extensions: ["writeproj"] }],
      });
      if (typeof path !== "string") return;
      const meta = await apiImportProject(path);
      set({
        projects: [meta, ...get().projects.filter((p) => p.id !== meta.id)],
      });
      await get().openProjectById(meta.id);
    } catch (e) {
      console.error("导入工程失败", e);
    }
  },

  openProjectById: async (id) => {
    try {
      const data = await readProject(id);
      useWorkspaceStore.getState().openProject(data);
      // 应用工程级插件实例列表（含顺序/名称/启停/侧栏变体）；工程未存储时回退程序级模板
      usePluginStore.getState().applyProjectInstances(data.config?.instances);
      const editorIds = usePluginStore
        .getState()
        .instances.filter((i) => i.enabled && i.prototypeId === EDITOR_PROTOTYPE)
        .map((i) => i.id);
      useEditorStore.getState().loadProject(data, editorIds);
      const timelineIds = usePluginStore
        .getState()
        .instances.filter((i) => i.enabled && i.prototypeId === TIMELINE_PROTOTYPE)
        .map((i) => i.id);
      useTimelineStore.getState().loadProject(data, timelineIds);
      const loreIds = usePluginStore
        .getState()
        .instances.filter((i) => i.enabled && i.prototypeId === LORE_PROTOTYPE)
        .map((i) => i.id);
      useLoreStore.getState().loadProject(data, loreIds);
      useLayoutStore.getState().setMainView("editor");
      useLayoutStore.getState().setSidebar("editor");
      await get().markRecent(data.meta);
    } catch (e) {
      console.error("打开工程失败", e);
    }
  },

  closeProject: () => {
    useWorkspaceStore.getState().closeProject();
    useEditorStore.getState().reset();
    useTimelineStore.getState().reset();
    useLoreStore.getState().reset();
    useLoreUiStore.getState().reset();
    // 恢复程序级实例模板，避免上一工程的实例泄漏到下一工程/新工程
    usePluginStore.getState().restoreTemplate();
    useLayoutStore.getState().setSidebar(null);
  },

  markRecent: async (meta) => {
    const recent = await getSetting<RecentItem[]>(RECENT_KEY, []);
    const next = [
      { id: meta.id, lastOpened: new Date().toISOString() },
      ...recent.filter((r) => r.id !== meta.id),
    ].slice(0, RECENT_LIMIT);
    await setSetting(RECENT_KEY, next);
    set({ recent: next });
  },
}));
