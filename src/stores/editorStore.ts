// 编辑器状态（core.editor）：分卷、章节列表与各章 TipTap JSON 内容。
// v0.6：状态按插件实例隔离（正文 / 大纲…各自独立），slices 以实例 id 为键。
// 字号经级联配置（实例覆盖 > 应用级 > manifest 默认）解析，见 stores/settingsStore.ts。

import { create } from "zustand";
import type { ChapterDoc, ChapterMeta, ProjectData, VolumeMeta } from "@/types/writeproj";
import { emptyChapterDoc } from "@/types/writeproj";

/** 主区顶部「最近打开」文件标签上限 */
const MAX_TABS = 10;
/** 把章节 id 放入最近打开列表：最新在前、去重、限长 */
function pushTab(tabs: string[], id: string): string[] {
  return [id, ...tabs.filter((t) => t !== id)].slice(0, MAX_TABS);
}

/** 单个编辑器实例的完整状态 */
export interface EditorSlice {
  chapters: ChapterMeta[];
  volumes: VolumeMeta[];
  currentChapterId: string | null;
  contents: Record<string, ChapterDoc>;
  openTabs: string[];
}

export const EMPTY_SLICE: EditorSlice = {
  chapters: [],
  volumes: [],
  currentChapterId: null,
  contents: {},
  openTabs: [],
};

/** 在文档首部放一个与章节名一致的 H1：已有 H1 则替换其文本，否则插入到开头 */
function withLeadingH1(doc: ChapterDoc, title: string): ChapterDoc {
  const content = Array.isArray(doc?.content) ? [...(doc.content as unknown[])] : [];
  const first = content[0] as
    | { type?: unknown; attrs?: { level?: unknown } }
    | undefined;
  const h1 = {
    type: "heading",
    attrs: { level: 1 },
    content: [{ type: "text", text: title }],
  };
  if (first && first.type === "heading" && first.attrs?.level === 1) {
    content[0] = h1;
  } else {
    content.unshift(h1);
  }
  return { ...doc, content };
}

/** 默认字号（px）：manifest 出厂默认（core.editor.settings.fontSize 保持一致）/ 工具栏「重置」目标 */
export const DEFAULT_FONT_SIZE = 17;

interface EditorState {
  /** 按实例 id 隔离的编辑器状态 */
  slices: Record<string, EditorSlice>;
  /** 载入工程：为每个编辑器实例建立切片（data.editors 中无则空切片） */
  loadProject: (data: ProjectData, instanceIds: string[]) => void;
  reset: () => void;
  /** 删除实例时移除其切片（分卷/章节/正文），随 .writeproj 落盘时同步丢弃 */
  removeSlice: (instanceId: string) => void;
  getSlice: (instanceId: string) => EditorSlice;
  setCurrentChapter: (instanceId: string, id: string) => void;
  setContent: (instanceId: string, id: string, doc: ChapterDoc) => void;
  closeTab: (instanceId: string, id: string) => void;
  addChapter: (instanceId: string, title: string, volumeId?: string) => ChapterMeta;
  renameChapter: (instanceId: string, id: string, title: string) => void;
  deleteChapter: (instanceId: string, id: string) => void;
  addVolume: (instanceId: string, title: string) => VolumeMeta;
  renameVolume: (instanceId: string, id: string, title: string) => void;
  deleteVolume: (instanceId: string, id: string) => void;
  deleteVolumeWithContents: (instanceId: string, id: string) => void;
  moveVolume: (instanceId: string, id: string, beforeId: string | null) => void;
  moveChapter: (
    instanceId: string,
    id: string,
    opts: { volumeId?: string; beforeId?: string },
  ) => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  slices: {},

  loadProject: (data, instanceIds) => {
    const slices: Record<string, EditorSlice> = {};
    for (const id of instanceIds) {
      const doc = data.editors?.[id];
      if (doc) {
        const chapters = (doc.structure?.chapters ?? [])
          .slice()
          .sort((a, b) => a.order - b.order);
        const volumes = (doc.structure?.volumes ?? [])
          .slice()
          .sort((a, b) => a.order - b.order);
        const contents: Record<string, ChapterDoc> = {};
        for (const ch of chapters) contents[ch.id] = doc.chapters[ch.id] ?? emptyChapterDoc();
        const current = chapters[0]?.id ?? null;
        slices[id] = {
          chapters,
          volumes,
          contents,
          currentChapterId: current,
          openTabs: current ? [current] : [],
        };
      } else {
        slices[id] = { ...EMPTY_SLICE };
      }
    }
    set({ slices });
  },

  reset: () => set({ slices: {} }),

  removeSlice: (instanceId) => {
    const { [instanceId]: _gone, ...slices } = get().slices;
    set({ slices });
  },

  getSlice: (instanceId) => get().slices[instanceId] ?? EMPTY_SLICE,

  setCurrentChapter: (instanceId, id) => {
    const cur = get().slices[instanceId] ?? EMPTY_SLICE;
    set({
      slices: {
        ...get().slices,
        [instanceId]: {
          ...cur,
          currentChapterId: id,
          openTabs: pushTab(cur.openTabs, id),
        },
      },
    });
  },

  setContent: (instanceId, id, doc) => {
    const cur = get().slices[instanceId] ?? EMPTY_SLICE;
    set({
      slices: {
        ...get().slices,
        [instanceId]: { ...cur, contents: { ...cur.contents, [id]: doc } },
      },
    });
  },

  closeTab: (instanceId, id) => {
    const cur = get().slices[instanceId] ?? EMPTY_SLICE;
    const tabs = cur.openTabs.filter((t) => t !== id);
    let current = cur.currentChapterId;
    if (current === id) current = tabs[0] ?? null;
    set({
      slices: {
        ...get().slices,
        [instanceId]: { ...cur, openTabs: tabs, currentChapterId: current },
      },
    });
  },

  addChapter: (instanceId, title, volumeId) => {
    const cur = get().slices[instanceId] ?? EMPTY_SLICE;
    const id = crypto.randomUUID();
    const chapter: ChapterMeta = { id, title, order: cur.chapters.length, volumeId };
    set({
      slices: {
        ...get().slices,
        [instanceId]: {
          ...cur,
          chapters: [...cur.chapters, chapter],
          contents: { ...cur.contents, [id]: withLeadingH1(emptyChapterDoc(), title) },
          currentChapterId: id,
          openTabs: pushTab(cur.openTabs, id),
        },
      },
    });
    return chapter;
  },

  addVolume: (instanceId, title) => {
    const cur = get().slices[instanceId] ?? EMPTY_SLICE;
    const volume: VolumeMeta = { id: crypto.randomUUID(), title, order: cur.volumes.length };
    set({
      slices: {
        ...get().slices,
        [instanceId]: { ...cur, volumes: [...cur.volumes, volume] },
      },
    });
    return volume;
  },

  renameVolume: (instanceId, id, title) => {
    const cur = get().slices[instanceId] ?? EMPTY_SLICE;
    set({
      slices: {
        ...get().slices,
        [instanceId]: {
          ...cur,
          volumes: cur.volumes.map((v) => (v.id === id ? { ...v, title } : v)),
        },
      },
    });
  },

  renameChapter: (instanceId, id, title) => {
    const cur = get().slices[instanceId] ?? EMPTY_SLICE;
    const curContent = cur.contents[id];
    set({
      slices: {
        ...get().slices,
        [instanceId]: {
          ...cur,
          chapters: cur.chapters.map((c) => (c.id === id ? { ...c, title } : c)),
          contents: curContent
            ? { ...cur.contents, [id]: withLeadingH1(curContent, title) }
            : cur.contents,
        },
      },
    });
  },

  deleteChapter: (instanceId, id) => {
    const cur = get().slices[instanceId] ?? EMPTY_SLICE;
    const idx = cur.chapters.findIndex((c) => c.id === id);
    const next = cur.chapters.filter((c) => c.id !== id);
    const newContents = { ...cur.contents };
    delete newContents[id];
    let current = cur.currentChapterId;
    const tabs = cur.openTabs.filter((t) => t !== id);
    if (current === id) {
      current = next[Math.min(Math.max(idx, 0), next.length - 1)]?.id ?? null;
    }
    set({
      slices: {
        ...get().slices,
        [instanceId]: {
          ...cur,
          chapters: next,
          contents: newContents,
          currentChapterId: current,
          openTabs: current ? pushTab(tabs, current) : tabs,
        },
      },
    });
  },

  deleteVolume: (instanceId, id) => {
    const cur = get().slices[instanceId] ?? EMPTY_SLICE;
    set({
      slices: {
        ...get().slices,
        [instanceId]: {
          ...cur,
          volumes: cur.volumes.filter((v) => v.id !== id),
          chapters: cur.chapters.map((c) =>
            c.volumeId === id ? { ...c, volumeId: undefined } : c,
          ),
        },
      },
    });
  },

  deleteVolumeWithContents: (instanceId, id) => {
    const cur = get().slices[instanceId] ?? EMPTY_SLICE;
    const inside = new Set(cur.chapters.filter((c) => c.volumeId === id).map((c) => c.id));
    const newContents = { ...cur.contents };
    for (const cid of inside) delete newContents[cid];
    let current = cur.currentChapterId;
    const tabs = cur.openTabs.filter((t) => !inside.has(t));
    if (current && inside.has(current)) {
      current = cur.chapters.find((c) => !inside.has(c.id))?.id ?? null;
    }
    set({
      slices: {
        ...get().slices,
        [instanceId]: {
          ...cur,
          volumes: cur.volumes.filter((v) => v.id !== id),
          chapters: cur.chapters.filter((c) => c.volumeId !== id),
          contents: newContents,
          currentChapterId: current,
          openTabs: current ? pushTab(tabs, current) : tabs,
        },
      },
    });
  },

  moveVolume: (instanceId, id, beforeId) => {
    const cur = get().slices[instanceId] ?? EMPTY_SLICE;
    const src = cur.volumes.find((v) => v.id === id);
    if (!src) return;
    const rest = cur.volumes.filter((v) => v.id !== id);
    const idx = beforeId ? rest.findIndex((v) => v.id === beforeId) : rest.length;
    const insertAt = idx < 0 ? rest.length : idx;
    const volumes = [...rest.slice(0, insertAt), src, ...rest.slice(insertAt)].map(
      (v, i) => ({ ...v, order: i }),
    );
    set({
      slices: { ...get().slices, [instanceId]: { ...cur, volumes } },
    });
  },

  moveChapter: (instanceId, id, { volumeId, beforeId }) => {
    const cur = get().slices[instanceId] ?? EMPTY_SLICE;
    const src = cur.chapters.find((c) => c.id === id);
    if (!src) return;
    const moved = { ...src, volumeId }; // volumeId 为 undefined 表示未分卷（顶层）
    if (!volumeId) delete moved.volumeId;
    const rest = cur.chapters.filter((c) => c.id !== id);
    const group = (c: ChapterMeta) => (c.volumeId ?? undefined) === (volumeId ?? undefined);
    const members = rest.filter(group);
    const idx = beforeId ? members.findIndex((c) => c.id === beforeId) : members.length;
    const insertAt = idx < 0 ? members.length : idx;
    const reordered = [...members.slice(0, insertAt), moved, ...members.slice(insertAt)];
    const chapters = rest
      .filter((c) => !group(c))
      .concat(reordered)
      .map((c, i) => ({ ...c, order: i }));
    set({
      slices: { ...get().slices, [instanceId]: { ...cur, chapters } },
    });
  },
}));
