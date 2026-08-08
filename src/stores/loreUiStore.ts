// 设定库主视图的轻量 UI 状态（视图类不持久化，仅本会话）。
// 按插件实例隔离；含视图导航历史（撤销/重做可返回搜索结果等）。
// 注意：内容编辑的撤销/重做由卡片富文本编辑器自身负责（TipTap），此处只管视图状态。
// 标签筛选为追加式（activeTags 命中任一即入结果）；连接线颜色/关系文本颜色供新建连线/改名时起效，
// 并持久化到程序配置（config.json），避免每次打开工程恢复默认色。

import { create } from "zustand";
import { getSetting, setSetting } from "@/lib/settings";

/** 连接线 / 关系文本缺省颜色（与 loreGraph 的 DEFAULT_EDGE_COLOR 一致） */
export const DEFAULT_LORE_EDGE_COLOR = "#8a8f98";
/** 持久化配置键 */
const KEY_EDGE_COLOR = "lore.edgeColor";
const KEY_EDGE_LABEL_COLOR = "lore.edgeLabelColor";

export type LoreLayout = "graph" | "grid";

export interface LoreViewState {
  layout: LoreLayout;
  /** 设定名/内容搜索词（提交式，非逐键） */
  query: string;
  /** 追加式标签筛选：设定命中任一标签即加入结果 */
  activeTags: string[];
  /** 当前选中的卡片（图中高亮） */
  selectedCardId: string | null;
  /** 正在编辑的卡片（null = 未打开编辑器） */
  editingId: string | null;
}

export interface LoreUiSlice {
  view: LoreViewState;
  past: LoreViewState[];
  future: LoreViewState[];
  /** 连接线颜色（新建连线/更改关系名时写入连线） */
  edgeColor: string;
  /** 关系文本颜色（新建连线/更改关系名时写入连线） */
  edgeLabelColor: string;
}

export const EMPTY_LORE_UI_SLICE: LoreUiSlice = {
  view: {
    layout: "graph",
    query: "",
    activeTags: [],
    selectedCardId: null,
    editingId: null,
  },
  past: [],
  future: [],
  edgeColor: DEFAULT_LORE_EDGE_COLOR,
  edgeLabelColor: DEFAULT_LORE_EDGE_COLOR,
};

function sameView(a: LoreViewState, b: LoreViewState): boolean {
  return (
    a.layout === b.layout &&
    a.query === b.query &&
    a.selectedCardId === b.selectedCardId &&
    a.editingId === b.editingId &&
    a.activeTags.length === b.activeTags.length &&
    a.activeTags.every((t, i) => t === b.activeTags[i])
  );
}

/** 历史深度上限 */
const MAX_HISTORY = 50;

interface LoreUiState {
  slices: Record<string, LoreUiSlice>;
  /** 全局缺省连接线颜色（持久化；实例未单独设置时生效） */
  edgeColor: string;
  /** 全局缺省关系文本颜色（持久化；实例未单独设置时生效） */
  edgeLabelColor: string;
  reset: () => void;
  getSlice: (instanceId: string) => LoreUiSlice;
  /** 启动时从配置读取持久化的颜色 */
  init: () => Promise<void>;
  /** 切换到图/网格布局 */
  setLayout: (instanceId: string, layout: LoreLayout) => void;
  /** 提交搜索词（入历史） */
  setQuery: (instanceId: string, query: string) => void;
  /** 追加式标签筛选：切换某标签是否在筛选目标中（入历史） */
  toggleTagFilter: (instanceId: string, tagId: string) => void;
  /** 清空标签筛选（入历史） */
  clearTagFilter: (instanceId: string) => void;
  /** 图中单选：只高亮，不开编辑器 */
  selectCard: (instanceId: string, cardId: string | null) => void;
  /** 打开卡片编辑器 */
  openCard: (instanceId: string, cardId: string) => void;
  /** 关闭卡片编辑器，返回之前的视图 */
  closeCard: (instanceId: string) => void;
  /** 网格「在导向图中显示」：切图、清过滤、选中并定位该卡片 */
  showInGraph: (instanceId: string, cardId: string) => void;
  /** 设置连接线颜色（不入历史） */
  setEdgeColor: (instanceId: string, color: string) => void;
  /** 设置关系文本颜色（不入历史） */
  setEdgeLabelColor: (instanceId: string, color: string) => void;
  undo: (instanceId: string) => void;
  redo: (instanceId: string) => void;
}

export const useLoreUiStore = create<LoreUiState>((set, get) => ({
  slices: {},
  edgeColor: DEFAULT_LORE_EDGE_COLOR,
  edgeLabelColor: DEFAULT_LORE_EDGE_COLOR,

  reset: () => set({ slices: {} }),

  getSlice: (instanceId) => get().slices[instanceId] ?? EMPTY_LORE_UI_SLICE,

  init: async () => {
    const edgeColor = await getSetting<string>(KEY_EDGE_COLOR, DEFAULT_LORE_EDGE_COLOR);
    const edgeLabelColor = await getSetting<string>(
      KEY_EDGE_LABEL_COLOR,
      DEFAULT_LORE_EDGE_COLOR,
    );
    set((s) => ({
      edgeColor,
      edgeLabelColor,
      // 把全局颜色补到尚未单独设置的实例上
      slices: Object.fromEntries(
        Object.entries(s.slices).map(([id, sl]) => [
          id,
          {
            ...sl,
            edgeColor: sl.edgeColor ?? edgeColor,
            edgeLabelColor: sl.edgeLabelColor ?? edgeLabelColor,
          },
        ]),
      ),
    }));
  },

  // 切到力导向图时清空搜索/标签筛选（否则网格会被强制展示）；可用撤销找回
  setLayout: (instanceId, layout) =>
    set((s) => {
      const base = s.slices[instanceId]?.view ?? EMPTY_LORE_UI_SLICE.view;
      return commit(
        s,
        instanceId,
        layout === "graph"
          ? { ...base, layout, query: "", activeTags: [] }
          : { ...base, layout },
      );
    }),

  setQuery: (instanceId, query) =>
    set((s) =>
      commit(s, instanceId, { ...(s.slices[instanceId]?.view ?? EMPTY_LORE_UI_SLICE.view), query }),
    ),

  toggleTagFilter: (instanceId, tagId) =>
    set((s) => {
      const cur = s.slices[instanceId]?.view ?? EMPTY_LORE_UI_SLICE.view;
      const has = cur.activeTags.includes(tagId);
      const activeTags = has
        ? cur.activeTags.filter((t) => t !== tagId)
        : [...cur.activeTags, tagId];
      return commit(s, instanceId, { ...cur, activeTags });
    }),

  clearTagFilter: (instanceId) =>
    set((s) => {
      const cur = s.slices[instanceId]?.view ?? EMPTY_LORE_UI_SLICE.view;
      if (cur.activeTags.length === 0) return s;
      return commit(s, instanceId, { ...cur, activeTags: [] });
    }),

  // 图中单选高亮：不写入历史（撤销/重做只管导航动作，不逐级回退点击）
  selectCard: (instanceId, selectedCardId) =>
    set((s) => {
      const slice = s.slices[instanceId] ?? EMPTY_LORE_UI_SLICE;
      if (slice.view.selectedCardId === selectedCardId) return s;
      return {
        slices: {
          ...s.slices,
          [instanceId]: { ...slice, view: { ...slice.view, selectedCardId } },
        },
      };
    }),

  openCard: (instanceId, cardId) =>
    set((s) =>
      commit(s, instanceId, {
        ...(s.slices[instanceId]?.view ?? EMPTY_LORE_UI_SLICE.view),
        selectedCardId: cardId,
        editingId: cardId,
      }),
    ),

  closeCard: (instanceId) =>
    set((s) =>
      commit(s, instanceId, {
        ...(s.slices[instanceId]?.view ?? EMPTY_LORE_UI_SLICE.view),
        selectedCardId: null,
        editingId: null,
      }),
    ),

  showInGraph: (instanceId, cardId) =>
    set((s) =>
      commit(s, instanceId, {
        layout: "graph",
        query: "",
        activeTags: [],
        selectedCardId: cardId,
        editingId: null,
      }),
    ),

  setEdgeColor: (instanceId, color) =>
    set((s) => {
      const slice = s.slices[instanceId] ?? EMPTY_LORE_UI_SLICE;
      void setSetting(KEY_EDGE_COLOR, color);
      return {
        edgeColor: color,
        slices: { ...s.slices, [instanceId]: { ...slice, edgeColor: color } },
      };
    }),

  setEdgeLabelColor: (instanceId, color) =>
    set((s) => {
      const slice = s.slices[instanceId] ?? EMPTY_LORE_UI_SLICE;
      void setSetting(KEY_EDGE_LABEL_COLOR, color);
      return {
        edgeLabelColor: color,
        slices: { ...s.slices, [instanceId]: { ...slice, edgeLabelColor: color } },
      };
    }),

  undo: (instanceId) =>
    set((s) => {
      const slice = s.slices[instanceId] ?? EMPTY_LORE_UI_SLICE;
      if (slice.past.length === 0) return s;
      const prev = slice.past[slice.past.length - 1];
      return {
        slices: {
          ...s.slices,
          [instanceId]: {
            ...slice,
            view: prev,
            past: slice.past.slice(0, -1),
            future: [slice.view, ...slice.future],
          },
        },
      };
    }),

  redo: (instanceId) =>
    set((s) => {
      const slice = s.slices[instanceId] ?? EMPTY_LORE_UI_SLICE;
      if (slice.future.length === 0) return s;
      const next = slice.future[0];
      return {
        slices: {
          ...s.slices,
          [instanceId]: {
            ...slice,
            view: next,
            past: [...slice.past, slice.view],
            future: slice.future.slice(1),
          },
        },
      };
    }),
}));

/** 提交新视图：与当前相同则不动作；否则入 past、清 future */
function commit(
  state: LoreUiState & { slices: Record<string, LoreUiSlice> },
  instanceId: string,
  next: LoreViewState,
): Partial<{ slices: Record<string, LoreUiSlice> }> {
  const slice = state.slices[instanceId] ?? EMPTY_LORE_UI_SLICE;
  if (sameView(slice.view, next)) return {};
  return {
    slices: {
      ...state.slices,
      [instanceId]: {
        ...slice,
        view: next,
        past: [...slice.past, slice.view].slice(-MAX_HISTORY),
        future: [],
      },
    },
  };
}
