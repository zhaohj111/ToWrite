// 插件实例状态：同一个插件原型（core.editor / core.timeline / core.lore）可被实例化多次，
// 每个实例有独立的 id、显示名称、选中的侧边栏变体。
// v0.6：实例列表按工程隔离——打开工程时载入该工程的实例（存于 .writeproj 的 project-config.json），
// 未打开工程/新工程时使用程序级模板（config.json）作为兜底；实例的增删/顺序/启停等变更只写当前工程，
// 供设置页按工程单独管理，不再回写程序级模板。

import { create } from "zustand";
import { getSetting, setSetting } from "@/lib/settings";

export interface PluginInstance {
  /** 实例 id（即 ActivityBar/Sidebar/MainView 的视图 id），稳定持久 */
  id: string;
  /** 插件原型 id，如 core.editor */
  prototypeId: string;
  /** 显示名称，如「正文」「大纲」 */
  name: string;
  /** 原型 sidebars 中选中的变体 id；null = 不启用侧边栏 */
  sidebarViewId: string | null;
  enabled: boolean;
}

const KEY = "pluginInstances";

/** 携带编辑器文档的插件原型（其每个实例在工程内有一份独立文档） */
export const EDITOR_PROTOTYPE = "core.editor";
/** 携带时间轴文档的插件原型（其每个实例在工程内有一份独立文档） */
export const TIMELINE_PROTOTYPE = "core.timeline";

/** 默认实例：正文 + 大纲（同属 core.editor，各自独立的文档）、时间轴、设定库 */
export function defaultInstances(): PluginInstance[] {
  return [
    { id: "editor", prototypeId: EDITOR_PROTOTYPE, name: "正文", sidebarViewId: "chapters", enabled: true },
    { id: "outline", prototypeId: EDITOR_PROTOTYPE, name: "大纲", sidebarViewId: "chapters", enabled: true },
    { id: "timeline", prototypeId: TIMELINE_PROTOTYPE, name: "时间轴", sidebarViewId: "timeline-files", enabled: true },
    { id: "lore", prototypeId: "core.lore", name: "设定库", sidebarViewId: "lore", enabled: true },
  ];
}

/** 实例字段迁移（程序模板与工程实例共用）：
    迁移 1：早期「大纲」曾指向 outline（标题导航）侧栏，无法管理章节，统一改为 chapters
    迁移 2：早期「时间轴」未启用侧栏（null），现统一启用 timeline-files 文件树 */
function migrateInstance(inst: PluginInstance): PluginInstance {
  if (inst.prototypeId === EDITOR_PROTOTYPE && inst.sidebarViewId === "outline") {
    return { ...inst, sidebarViewId: "chapters" };
  }
  if (
    inst.prototypeId === TIMELINE_PROTOTYPE &&
    (inst.sidebarViewId === null || inst.sidebarViewId === "outline")
  ) {
    return { ...inst, sidebarViewId: "timeline-files" };
  }
  return inst;
}

interface PluginState {
  /** 当前生效的实例列表：打开工程时 = 该工程实例（随工程持久化）；无工程 = 程序级模板 */
  instances: PluginInstance[];
  /** 程序级模板（config.json）：新工程 / 工程未存储实例时的兜底；关闭工程后恢复 */
  template: PluginInstance[];
  init: () => Promise<void>;
  /** 打开工程时应用工程的实例列表；工程未存储实例时回退程序级模板 */
  applyProjectInstances: (projectInstances: PluginInstance[] | undefined) => void;
  /** 关闭工程后恢复程序级模板（避免上一工程的实例泄漏到下一工程/新工程） */
  restoreTemplate: () => void;
  addInstance: (input: {
    prototypeId: string;
    name: string;
    sidebarViewId: string | null;
  }) => PluginInstance;
  removeInstance: (id: string) => void;
  updateInstance: (id: string, patch: Partial<PluginInstance>) => void;
  /** 按给定实例 id 顺序重排实例（Activity Bar 拖拽）；未出现在 orderedIds 中的实例追加到末尾，避免丢实例 */
  reorderInstances: (orderedIds: string[]) => void;
  resetToDefaults: () => void;
}

export const usePluginStore = create<PluginState>((set, get) => ({
  instances: defaultInstances(),
  template: defaultInstances(),

  init: async () => {
    const saved = await getSetting<PluginInstance[] | null>(KEY, null);
    if (saved && Array.isArray(saved) && saved.length > 0) {
      const next = saved.map(migrateInstance);
      const migrated = next.some((m, i) => m !== saved[i]);
      set({ template: next, instances: next.map((i) => ({ ...i })) });
      if (migrated) void setSetting(KEY, next);
    } else {
      const next = defaultInstances();
      set({ template: next, instances: next.map((i) => ({ ...i })) });
      void setSetting(KEY, next);
    }
  },

  applyProjectInstances: (projectInstances) => {
    const next =
      projectInstances && projectInstances.length > 0
        ? projectInstances.map(migrateInstance)
        : get().template.map((i) => ({ ...i }));
    set({ instances: next });
  },

  restoreTemplate: () => {
    set({ instances: get().template.map((i) => ({ ...i })) });
  },

  addInstance: ({ prototypeId, name, sidebarViewId }) => {
    const inst: PluginInstance = {
      id: crypto.randomUUID(),
      prototypeId,
      name: name.trim() || prototypeId,
      sidebarViewId,
      enabled: true,
    };
    const next = [...get().instances, inst];
    set({ instances: next });
    return inst;
  },

  removeInstance: (id) => {
    const next = get().instances.filter((i) => i.id !== id);
    set({ instances: next });
  },

  updateInstance: (id, patch) => {
    const next = get().instances.map((i) => (i.id === id ? { ...i, ...patch } : i));
    set({ instances: next });
  },

  reorderInstances: (orderedIds) => {
    const byId = new Map(get().instances.map((i) => [i.id, i]));
    const seen = new Set(orderedIds);
    const reordered = orderedIds
      .map((id) => byId.get(id))
      .filter((i): i is PluginInstance => !!i);
    const rest = get().instances.filter((i) => !seen.has(i.id));
    set({ instances: [...reordered, ...rest] });
  },

  resetToDefaults: () => {
    set({ instances: defaultInstances() });
  },
}));
