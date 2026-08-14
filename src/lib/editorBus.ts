// 编辑器实例总线：按插件实例 id 记录当前挂载在正文主区域中的 TipTap Editor 实例。
// 供侧边栏（如大纲）拿到对应实例的编辑器做定位/跳转，而不必把 Editor 塞进全局 store。

import type { Editor } from "@tiptap/react";

const active = new Map<string, Editor | null>();

export function setActiveEditor(instanceId: string, editor: Editor | null): void {
  active.set(instanceId, editor);
}

export function getActiveEditor(instanceId: string): Editor | null {
  return active.get(instanceId) ?? null;
}

// —— 图片节点右键菜单总线 ——
// ResizableImage 是 ReactNodeViewRenderer 节点视图（独立 React 树，拿不到 EditorPane 的菜单状态），
// 右键时把操作回调（旋转/删除，走节点视图自身的 updateAttributes/deleteNode，与拖拽缩放同机制）
// 与鼠标坐标经这里交给 EditorPane 打开图片右键菜单。

export interface ImageContextMenuActions {
  /** 顺时针为正：旋转 delta 度（属性值为 0/90/180/270 循环） */
  rotate: (delta: number) => void;
  /** 删除图片节点 */
  remove: () => void;
}

type ImageContextMenuListener = (e: MouseEvent, actions: ImageContextMenuActions) => void;

let imageContextMenuListener: ImageContextMenuListener | null = null;

/** EditorPane 挂载监听；返回取消函数（组件卸载时调用） */
export function setImageContextMenuListener(fn: ImageContextMenuListener | null): () => void {
  imageContextMenuListener = fn;
  return () => {
    if (imageContextMenuListener === fn) imageContextMenuListener = null;
  };
}

/** 图片节点视图右键时调用（e 已 preventDefault） */
export function emitImageContextMenu(e: MouseEvent, actions: ImageContextMenuActions): void {
  imageContextMenuListener?.(e, actions);
}
