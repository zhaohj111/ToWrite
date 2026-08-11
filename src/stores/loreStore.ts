// 设定库状态（core.lore）：分卷（文件夹）+ 设定库文件树、各文件内的卡片/关系边、实例级共享标签。
// 状态按插件实例隔离（设定库实例可存在多个），slices 以实例 id 为键；
// 每个设定库文件是一组卡片（力导向图 / 网格展示），标签跨该实例全部文件共享。

import { create } from "zustand";
import {
  emptyChapterDoc,
  type ChapterDoc,
  type LoreData,
  type LoreDoc,
  type LoreEdge,
  type LoreEntry,
  type LoreFileMeta,
  type LoreFolderMeta,
  type LoreTag,
  type ProjectData,
} from "@/types/writeproj";

/** 设定库插件原型 id（供 saveController / projectStore 识别实例） */
export const LORE_PROTOTYPE = "core.lore";

/** 主区顶部「最近打开」文件标签上限 */
const MAX_TABS = 10;
/** 把文件 id 放入最近打开列表：最新在前、去重、限长 */
function pushTab(tabs: string[], id: string): string[] {
  return [id, ...tabs.filter((t) => t !== id)].slice(0, MAX_TABS);
}

export const DEFAULT_TAGS: LoreTag[] = [
  { id: "tag-char", name: "人物", color: "#d08a76" },
  { id: "tag-world", name: "世界", color: "#7ba6a0" },
  { id: "tag-item", name: "物品", color: "#d7b25c" },
  { id: "tag-org", name: "势力", color: "#9a7bbd" },
];

/** 把字符串内容包装为 TipTap 段落文档（旧格式 content 迁移） */
function stringToDoc(s: string): ChapterDoc {
  const content = s ? [{ type: "text", text: s }] : [];
  return { type: "doc", content: [{ type: "paragraph", content }] };
}

function isDocLike(v: unknown): v is ChapterDoc {
  return !!v && typeof v === "object" && (v as ChapterDoc).type === "doc";
}

/** 补齐卡片缺省字段；旧格式 content 为纯字符串时迁移为 TipTap doc */
export function normalizeEntry(e: Partial<LoreEntry> & { id: string; title: string }): LoreEntry {
  const content = isDocLike(e.content)
    ? e.content
    : typeof e.content === "string"
      ? stringToDoc(e.content)
      : emptyChapterDoc();
  return {
    id: e.id,
    title: e.title,
    category: e.category ?? "其他",
    content,
    tags: e.tags ?? [],
    note: e.note,
    x: e.x,
    y: e.y,
  };
}

export function normalizeLoreData(d: LoreData | undefined): LoreData {
  return {
    cards: (d?.cards ?? []).map((c) => normalizeEntry(c)),
    edges: d?.edges ?? [],
  };
}

/** 补齐实例文档缺省字段，兼容旧格式 */
export function normalizeLoreDoc(doc: LoreDoc | undefined): LoreDoc {
  const files = (doc?.structure?.files ?? []).slice().sort((a, b) => a.order - b.order);
  const folders = (doc?.structure?.folders ?? []).slice().sort((a, b) => a.order - b.order);
  const docs: Record<string, LoreData> = {};
  for (const f of files) docs[f.id] = normalizeLoreData(doc?.docs?.[f.id]);
  return {
    structure: { files, folders },
    tags: doc?.tags?.length ? doc.tags : DEFAULT_TAGS,
    docs,
  };
}

/** 单个设定库实例的完整状态 */
export interface LoreSlice {
  folders: LoreFolderMeta[];
  files: LoreFileMeta[];
  currentFileId: string | null;
  /** 文件 id -> 该文件的卡片/关系边 */
  docs: Record<string, LoreData>;
  /** 实例级共享标签 */
  tags: LoreTag[];
  openTabs: string[];
}

export const EMPTY_LORE_SLICE: LoreSlice = {
  folders: [],
  files: [],
  currentFileId: null,
  docs: {},
  tags: DEFAULT_TAGS,
  openTabs: [],
};

interface LoreState {
  slices: Record<string, LoreSlice>;
  /** 结构变更撤销栈（按实例） */
  undoStacks: Record<string, LoreDoc[]>;
  /** 结构变更重做栈（按实例） */
  redoStacks: Record<string, LoreDoc[]>;
  loadProject: (data: ProjectData, instanceIds: string[]) => void;
  reset: () => void;
  /** 删除实例时移除其切片（文件夹/文件/卡片/连线/标签）与撤销栈，随落盘同步丢弃 */
  removeSlice: (instanceId: string) => void;
  getSlice: (instanceId: string) => LoreSlice;
  /** 载入某个文件；无文件时自动创建默认文件并选中 */
  ensureFile: (instanceId: string) => string | null;
  setCurrentFile: (instanceId: string, fileId: string) => void;
  closeTab: (instanceId: string, fileId: string) => void;
  addFolder: (instanceId: string, title: string) => LoreFolderMeta;
  renameFolder: (instanceId: string, id: string, title: string) => void;
  deleteFolder: (instanceId: string, id: string) => void;
  deleteFolderWithContents: (instanceId: string, id: string) => void;
  addFile: (instanceId: string, title: string, folderId?: string) => LoreFileMeta;
  renameFile: (instanceId: string, id: string, title: string) => void;
  deleteFile: (instanceId: string, id: string) => void;
  moveFolder: (instanceId: string, id: string, beforeId: string | null) => void;
  moveFile: (
    instanceId: string,
    id: string,
    opts: { folderId?: string; beforeId?: string },
  ) => void;
  addCard: (instanceId: string, fileId: string, init?: Partial<LoreEntry>) => LoreEntry | null;
  updateCard: (instanceId: string, fileId: string, id: string, patch: Partial<LoreEntry>) => void;
  deleteCard: (instanceId: string, fileId: string, id: string) => void;
  moveCard: (instanceId: string, fileId: string, id: string, x: number, y: number) => void;
  addEdge: (
    instanceId: string,
    fileId: string,
    source: string,
    target: string,
    label?: string,
    color?: string,
    labelColor?: string,
  ) => void;
  updateEdge: (instanceId: string, fileId: string, id: string, patch: Partial<LoreEdge>) => void;
  deleteEdge: (instanceId: string, fileId: string, id: string) => void;
  addTag: (instanceId: string, name: string, color: string) => LoreTag;
  renameTag: (instanceId: string, id: string, name: string) => void;
  deleteTag: (instanceId: string, id: string) => void;
  /** 收集单个实例的完整文档（供保存控制器落盘） */
  collectDoc: (instanceId: string) => LoreDoc;
  /** 在结构性变更（增删卡片/连线/标签、文件/分卷）前调用，记录撤销快照 */
  record: (instanceId: string) => void;
  /** 撤销最近一次结构性变更 */
  undo: (instanceId: string) => void;
  /** 重做 */
  redo: (instanceId: string) => void;
}

export const useLoreStore = create<LoreState>((set, get) => ({
  slices: {},
  undoStacks: {},
  redoStacks: {},

  loadProject: (data, instanceIds) => {
    const slices: Record<string, LoreSlice> = {};
    for (const id of instanceIds) {
      const doc = data.lore?.[id];
      if (doc) {
        const norm = normalizeLoreDoc(doc);
        const current = norm.structure.files[0]?.id ?? null;
        slices[id] = {
          folders: norm.structure.folders,
          files: norm.structure.files,
          docs: norm.docs,
          tags: norm.tags,
          currentFileId: current,
          openTabs: current ? [current] : [],
        };
      } else {
        // 新工程：默认建一条「设定库」文件，让主区立刻可点即加卡片
        slices[id] = seedEmptySlice();
      }
    }
    set({ slices });
  },

  reset: () => set({ slices: {}, undoStacks: {}, redoStacks: {} }),

  removeSlice: (instanceId) => {
    const { [instanceId]: _gone, ...slices } = get().slices;
    const { [instanceId]: _u, ...undoStacks } = get().undoStacks;
    const { [instanceId]: _r, ...redoStacks } = get().redoStacks;
    set({ slices, undoStacks, redoStacks });
  },

  getSlice: (instanceId) => get().slices[instanceId] ?? EMPTY_LORE_SLICE,

  ensureFile: (instanceId) => {
    const cur = get().slices[instanceId] ?? EMPTY_LORE_SLICE;
    if (cur.files.length > 0) return cur.currentFileId;
    const next = seedEmptySlice();
    set({ slices: { ...get().slices, [instanceId]: next } });
    return next.currentFileId;
  },

  setCurrentFile: (instanceId, fileId) => {
    const cur = get().slices[instanceId] ?? EMPTY_LORE_SLICE;
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
    const cur = get().slices[instanceId] ?? EMPTY_LORE_SLICE;
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
    const cur = get().slices[instanceId] ?? EMPTY_LORE_SLICE;
    const folder: LoreFolderMeta = { id: crypto.randomUUID(), title, order: cur.folders.length };
    set({
      slices: {
        ...get().slices,
        [instanceId]: { ...cur, folders: [...cur.folders, folder] },
      },
    });
    return folder;
  },

  renameFolder: (instanceId, id, title) => {
    const cur = get().slices[instanceId] ?? EMPTY_LORE_SLICE;
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
    const cur = get().slices[instanceId] ?? EMPTY_LORE_SLICE;
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
    const cur = get().slices[instanceId] ?? EMPTY_LORE_SLICE;
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
    const cur = get().slices[instanceId] ?? EMPTY_LORE_SLICE;
    const id = crypto.randomUUID();
    const file: LoreFileMeta = { id, title, order: cur.files.length, folderId };
    set({
      slices: {
        ...get().slices,
        [instanceId]: {
          ...cur,
          files: [...cur.files, file],
          docs: { ...cur.docs, [id]: normalizeLoreData(undefined) },
          currentFileId: id,
          openTabs: pushTab(cur.openTabs, id),
        },
      },
    });
    return file;
  },

  renameFile: (instanceId, id, title) => {
    const cur = get().slices[instanceId] ?? EMPTY_LORE_SLICE;
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
    const cur = get().slices[instanceId] ?? EMPTY_LORE_SLICE;
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
    const cur = get().slices[instanceId] ?? EMPTY_LORE_SLICE;
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
    const cur = get().slices[instanceId] ?? EMPTY_LORE_SLICE;
    const src = cur.files.find((f) => f.id === id);
    if (!src) return;
    const moved = { ...src, folderId };
    if (!folderId) delete moved.folderId;
    const rest = cur.files.filter((f) => f.id !== id);
    const group = (f: LoreFileMeta) => (f.folderId ?? undefined) === (folderId ?? undefined);
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

  addCard: (instanceId, fileId, init) => {
    get().record(instanceId);
    const cur = get().slices[instanceId] ?? EMPTY_LORE_SLICE;
    const doc = cur.docs[fileId];
    if (!doc) return null;
    const entry = normalizeEntry({
      id: crypto.randomUUID(),
      title: init?.title?.trim() || "未命名设定",
      category: init?.category ?? "其他",
      content: init?.content ?? emptyChapterDoc(),
      tags: init?.tags ?? [],
      note: init?.note,
      x: init?.x,
      y: init?.y,
    });
    set({
      slices: {
        ...get().slices,
        [instanceId]: {
          ...cur,
          docs: { ...cur.docs, [fileId]: { ...doc, cards: [...doc.cards, entry] } },
        },
      },
    });
    return entry;
  },

  updateCard: (instanceId, fileId, id, patch) => {
    const cur = get().slices[instanceId] ?? EMPTY_LORE_SLICE;
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
              cards: doc.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)),
            },
          },
        },
      },
    });
  },

  deleteCard: (instanceId, fileId, id) => {
    get().record(instanceId);
    const cur = get().slices[instanceId] ?? EMPTY_LORE_SLICE;
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
              cards: doc.cards.filter((c) => c.id !== id),
              edges: doc.edges.filter((e) => e.source !== id && e.target !== id),
            },
          },
        },
      },
    });
  },

  moveCard: (instanceId, fileId, id, x, y) =>
    get().updateCard(instanceId, fileId, id, { x: Math.round(x), y: Math.round(y) }),

  addEdge: (instanceId, fileId, source, target, label, color, labelColor) => {
    get().record(instanceId);
    const cur = get().slices[instanceId] ?? EMPTY_LORE_SLICE;
    const doc = cur.docs[fileId];
    if (!doc || source === target) return;
    // 已存在同一对卡片的连线（任意方向、任意关系名）则不再重复建立
    if (
      doc.edges.some(
        (e) =>
          (e.source === source && e.target === target) ||
          (e.source === target && e.target === source),
      )
    ) {
      return;
    }
    const edge: LoreEdge = {
      id: crypto.randomUUID(),
      source,
      target,
      label: label?.trim() || undefined,
      color,
      labelColor,
    };
    set({
      slices: {
        ...get().slices,
        [instanceId]: {
          ...cur,
          docs: { ...cur.docs, [fileId]: { ...doc, edges: [...doc.edges, edge] } },
        },
      },
    });
  },

  updateEdge: (instanceId, fileId, id, patch) => {
    get().record(instanceId);
    const cur = get().slices[instanceId] ?? EMPTY_LORE_SLICE;
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
              edges: doc.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)),
            },
          },
        },
      },
    });
  },

  deleteEdge: (instanceId, fileId, id) => {
    get().record(instanceId);
    const cur = get().slices[instanceId] ?? EMPTY_LORE_SLICE;
    const doc = cur.docs[fileId];
    if (!doc) return;
    set({
      slices: {
        ...get().slices,
        [instanceId]: {
          ...cur,
          docs: {
            ...cur.docs,
            [fileId]: { ...doc, edges: doc.edges.filter((e) => e.id !== id) },
          },
        },
      },
    });
  },

  addTag: (instanceId, name, color) => {
    get().record(instanceId);
    const cur = get().slices[instanceId] ?? EMPTY_LORE_SLICE;
    const trimmed = name.trim();
    const existing = cur.tags.find((t) => t.name === trimmed);
    if (existing) return existing;
    const tag: LoreTag = {
      id: crypto.randomUUID(),
      name: trimmed || "未命名标签",
      color,
    };
    set({
      slices: {
        ...get().slices,
        [instanceId]: { ...cur, tags: [...cur.tags, tag] },
      },
    });
    return tag;
  },

  renameTag: (instanceId, id, name) => {
    get().record(instanceId);
    const cur = get().slices[instanceId] ?? EMPTY_LORE_SLICE;
    const trimmed = name.trim();
    if (!trimmed) return;
    set({
      slices: {
        ...get().slices,
        [instanceId]: {
          ...cur,
          tags: cur.tags.map((t) => (t.id === id ? { ...t, name: trimmed } : t)),
        },
      },
    });
  },

  deleteTag: (instanceId, id) => {
    get().record(instanceId);
    const cur = get().slices[instanceId] ?? EMPTY_LORE_SLICE;
    const docs = Object.fromEntries(
      Object.entries(cur.docs).map(([fid, d]) => [
        fid,
        { ...d, cards: d.cards.map((c) => ({ ...c, tags: c.tags.filter((t) => t !== id) })) },
      ]),
    );
    set({
      slices: {
        ...get().slices,
        [instanceId]: {
          ...cur,
          tags: cur.tags.filter((t) => t.id !== id),
          docs,
        },
      },
    });
  },

  collectDoc: (instanceId) => {
    const cur = get().slices[instanceId] ?? EMPTY_LORE_SLICE;
    return {
      structure: { files: cur.files, folders: cur.folders },
      tags: cur.tags,
      docs: cur.docs,
    };
  },

  record: (instanceId) => {
    const doc = get().collectDoc(instanceId);
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
    set((s) => ({
      slices: { ...s.slices, [instanceId]: loreDocToSlice(prev) },
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
    set((s) => ({
      slices: { ...s.slices, [instanceId]: loreDocToSlice(next) },
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

/** 撤销快照（LoreDoc）恢复为切片 */
function loreDocToSlice(doc: LoreDoc): LoreSlice {
  const norm = normalizeLoreDoc(doc);
  const current = norm.structure.files[0]?.id ?? null;
  return {
    folders: norm.structure.folders,
    files: norm.structure.files,
    docs: norm.docs,
    tags: norm.tags,
    currentFileId: current,
    openTabs: current ? [current] : [],
  };
}

/** 新建实例时的默认切片：一条「设定库」文件，选中并打开 */
function seedEmptySlice(): LoreSlice {
  const id = crypto.randomUUID();
  const file: LoreFileMeta = { id, title: "设定库", order: 0 };
  return {
    folders: [],
    files: [file],
    docs: { [id]: normalizeLoreData(undefined) },
    tags: DEFAULT_TAGS,
    currentFileId: id,
    openTabs: [id],
  };
}
