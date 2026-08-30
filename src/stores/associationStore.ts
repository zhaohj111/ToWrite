// 设定库-时间轴联动关联状态（单一数据源）。
// 关联关系只存一份：project-config.json 的 associations.timelineToLore（时间轴文件 id -> 设定卡片 id 列表）。
// 反向视图（卡片 -> 时间轴文件）由本 store 即时推导，不双写。
// 关联变更会进入发起侧实例的撤销栈（本 store 单独保存共享关联段快照）。

import { create } from "zustand";
import type { ProjectData } from "@/types/writeproj";

export interface AssociationsData {
  /** 时间轴文件 id -> 设定卡片 id 列表（唯一、无序，只存 id） */
  timelineToLore: Record<string, string[]>;
}

export const EMPTY_ASSOCIATIONS: AssociationsData = { timelineToLore: {} };

const UNDO_LIMIT = 50;

function normalize(map: Record<string, string[]> | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!map) return out;
  for (const [fileId, cards] of Object.entries(map)) {
    if (!Array.isArray(cards)) continue;
    const next = Array.from(new Set(cards.filter((c): c is string => typeof c === "string")));
    if (next.length > 0) out[fileId] = next;
  }
  return out;
}

function cloneData(data: AssociationsData): AssociationsData {
  return {
    timelineToLore: Object.fromEntries(
      Object.entries(data.timelineToLore).map(([k, v]) => [k, [...v]]),
    ),
  };
}

interface AssociationState {
  timelineToLore: Record<string, string[]>;
  /** 发起侧实例 id -> 关联段撤销栈 */
  undoStacks: Record<string, AssociationsData[]>;
  /** 发起侧实例 id -> 关联段重做栈 */
  redoStacks: Record<string, AssociationsData[]>;
  loadProject: (data: ProjectData) => void;
  reset: () => void;
  /** 取某时间轴文件关联的设定卡片 id 列表 */
  getCardsForFile: (timelineFileId: string) => string[];
  /** 取某设定卡片关联的时间轴文件 id 列表（反向推导，不双写） */
  getFilesForCard: (cardId: string) => string[];
  /** 建立一条关联（发起侧实例用于撤销栈归属） */
  link: (sourceInstanceId: string, timelineFileId: string, cardId: string) => void;
  /** 解除一条关联 */
  unlink: (sourceInstanceId: string, timelineFileId: string, cardId: string) => void;
  /** 整体替换某时间轴文件的关联卡片列表（导入等场景；逐条校验由调用方完成） */
  setFileCards: (sourceInstanceId: string, timelineFileId: string, cardIds: string[]) => void;
  /** 删除时间轴文件时级联清理（不记录撤销栈，随文件删除不可撤销） */
  removeTimelineFile: (timelineFileId: string) => void;
  /** 删除设定卡片时级联清理 */
  removeCard: (cardId: string) => void;
  /** 批量删除设定卡片时级联清理 */
  removeCards: (cardIds: string[]) => void;
  /** 批量删除时间轴文件时级联清理 */
  removeTimelineFiles: (timelineFileIds: string[]) => void;
  /** 保存前兜底过滤悬空引用 */
  prune: (validTimelineFiles: Set<string>, validLoreCards: Set<string>) => void;
  /** 撤销当前实例最近一次关联变更 */
  undo: (instanceId: string) => void;
  /** 重做当前实例最近一次关联变更 */
  redo: (instanceId: string) => void;
  /** 在结构变更前记录关联段快照（关联操作内部调用） */
  record: (instanceId: string) => void;
}

export const useAssociationStore = create<AssociationState>((set, get) => ({
  timelineToLore: {},
  undoStacks: {},
  redoStacks: {},

  loadProject: (data) => {
    const timelineToLore = normalize(data.config?.associations?.timelineToLore);
    set({ timelineToLore, undoStacks: {}, redoStacks: {} });
  },

  reset: () => set({ timelineToLore: {}, undoStacks: {}, redoStacks: {} }),

  getCardsForFile: (timelineFileId) => {
    const list = get().timelineToLore[timelineFileId];
    return list ? [...list] : [];
  },

  getFilesForCard: (cardId) => {
    const out: string[] = [];
    for (const [fileId, cards] of Object.entries(get().timelineToLore)) {
      if (cards.includes(cardId)) out.push(fileId);
    }
    return out;
  },

  link: (sourceInstanceId, timelineFileId, cardId) => {
    const data = get();
    const existing = data.timelineToLore[timelineFileId] ?? [];
    if (existing.includes(cardId)) return;
    data.record(sourceInstanceId);
    set({
      timelineToLore: {
        ...get().timelineToLore,
        [timelineFileId]: [...existing, cardId],
      },
    });
  },

  unlink: (sourceInstanceId, timelineFileId, cardId) => {
    const data = get();
    const existing = data.timelineToLore[timelineFileId] ?? [];
    if (!existing.includes(cardId)) return;
    data.record(sourceInstanceId);
    const next = existing.filter((id) => id !== cardId);
    const timelineToLore = { ...get().timelineToLore };
    if (next.length > 0) timelineToLore[timelineFileId] = next;
    else delete timelineToLore[timelineFileId];
    set({ timelineToLore });
  },

  setFileCards: (sourceInstanceId, timelineFileId, cardIds) => {
    const data = get();
    const unique = Array.from(new Set(cardIds));
    const current = data.timelineToLore[timelineFileId] ?? [];
    const same =
      current.length === unique.length && current.every((id, i) => id === unique[i]);
    if (same) return;
    data.record(sourceInstanceId);
    const timelineToLore = { ...get().timelineToLore };
    if (unique.length > 0) timelineToLore[timelineFileId] = unique;
    else delete timelineToLore[timelineFileId];
    set({ timelineToLore });
  },

  removeTimelineFile: (timelineFileId) => {
    if (!get().timelineToLore[timelineFileId]) return;
    const timelineToLore = { ...get().timelineToLore };
    delete timelineToLore[timelineFileId];
    set({ timelineToLore });
  },

  removeCard: (cardId) => get().removeCards([cardId]),

  removeCards: (cardIds) => {
    const removal = new Set(cardIds);
    const timelineToLore: Record<string, string[]> = {};
    let changed = false;
    for (const [fileId, cards] of Object.entries(get().timelineToLore)) {
      const next = cards.filter((id) => !removal.has(id));
      if (next.length !== cards.length) changed = true;
      if (next.length > 0) timelineToLore[fileId] = next;
    }
    if (changed) set({ timelineToLore });
  },

  removeTimelineFiles: (timelineFileIds) => {
    const removal = new Set(timelineFileIds);
    const timelineToLore = { ...get().timelineToLore };
    let changed = false;
    for (const id of timelineFileIds) {
      if (timelineToLore[id]) {
        delete timelineToLore[id];
        changed = true;
      }
    }
    if (changed) set({ timelineToLore });
  },

  prune: (validTimelineFiles, validLoreCards) => {
    const timelineToLore: Record<string, string[]> = {};
    let changed = false;
    for (const [fileId, cards] of Object.entries(get().timelineToLore)) {
      if (!validTimelineFiles.has(fileId)) {
        changed = true;
        continue;
      }
      const next = cards.filter((id) => validLoreCards.has(id));
      if (next.length !== cards.length) changed = true;
      if (next.length > 0) timelineToLore[fileId] = next;
    }
    if (changed) set({ timelineToLore });
  },

  record: (instanceId) => {
    const snapshot = cloneData({ timelineToLore: get().timelineToLore });
    set((s) => ({
      undoStacks: {
        ...s.undoStacks,
        [instanceId]: [...(s.undoStacks[instanceId] ?? []), snapshot].slice(-UNDO_LIMIT),
      },
      redoStacks: { ...s.redoStacks, [instanceId]: [] },
    }));
  },

  undo: (instanceId) => {
    const stack = get().undoStacks[instanceId] ?? [];
    if (stack.length === 0) return;
    const prev = stack[stack.length - 1];
    const cur = cloneData({ timelineToLore: get().timelineToLore });
    set((s) => ({
      timelineToLore: cloneData(prev).timelineToLore,
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
    const cur = cloneData({ timelineToLore: get().timelineToLore });
    set((s) => ({
      timelineToLore: cloneData(next).timelineToLore,
      redoStacks: { ...s.redoStacks, [instanceId]: stack.slice(0, -1) },
      undoStacks: {
        ...s.undoStacks,
        [instanceId]: [...(s.undoStacks[instanceId] ?? []), cur].slice(-UNDO_LIMIT),
      },
    }));
  },
}));
