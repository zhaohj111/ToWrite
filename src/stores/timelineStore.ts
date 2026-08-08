// 时间轴状态（core.timeline）：分卷（文件夹）+ 时间轴文件树、各文件内的节点、实例级共享颜色图例。
// v0.7：状态按插件实例隔离（时间轴实例可存在多个），slices 以实例 id 为键；
// 每个时间轴文件是一条独立的轴体，其节点自由拖动、以垂线连接轴体；
// 颜色图例跨该实例全部时间轴文件共享（仿设定库实例级共享标签）。

import { create } from "zustand";
import type {
  ColorLegendItem,
  ProjectData,
  TimelineData,
  TimelineDoc,
  TimelineFileMeta,
  TimelineFolderMeta,
  TimelineNodeData,
} from "@/types/writeproj";

/** 主区顶部「最近打开」文件标签上限 */
const MAX_TABS = 10;
/** 把文件 id 放入最近打开列表：最新在前、去重、限长 */
function pushTab(tabs: string[], id: string): string[] {
  return [id, ...tabs.filter((t) => t !== id)].slice(0, MAX_TABS);
}

export const DEFAULT_COLOR_LEGEND: ColorLegendItem[] = [
  { id: "cl-main", label: "主线", color: "#d7b25c" },
  { id: "cl-char", label: "人物", color: "#d08a76" },
  { id: "cl-flash", label: "伏笔", color: "#7ba6a0" },
];

/** 补齐文件数据缺省字段（时间区间 0–10、刻度 1），兼容旧格式。
 *  图例已上移为实例级共享（TimelineSlice.colorLegend），此处不再按文件存储。 */
export function normalizeDoc(d: TimelineData | undefined): TimelineData {
  return {
    nodes: d?.nodes ?? [],
    edges: d?.edges ?? [],
    colorLegend: [],
    rangeStart: d?.rangeStart ?? 0,
    rangeEnd: d?.rangeEnd ?? 10,
    tickStep: d?.tickStep ?? 1,
  };
}

function emptyTimelineData(): TimelineData {
  return normalizeDoc(undefined);
}

/** 单个时间轴实例的完整状态 */
export interface TimelineSlice {
  folders: TimelineFolderMeta[];
  files: TimelineFileMeta[];
  currentFileId: string | null;
  /** 文件 id -> 该文件的轴体数据 */
  docs: Record<string, TimelineData>;
  /** 颜色图例跨该实例全部时间轴文件共享 */
  colorLegend: ColorLegendItem[];
  openTabs: string[];
}

export const EMPTY_TIMELINE_SLICE: TimelineSlice = {
  folders: [],
  files: [],
  currentFileId: null,
  docs: {},
  colorLegend: DEFAULT_COLOR_LEGEND,
  openTabs: [],
};

interface TimelineState {
  slices: Record<string, TimelineSlice>;
  /** 结构变更撤销栈（按实例，快照为 TimelineDoc） */
  undoStacks: Record<string, TimelineDoc[]>;
  /** 结构变更重做栈（按实例） */
  redoStacks: Record<string, TimelineDoc[]>;
  loadProject: (data: ProjectData, instanceIds: string[]) => void;
  reset: () => void;
  getSlice: (instanceId: string) => TimelineSlice;
  /** 载入某个文件；无文件时自动创建默认文件并选中 */
  ensureFile: (instanceId: string) => string | null;
  setCurrentFile: (instanceId: string, fileId: string) => void;
  closeTab: (instanceId: string, fileId: string) => void;
  addFolder: (instanceId: string, title: string) => TimelineFolderMeta;
  renameFolder: (instanceId: string, id: string, title: string) => void;
  deleteFolder: (instanceId: string, id: string) => void;
  deleteFolderWithContents: (instanceId: string, id: string) => void;
  addFile: (instanceId: string, title: string, folderId?: string) => TimelineFileMeta;
  renameFile: (instanceId: string, id: string, title: string) => void;
  deleteFile: (instanceId: string, id: string) => void;
  moveFolder: (instanceId: string, id: string, beforeId: string | null) => void;
  moveFile: (
    instanceId: string,
    id: string,
    opts: { folderId?: string; beforeId?: string },
  ) => void;
  addNode: (
    instanceId: string,
    fileId: string,
    x: number,
    y: number,
    color?: string,
  ) => TimelineNodeData | null;
  updateNode: (instanceId: string, fileId: string, id: string, patch: Partial<TimelineNodeData>) => void;
  deleteNode: (instanceId: string, fileId: string, id: string) => void;
  moveNode: (instanceId: string, fileId: string, id: string, x: number, y: number) => void;
  setRange: (instanceId: string, fileId: string, start: number, end: number) => void;
  setTickStep: (instanceId: string, fileId: string, step: number) => void;
  /** 隐藏/显示某个图例颜色（实例级） */
  setLegendHidden: (instanceId: string, legendId: string, hidden: boolean) => void;
  /** 把自定义颜色加入实例图例（已存在则跳过） */
  addLegendEntry: (instanceId: string, color: string, label?: string) => void;
  /** 用节点注释同步自定义图例条目的名称（内置图例色不更新） */
  updateLegendEntryLabel: (instanceId: string, color: string, label: string) => void;
  /** 重命名任意图例条目（图例管理面板使用） */
  renameLegendEntry: (instanceId: string, legendId: string, label: string) => void;
  /** 删除图例条目（使用该颜色的标签保留，退化为自定义色） */
  deleteLegendEntry: (instanceId: string, legendId: string) => void;
  /** 收集单个实例的完整文档（供保存控制器落盘） */
  collectDoc: (instanceId: string) => TimelineDoc;
  /** 在结构性变更（增删节点/图例、移动、改名等）前调用，记录撤销快照 */
  record: (instanceId: string) => void;
  /** 撤销最近一次结构性变更 */
  undo: (instanceId: string) => void;
  /** 重做 */
  redo: (instanceId: string) => void;
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  slices: {},
  undoStacks: {},
  redoStacks: {},

  loadProject: (data, instanceIds) => {
    const slices: Record<string, TimelineSlice> = {};
    for (const id of instanceIds) {
      const doc = data.timelines?.[id];
      if (doc) {
        const files = (doc.structure?.files ?? [])
          .slice()
          .sort((a, b) => a.order - b.order);
        const folders = (doc.structure?.folders ?? [])
          .slice()
          .sort((a, b) => a.order - b.order);
        const docs: Record<string, TimelineData> = {};
        for (const f of files) docs[f.id] = normalizeDoc(doc.docs[f.id]);
        // 图例：优先实例级共享；旧版按文件存储时回退到首个文件内图例（迁移后统一按实例存储）
        let colorLegend = doc.colorLegend;
        if (!colorLegend?.length) {
          for (const f of files) {
            const fd = doc.docs?.[f.id];
            if (fd?.colorLegend?.length) {
              colorLegend = fd.colorLegend;
              break;
            }
          }
        }
        if (!colorLegend?.length) colorLegend = DEFAULT_COLOR_LEGEND;
        const current = files[0]?.id ?? null;
        slices[id] = {
          folders,
          files,
          docs,
          colorLegend,
          currentFileId: current,
          openTabs: current ? [current] : [],
        };
      } else {
        // 新工程：默认建一条「时间轴」文件，让主区立刻可点即加标签
        slices[id] = seedEmptySlice();
      }
    }
    set({ slices });
  },

  reset: () => set({ slices: {}, undoStacks: {}, redoStacks: {} }),

  getSlice: (instanceId) => get().slices[instanceId] ?? EMPTY_TIMELINE_SLICE,

  ensureFile: (instanceId) => {
    const cur = get().slices[instanceId] ?? EMPTY_TIMELINE_SLICE;
    if (cur.files.length > 0) return cur.currentFileId;
    const next = seedEmptySlice();
    set({ slices: { ...get().slices, [instanceId]: next } });
    return next.currentFileId;
  },

  setCurrentFile: (instanceId, fileId) => {
    const cur = get().slices[instanceId] ?? EMPTY_TIMELINE_SLICE;
    set({
      slices: {
        ...get().slices,
        [instanceId]: {
          ...cur,
          currentFileId: fileId,
          openTabs: pushTab(cur.openTabs, fileId),
        },
      },
    });
  },

  closeTab: (instanceId, fileId) => {
    const cur = get().slices[instanceId] ?? EMPTY_TIMELINE_SLICE;
    const tabs = cur.openTabs.filter((t) => t !== fileId);
    let current = cur.currentFileId;
    if (current === fileId) current = tabs[0] ?? null;
    set({
      slices: {
        ...get().slices,
        [instanceId]: { ...cur, openTabs: tabs, currentFileId: current },
      },
    });
  },

  addFolder: (instanceId, title) => {
    const cur = get().slices[instanceId] ?? EMPTY_TIMELINE_SLICE;
    const folder: TimelineFolderMeta = { id: crypto.randomUUID(), title, order: cur.folders.length };
    set({
      slices: {
        ...get().slices,
        [instanceId]: { ...cur, folders: [...cur.folders, folder] },
      },
    });
    return folder;
  },

  renameFolder: (instanceId, id, title) => {
    const cur = get().slices[instanceId] ?? EMPTY_TIMELINE_SLICE;
    set({
      slices: {
        ...get().slices,
        [instanceId]: {
          ...cur,
          folders: cur.folders.map((f) => (f.id === id ? { ...f, title } : f)),
        },
      },
    });
  },

  deleteFolder: (instanceId, id) => {
    const cur = get().slices[instanceId] ?? EMPTY_TIMELINE_SLICE;
    set({
      slices: {
        ...get().slices,
        [instanceId]: {
          ...cur,
          folders: cur.folders.filter((f) => f.id !== id),
          files: cur.files.map((f) => (f.folderId === id ? { ...f, folderId: undefined } : f)),
        },
      },
    });
  },

  deleteFolderWithContents: (instanceId, id) => {
    const cur = get().slices[instanceId] ?? EMPTY_TIMELINE_SLICE;
    const inside = new Set(cur.files.filter((f) => f.folderId === id).map((f) => f.id));
    const docs = { ...cur.docs };
    for (const fid of inside) delete docs[fid];
    let current = cur.currentFileId;
    const tabs = cur.openTabs.filter((t) => !inside.has(t));
    if (current && inside.has(current)) {
      current = cur.files.find((f) => !inside.has(f.id))?.id ?? null;
    }
    set({
      slices: {
        ...get().slices,
        [instanceId]: {
          ...cur,
          folders: cur.folders.filter((f) => f.id !== id),
          files: cur.files.filter((f) => f.folderId !== id),
          docs,
          currentFileId: current,
          openTabs: current ? pushTab(tabs, current) : tabs,
        },
      },
    });
  },

  addFile: (instanceId, title, folderId) => {
    const cur = get().slices[instanceId] ?? EMPTY_TIMELINE_SLICE;
    const id = crypto.randomUUID();
    const file: TimelineFileMeta = { id, title, order: cur.files.length, folderId };
    set({
      slices: {
        ...get().slices,
        [instanceId]: {
          ...cur,
          files: [...cur.files, file],
          docs: { ...cur.docs, [id]: emptyTimelineData() },
          currentFileId: id,
          openTabs: pushTab(cur.openTabs, id),
        },
      },
    });
    return file;
  },

  renameFile: (instanceId, id, title) => {
    const cur = get().slices[instanceId] ?? EMPTY_TIMELINE_SLICE;
    set({
      slices: {
        ...get().slices,
        [instanceId]: {
          ...cur,
          files: cur.files.map((f) => (f.id === id ? { ...f, title } : f)),
        },
      },
    });
  },

  deleteFile: (instanceId, id) => {
    const cur = get().slices[instanceId] ?? EMPTY_TIMELINE_SLICE;
    const idx = cur.files.findIndex((f) => f.id === id);
    const next = cur.files.filter((f) => f.id !== id);
    const docs = { ...cur.docs };
    delete docs[id];
    let current = cur.currentFileId;
    const tabs = cur.openTabs.filter((t) => t !== id);
    if (current === id) {
      current = next[Math.min(Math.max(idx, 0), next.length - 1)]?.id ?? null;
    }
    set({
      slices: {
        ...get().slices,
        [instanceId]: {
          ...cur,
          files: next,
          docs,
          currentFileId: current,
          openTabs: current ? pushTab(tabs, current) : tabs,
        },
      },
    });
  },

  moveFolder: (instanceId, id, beforeId) => {
    const cur = get().slices[instanceId] ?? EMPTY_TIMELINE_SLICE;
    const src = cur.folders.find((f) => f.id === id);
    if (!src) return;
    const rest = cur.folders.filter((f) => f.id !== id);
    const idx = beforeId ? rest.findIndex((f) => f.id === beforeId) : rest.length;
    const insertAt = idx < 0 ? rest.length : idx;
    const folders = [...rest.slice(0, insertAt), src, ...rest.slice(insertAt)].map((f, i) => ({
      ...f,
      order: i,
    }));
    set({
      slices: { ...get().slices, [instanceId]: { ...cur, folders } },
    });
  },

  moveFile: (instanceId, id, { folderId, beforeId }) => {
    const cur = get().slices[instanceId] ?? EMPTY_TIMELINE_SLICE;
    const src = cur.files.find((f) => f.id === id);
    if (!src) return;
    const moved = { ...src, folderId };
    if (!folderId) delete moved.folderId;
    const rest = cur.files.filter((f) => f.id !== id);
    const group = (f: TimelineFileMeta) => (f.folderId ?? undefined) === (folderId ?? undefined);
    const members = rest.filter(group);
    const idx = beforeId ? members.findIndex((f) => f.id === beforeId) : members.length;
    const insertAt = idx < 0 ? members.length : idx;
    const reordered = [...members.slice(0, insertAt), moved, ...members.slice(insertAt)];
    const files = rest
      .filter((f) => !group(f))
      .concat(reordered)
      .map((f, i) => ({ ...f, order: i }));
    set({
      slices: { ...get().slices, [instanceId]: { ...cur, files } },
    });
  },

  addNode: (instanceId, fileId, x, y, color) => {
    const cur = get().slices[instanceId] ?? EMPTY_TIMELINE_SLICE;
    const doc = cur.docs[fileId];
    if (!doc) return null;
    const usedColor = color ?? cur.colorLegend[0]?.color ?? DEFAULT_COLOR_LEGEND[0].color;
    // 新标签自动带上当前颜色的注释（标签下方内容），与「替换颜色」的注释同步保持一致
    const entry = cur.colorLegend.find((l) => l.color === usedColor);
    const node: TimelineNodeData = {
      id: crypto.randomUUID(),
      label: "",
      kind: "event",
      color: usedColor,
      note: entry?.label,
      x: Math.round(x),
      y: Math.round(y),
    };
    set({
      slices: {
        ...get().slices,
        [instanceId]: {
          ...cur,
          docs: { ...cur.docs, [fileId]: { ...doc, nodes: [...doc.nodes, node] } },
        },
      },
    });
    return node;
  },

  updateNode: (instanceId, fileId, id, patch) => {
    const cur = get().slices[instanceId] ?? EMPTY_TIMELINE_SLICE;
    const doc = cur.docs[fileId];
    if (!doc) return;
    set({
      slices: {
        ...get().slices,
        [instanceId]: {
          ...cur,
          docs: {
            ...cur.docs,
            [fileId]: {
              ...doc,
              nodes: doc.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
            },
          },
        },
      },
    });
  },

  deleteNode: (instanceId, fileId, id) => {
    const cur = get().slices[instanceId] ?? EMPTY_TIMELINE_SLICE;
    const doc = cur.docs[fileId];
    if (!doc) return;
    set({
      slices: {
        ...get().slices,
        [instanceId]: {
          ...cur,
          docs: {
            ...cur.docs,
            [fileId]: { ...doc, nodes: doc.nodes.filter((n) => n.id !== id) },
          },
        },
      },
    });
  },

  moveNode: (instanceId, fileId, id, x, y) =>
    get().updateNode(instanceId, fileId, id, { x: Math.round(x), y: Math.round(y) }),

  setRange: (instanceId, fileId, start, end) => {
    const cur = get().slices[instanceId] ?? EMPTY_TIMELINE_SLICE;
    const doc = cur.docs[fileId];
    if (!doc) return;
    let s = Number(start);
    let e = Number(end);
    if (!Number.isFinite(s)) s = doc.rangeStart;
    if (!Number.isFinite(e)) e = doc.rangeEnd;
    if (s >= e) e = s + 1;
    set({
      slices: {
        ...get().slices,
        [instanceId]: {
          ...cur,
          docs: { ...cur.docs, [fileId]: { ...doc, rangeStart: s, rangeEnd: e } },
        },
      },
    });
  },

  setTickStep: (instanceId, fileId, step) => {
    const cur = get().slices[instanceId] ?? EMPTY_TIMELINE_SLICE;
    const doc = cur.docs[fileId];
    if (!doc) return;
    let v = Number(step);
    if (!Number.isFinite(v) || v <= 0) v = doc.tickStep;
    set({
      slices: {
        ...get().slices,
        [instanceId]: {
          ...cur,
          docs: { ...cur.docs, [fileId]: { ...doc, tickStep: v } },
        },
      },
    });
  },

  setLegendHidden: (instanceId, legendId, hidden) => {
    const cur = get().slices[instanceId] ?? EMPTY_TIMELINE_SLICE;
    set({
      slices: {
        ...get().slices,
        [instanceId]: {
          ...cur,
          colorLegend: cur.colorLegend.map((l) =>
            l.id === legendId ? { ...l, hidden } : l,
          ),
        },
      },
    });
  },

  addLegendEntry: (instanceId, color, label) => {
    const cur = get().slices[instanceId] ?? EMPTY_TIMELINE_SLICE;
    if (cur.colorLegend.some((l) => l.color === color)) return;
    const entry: ColorLegendItem = {
      id: crypto.randomUUID(),
      label: label?.trim() || "自定义",
      color,
      hidden: false,
    };
    set({
      slices: {
        ...get().slices,
        [instanceId]: { ...cur, colorLegend: [...cur.colorLegend, entry] },
      },
    });
  },

  updateLegendEntryLabel: (instanceId, color, label) => {
    const cur = get().slices[instanceId] ?? EMPTY_TIMELINE_SLICE;
    const labelTrim = label.trim();
    let changed = false;
    const colorLegend = cur.colorLegend.map((l) => {
      if (l.id.startsWith("cl-") || l.color !== color || !labelTrim) return l;
      if (l.label === labelTrim) return l;
      changed = true;
      return { ...l, label: labelTrim };
    });
    if (!changed) return;
    set({
      slices: {
        ...get().slices,
        [instanceId]: { ...cur, colorLegend },
      },
    });
  },

  renameLegendEntry: (instanceId, legendId, label) => {
    const cur = get().slices[instanceId] ?? EMPTY_TIMELINE_SLICE;
    const labelTrim = label.trim();
    if (!labelTrim) return;
    set({
      slices: {
        ...get().slices,
        [instanceId]: {
          ...cur,
          colorLegend: cur.colorLegend.map((l) =>
            l.id === legendId ? { ...l, label: labelTrim } : l,
          ),
        },
      },
    });
  },

  deleteLegendEntry: (instanceId, legendId) => {
    const cur = get().slices[instanceId] ?? EMPTY_TIMELINE_SLICE;
    set({
      slices: {
        ...get().slices,
        [instanceId]: {
          ...cur,
          colorLegend: cur.colorLegend.filter((l) => l.id !== legendId),
        },
      },
    });
  },

  collectDoc: (instanceId) => {
    const cur = get().slices[instanceId] ?? EMPTY_TIMELINE_SLICE;
    return {
      structure: { files: cur.files, folders: cur.folders },
      colorLegend: cur.colorLegend,
      docs: cur.docs,
    };
  },

  record: (instanceId) => {
    const doc = get().collectDoc(instanceId);
    const stack = get().undoStacks[instanceId] ?? [];
    // 与最近一次快照相同（无实际变更）则跳过，避免点击等误操作堆栈
    const last = stack[stack.length - 1];
    if (last && JSON.stringify(last) === JSON.stringify(doc)) return;
    set((s) => ({
      undoStacks: {
        ...s.undoStacks,
        [instanceId]: [...(s.undoStacks[instanceId] ?? []), doc].slice(-UNDO_LIMIT),
      },
      redoStacks: { ...s.redoStacks, [instanceId]: [] },
    }));
  },

  undo: (instanceId) => {
    const stack = get().undoStacks[instanceId] ?? [];
    if (stack.length === 0) return;
    const prev = stack[stack.length - 1];
    const cur = get().collectDoc(instanceId);
    const curSlice = get().slices[instanceId] ?? EMPTY_TIMELINE_SLICE;
    set((s) => ({
      slices: {
        ...s.slices,
        [instanceId]: {
          ...timelineDocToSlice(prev),
          // 撤销/重做不改变当前文件选中与打开的标签
          currentFileId: curSlice.currentFileId,
          openTabs: curSlice.openTabs,
        },
      },
      undoStacks: { ...s.undoStacks, [instanceId]: stack.slice(0, -1) },
      redoStacks: {
        ...s.redoStacks,
        [instanceId]: [...(s.redoStacks[instanceId] ?? []), cur].slice(-UNDO_LIMIT),
      },
    }));
  },

  redo: (instanceId) => {
    const stack = get().redoStacks[instanceId] ?? [];
    if (stack.length === 0) return;
    const next = stack[stack.length - 1];
    const cur = get().collectDoc(instanceId);
    const curSlice = get().slices[instanceId] ?? EMPTY_TIMELINE_SLICE;
    set((s) => ({
      slices: {
        ...s.slices,
        [instanceId]: {
          ...timelineDocToSlice(next),
          currentFileId: curSlice.currentFileId,
          openTabs: curSlice.openTabs,
        },
      },
      undoStacks: {
        ...s.undoStacks,
        [instanceId]: [...(s.undoStacks[instanceId] ?? []), cur].slice(-UNDO_LIMIT),
      },
      redoStacks: { ...s.redoStacks, [instanceId]: stack.slice(0, -1) },
    }));
  },
}));

/** 撤销/重做快照上限 */
const UNDO_LIMIT = 50;

/** 撤销快照（TimelineDoc）恢复为切片 */
function timelineDocToSlice(doc: TimelineDoc): TimelineSlice {
  const files = (doc.structure?.files ?? []).slice().sort((a, b) => a.order - b.order);
  const folders = (doc.structure?.folders ?? []).slice().sort((a, b) => a.order - b.order);
  const docs: Record<string, TimelineData> = {};
  for (const f of files) docs[f.id] = normalizeDoc(doc.docs?.[f.id]);
  const colorLegend = doc.colorLegend?.length ? doc.colorLegend : DEFAULT_COLOR_LEGEND;
  const current = files[0]?.id ?? null;
  return {
    folders,
    files,
    docs,
    colorLegend,
    currentFileId: current,
    openTabs: current ? [current] : [],
  };
}

/** 新建实例时的默认切片：一条「时间轴」文件，选中并打开 */
function seedEmptySlice(): TimelineSlice {
  const id = crypto.randomUUID();
  const file: TimelineFileMeta = { id, title: "时间轴", order: 0 };
  return {
    folders: [],
    files: [file],
    docs: { [id]: emptyTimelineData() },
    colorLegend: DEFAULT_COLOR_LEGEND,
    currentFileId: id,
    openTabs: [id],
  };
}
