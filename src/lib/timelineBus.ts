// 时间轴主视图与宿主工具栏之间的轻量通信：
// 宿主「文件标签」下方工具栏的适配按钮 -> 当前时间轴实例的视图 / 撤销 / 重做。
// 按实例 id 注册，支持多个时间轴实例互不干扰。

const fitHandlers = new Map<string, () => void>();
const undoHandlers = new Map<string, () => void>();
const redoHandlers = new Map<string, () => void>();

export function registerFitHandler(instanceId: string, fn: () => void): () => void {
  fitHandlers.set(instanceId, fn);
  return () => {
    fitHandlers.delete(instanceId);
  };
}

export function requestFit(instanceId: string): void {
  fitHandlers.get(instanceId)?.();
}

export function registerUndoHandler(instanceId: string, fn: () => void): () => void {
  undoHandlers.set(instanceId, fn);
  return () => {
    undoHandlers.delete(instanceId);
  };
}

export function registerRedoHandler(instanceId: string, fn: () => void): () => void {
  redoHandlers.set(instanceId, fn);
  return () => {
    redoHandlers.delete(instanceId);
  };
}

export function requestTimelineUndo(instanceId: string): void {
  undoHandlers.get(instanceId)?.();
}

export function requestTimelineRedo(instanceId: string): void {
  redoHandlers.get(instanceId)?.();
}
