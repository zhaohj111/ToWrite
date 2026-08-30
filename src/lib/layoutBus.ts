// 宿主侧栏临时切换/恢复（用于设定库-时间轴联动拖拽弹窗）：
// 弹窗打开时把侧栏临时切到指定时间轴实例，关闭后恢复之前的侧栏。

import { useLayoutStore } from "@/stores/layoutStore";

let savedSidebarId: string | null = null;

/** 临时显示指定实例的侧边栏；重复调用保留最初快照 */
export function showSidebar(instanceId: string): void {
  if (savedSidebarId === null) {
    savedSidebarId = useLayoutStore.getState().sidebarId;
  }
  useLayoutStore.getState().setSidebar(instanceId);
}

/** 恢复 showSidebar 之前的侧边栏（若无快照则不动作） */
export function restoreSidebar(): void {
  if (savedSidebarId === null) return;
  const id = savedSidebarId;
  savedSidebarId = null;
  useLayoutStore.getState().setSidebar(id);
}

/** 丢弃当前快照（工程关闭/异常时清理） */
export function clearSidebarSnapshot(): void {
  savedSidebarId = null;
}
