// 宿主通知服务（窗口顶部结果提示）：插件与内部组件共用的轻量封装。
// PluginContext.notify（src/plugins/registry.ts）指向这里；第三方插件无需直接 import 本文件，
// 但内部组件（时间轴 / 设定库面板等不经 activate 的代码）可直接调用助手函数。

import { useNotifyStore, type ToastKind } from "@/stores/notifyStore";

export interface NotifyOptions {
  kind?: ToastKind;
  detail?: string;
  filePath?: string;
  durationMs?: number;
}

/** 通用通知入口；返回提示 id（可用于手动关闭） */
export function notify(message: string, options: NotifyOptions = {}): number {
  return useNotifyStore.getState().push({
    kind: options.kind ?? "info",
    message,
    detail: options.detail,
    filePath: options.filePath,
    durationMs: options.durationMs,
  });
}

/** 成功提示：detail 填导出路径等副文本，filePath 启用「在文件夹中显示」 */
export function notifySuccess(message: string, detail?: string, filePath?: string): number {
  return notify(message, { kind: "success", detail, filePath });
}

/** 错误提示：detail 填错误详情 */
export function notifyError(message: string, detail?: string): number {
  return notify(message, { kind: "error", detail });
}

/** 中性提示 */
export function notifyInfo(message: string, detail?: string): number {
  return notify(message, { kind: "info", detail });
}
