// 工程列表、近期工程与 CRUD；打开工程时把数据灌入各业务 store。

import { create } from "zustand";
import { open } from "@tauri-apps/plugin-dialog";
import type { ChapterDoc, EditorDoc, ProjectData, ProjectMeta, StructureData } from "@/types/writeproj";
import { emptyChapterDoc } from "@/types/writeproj";
import {
  createProject as apiCreateProject,
  deleteProject as apiDeleteProject,
  getProjectsDir,
  importProject as apiImportProject,
  listImportFiles,
  listProjects,
  readBinaryFile,
  readProject,
  readTextFile,
  renameProject as apiRenameProject,
  saveProject as apiSaveProject,
  setProjectNote as apiSetProjectNote,
} from "@/lib/tauri";
import { importToDoc, parseImport } from "@/lib/fileFormats/parseImport";
import { getSetting, setSetting } from "@/lib/settings";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useEditorStore } from "@/stores/editorStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { useAssociationStore } from "@/stores/associationStore";
import { LORE_PROTOTYPE, useLoreStore } from "@/stores/loreStore";
import { useLoreUiStore } from "@/stores/loreUiStore";
import { useTimelineUiStore } from "@/stores/timelineUiStore";
import { computeActivityItems, resolveDefaultView } from "@/plugins/hooks";
import { useLayoutStore } from "@/stores/layoutStore";
import { clearSidebarSnapshot } from "@/lib/layoutBus";
import { usePluginStore, EDITOR_PROTOTYPE, TIMELINE_PROTOTYPE } from "@/stores/pluginStore";
import { useSettingsStore } from "@/stores/settingsStore";

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
  /** 导入单个文档为工程（PDF/Markdown/TXT/Doc/Docx/EPUB） */
  importFileAsProject: () => Promise<void>;
  /** 导入文件夹为工程（每个受支持文件成为一章） */
  importFolderAsProject: () => Promise<void>;
  openProjectById: (id: string) => Promise<void>;
  closeProject: () => void;
  markRecent: (meta: ProjectMeta) => Promise<void>;
  removeRecent: (id: string) => Promise<void>;
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

  importFileAsProject: async () => {
    try {
      const path = await open({
        multiple: false,
        directory: false,
        filters: IMPORT_FILTERS,
      });
      if (typeof path !== "string") return;
      const parsed = await readAndParseImport(path);
      const title = baseName(path);
      const meta = await get().createProject(title);
      if (!meta) return;
      const data: ProjectData = buildImportedProjectData(meta, [{ title, doc: importToDoc(parsed) }]);
      await apiSaveProject(data);
      set({ projects: [meta, ...get().projects.filter((p) => p.id !== meta.id)] });
      await get().openProjectById(meta.id);
    } catch (e) {
      console.error("导入文件为工程失败", e);
      window.alert(e instanceof Error && e.message ? e.message : "导入文件失败，请确认文件格式受支持（PDF / Markdown / TXT / Word / EPUB）。");
    }
  },

  importFolderAsProject: async () => {
    try {
      const dir = await open({ multiple: false, directory: true });
      if (typeof dir !== "string") return;
      const files = await listImportFiles(dir);
      if (files.length === 0) {
        window.alert("该文件夹中没有可导入的文档（支持 PDF / Markdown / TXT / Word / EPUB）。");
        return;
      }
      const entries: { title: string; doc: ChapterDoc }[] = [];
      for (const f of files) {
        const parsed = await readAndParseImport(f.path);
        entries.push({ title: baseName(f.name), doc: importToDoc(parsed) });
      }
      const folderName = dir.split(/[\\/]/).filter(Boolean).pop() ?? "导入的工程";
      const meta = await get().createProject(folderName);
      if (!meta) return;
      const data: ProjectData = buildImportedProjectData(meta, entries);
      await apiSaveProject(data);
      set({ projects: [meta, ...get().projects.filter((p) => p.id !== meta.id)] });
      await get().openProjectById(meta.id);
    } catch (e) {
      console.error("导入文件夹为工程失败", e);
      window.alert(e instanceof Error && e.message ? e.message : "导入文件夹失败，请确认目录可读且包含受支持的文档。");
    }
  },

  openProjectById: async (id) => {
    try {
      const data = await readProject(id);
      useWorkspaceStore.getState().openProject(data);
      // 应用工程级插件实例列表（含顺序/名称/启停/侧栏变体）；工程未存储时回退程序级模板
      usePluginStore.getState().applyProjectInstances(data.config?.instances);
      // 载入工程级设置（实例覆盖，含旧 editorFontSizes 迁移）
      useSettingsStore.getState().loadProjectSettings(data);
      // v0.7：默认「大纲」实例定制文件/文件夹名（大纲分卷/大纲）；已有覆盖不重写
      const settingsSt = useSettingsStore.getState();
      for (const inst of usePluginStore.getState().instances) {
        if (inst.prototypeId === EDITOR_PROTOTYPE && inst.id === "outline") {
          if (settingsSt.getInstanceSetting("outline", "folderLabel") === undefined) {
            settingsSt.setInstanceSetting("outline", "folderLabel", "大纲分卷");
          }
          if (settingsSt.getInstanceSetting("outline", "fileLabel") === undefined) {
            settingsSt.setInstanceSetting("outline", "fileLabel", "大纲");
          }
        }
      }
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
        useAssociationStore.getState().loadProject(data);
      // 工程级「当前使用颜色」恢复（时间轴/设定库，工程隔离）：从工程实例设置读取
      restoreProjectColors(timelineIds, loreIds);
      // 工程级默认插件（工程未存储时回退 editor）：主视图与侧边栏一并切换。
      // 该插件实例无主视图/侧栏时，回退活动栏自上而下第一个带主视图/侧栏的实例。
      const items = computeActivityItems(
        usePluginStore.getState().instances,
        useSettingsStore.getState().prototypeEnabled,
      );
      const { mainViewId, sidebarId } = resolveDefaultView(
        items,
        data.config?.mainView ?? "editor",
      );
      useLayoutStore.getState().setMainView(mainViewId ?? "editor");
      useLayoutStore.getState().setSidebar(sidebarId);
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
    useAssociationStore.getState().reset();
    useLoreUiStore.getState().reset();
    useTimelineUiStore.getState().reset();
    // 恢复程序级实例模板，避免上一工程的实例泄漏到下一工程/新工程
    usePluginStore.getState().restoreTemplate();
    // 清空实例级设置覆盖（应用级设置保留）
    useSettingsStore.getState().reset();
    useLayoutStore.getState().setSidebar(null);
      clearSidebarSnapshot();
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

  /** 从「最近打开」列表移除（不影响工程文件本身） */
  removeRecent: async (id) => {
    const next = get().recent.filter((r) => r.id !== id);
    set({ recent: next });
    await setSetting(RECENT_KEY, next);
  },
}));

/** 开始页「导入文件/文件夹为工程」支持的格式 */
const IMPORT_FILTERS = [
  { name: "支持的文档", extensions: ["md", "txt", "pdf", "docx", "doc", "epub"] },
  { name: "Markdown", extensions: ["md"] },
  { name: "纯文本", extensions: ["txt"] },
  { name: "PDF", extensions: ["pdf"] },
  { name: "Word 文档", extensions: ["docx", "doc"] },
  { name: "EPUB 电子书", extensions: ["epub"] },
];

/** 取路径/文件名的基名（去掉目录与扩展名） */
function baseName(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? "导入";
  return name.replace(/\.[^.]+$/, "");
}

/** 读取并解析导入文件：文本类（md/txt）走 readTextFile，二进制类走 base64 */
async function readAndParseImport(path: string) {
  const ext = (path.split(".").pop() ?? "").toLowerCase();
  const isText = ext === "md" || ext === "txt";
  const content = isText ? await readTextFile(path) : await readBinaryFile(path);
  return parseImport(baseName(path), content, ext);
}

/**
 * 构建「导入为工程」的工程数据：正文实例放入导入章节（文件=章节，文件名作章节名）。
 * 复用默认编辑器实例 id（与打开工程时 applyProjectInstances 的模板一致）。
 */
function buildImportedProjectData(meta: ProjectMeta, entries: { title: string; doc: ChapterDoc }[]): ProjectData {
  const editorId = usePluginStore
    .getState()
    .template.find((i) => i.enabled && i.prototypeId === EDITOR_PROTOTYPE)?.id ?? "editor";
  const structure: StructureData = {
    chapters: entries.map((e, i) => ({ id: crypto.randomUUID(), title: e.title, order: i })),
    volumes: [],
  };
  const chapters: Record<string, ChapterDoc> = {};
  for (let i = 0; i < structure.chapters.length; i++) {
    chapters[structure.chapters[i].id] = entries[i].doc ?? emptyChapterDoc();
  }
  const editorDoc: EditorDoc = { structure, chapters };
  return {
    meta,
    editors: { [editorId]: editorDoc },
    timelines: {},
    lore: {},
    config: { mainView: editorId },
  };
}

/**
 * 从工程实例设置恢复时间轴「当前使用颜色」与设定库当前连线/关系文本颜色（工程隔离）。
 * 颜色写入 settingsStore.instanceSettings（随 project-config.json 落盘），打开工程时读回 UI store。
 */
function restoreProjectColors(timelineIds: string[], loreIds: string[]): void {
  const settings = useSettingsStore.getState();
  const tlUi = useTimelineUiStore.getState();
  const colors: Record<string, string> = {};
  for (const id of timelineIds) {
    const c = settings.getInstanceSetting(id, "currentColor");
    if (typeof c === "string") colors[id] = c;
  }
  tlUi.loadProject(colors);

  const loUi = useLoreUiStore.getState();
  const loreColors: Record<string, { edgeColor?: string; edgeLabelColor?: string }> = {};
  for (const id of loreIds) {
    const ec = settings.getInstanceSetting(id, "edgeColor");
    const elc = settings.getInstanceSetting(id, "edgeLabelColor");
    if (typeof ec === "string" || typeof elc === "string") {
      loreColors[id] = {
        edgeColor: typeof ec === "string" ? ec : undefined,
        edgeLabelColor: typeof elc === "string" ? elc : undefined,
      };
    }
  }
  loUi.loadProject(loreColors);
}
