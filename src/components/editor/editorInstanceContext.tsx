// 插件实例上下文：把当前插件实例 id 提供给侧边栏 / 主视图内的组件，
// 组件据此从对应 store 读取属于自己实例的切片（正文 / 大纲 / 时间轴各自独立）。

import { createContext, useContext } from "react";
import { EMPTY_SLICE, useEditorStore, type EditorSlice } from "@/stores/editorStore";
import {
  EMPTY_TIMELINE_SLICE,
  useTimelineStore,
  type TimelineSlice,
} from "@/stores/timelineStore";
import { EMPTY_LORE_SLICE, useLoreStore, type LoreSlice } from "@/stores/loreStore";

const EditorInstanceContext = createContext<string>("editor");

export const EditorInstanceProvider = EditorInstanceContext.Provider;

export function useEditorInstance(): string {
  return useContext(EditorInstanceContext);
}

/** 当前插件实例 id（正文 / 大纲 / 时间轴…通用的实例上下文） */
export function useInstanceId(): string {
  return useContext(EditorInstanceContext);
}

/** 当前实例的编辑器切片（无则返回空切片） */
export function useEditorSlice(): EditorSlice {
  const instanceId = useEditorInstance();
  return useEditorStore((s) => s.slices[instanceId] ?? EMPTY_SLICE);
}

/** 当前实例的时间轴切片（无则返回空切片） */
export function useTimelineSlice(): TimelineSlice {
  const instanceId = useInstanceId();
  return useTimelineStore((s) => s.slices[instanceId] ?? EMPTY_TIMELINE_SLICE);
}

/** 当前时间轴文件的数据（无文件则返回 null） */
export function useTimelineDoc() {
  const slice = useTimelineSlice();
  const fileId = slice.currentFileId;
  return fileId ? slice.docs[fileId] ?? null : null;
}

/** 当前实例的设定库切片（无则返回空切片） */
export function useLoreSlice(): LoreSlice {
  const instanceId = useInstanceId();
  return useLoreStore((s) => s.slices[instanceId] ?? EMPTY_LORE_SLICE);
}

/** 当前设定库文件的数据（无文件则返回 null） */
export function useLoreDoc() {
  const slice = useLoreSlice();
  const fileId = slice.currentFileId;
  return fileId ? slice.docs[fileId] ?? null : null;
}
