// 设定库主视图与宿主工具栏之间的轻量通信（按实例 id 注册，支持多实例互不干扰）：
// 工具栏撤销/重做分派——卡片富文本编辑器打开时驱动内容历史，
// 否则回退视图导航历史（返回搜索结果等）。

import { useLoreStore } from "@/stores/loreStore";

interface LoreEditorHandlers {
  undo: () => void;
  redo: () => void;
}

const editors = new Map<string, LoreEditorHandlers>();

export function registerLoreEditor(
  instanceId: string,
  handlers: LoreEditorHandlers | null,
): void {
  if (handlers) editors.set(instanceId, handlers);
  else editors.delete(instanceId);
}

/** 连接图截图导出句柄（由 LoreGraph 注册）：返回 PNG base64；无法捕获返回 null */
type LoreCapture = () => Promise<string | null>;

const captures = new Map<string, LoreCapture>();

export function registerLoreCapture(
  instanceId: string,
  handler: LoreCapture | null,
): void {
  if (handler) captures.set(instanceId, handler);
  else captures.delete(instanceId);
}

/** 导出设定库 PNG：让 LoreGraph 截图当前图（适应全部 → 截取 DOM → 还原视图） */
export async function captureLoreGraph(instanceId: string): Promise<string | null> {
  const handler = captures.get(instanceId);
  if (!handler) return null;
  return await handler();
}

/** 撤销：内容编辑器打开时驱动 TipTap 内容历史，否则撤销结构变更（增删卡片/连线/标签） */
export function requestLoreUndo(instanceId: string): void {
  const ed = editors.get(instanceId);
  if (ed) ed.undo();
  else useLoreStore.getState().undo(instanceId);
}

/** 重做：内容编辑器打开时驱动 TipTap 内容历史，否则重做结构变更 */
export function requestLoreRedo(instanceId: string): void {
  const ed = editors.get(instanceId);
  if (ed) ed.redo();
  else useLoreStore.getState().redo(instanceId);
}
