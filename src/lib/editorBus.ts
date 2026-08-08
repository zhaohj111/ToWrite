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
