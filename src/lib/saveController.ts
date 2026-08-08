// 持久化控制器：Zustand 内存 + 防抖 2 秒 ZIP 落盘（.writeproj）。
// 数据流向：用户交互 -> Zustand Action -> 防抖 2s -> save_project -> Rust 打包 ZIP。

import { saveProject } from "@/lib/tauri";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useEditorStore } from "@/stores/editorStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { LORE_PROTOTYPE, useLoreStore } from "@/stores/loreStore";
import { usePluginStore, EDITOR_PROTOTYPE, TIMELINE_PROTOTYPE } from "@/stores/pluginStore";
import type { EditorDoc, LoreDoc, ProjectData, TimelineDoc } from "@/types/writeproj";

const DEBOUNCE_MS = 2000;

let timer: ReturnType<typeof setTimeout> | null = null;
let busy = false;
let started = false;

function collect(): ProjectData | null {
  const ws = useWorkspaceStore.getState();
  const ed = useEditorStore.getState();
  const tl = useTimelineStore.getState();
  const lo = useLoreStore.getState();
  if (!ws.project) return null;
  // 收集所有编辑器实例（正文 / 大纲…）的独立文档
  const editors: Record<string, EditorDoc> = {};
  for (const inst of usePluginStore.getState().instances) {
    if (!inst.enabled || inst.prototypeId !== EDITOR_PROTOTYPE) continue;
    const slice = ed.getSlice(inst.id);
    editors[inst.id] = {
      structure: { chapters: slice.chapters, volumes: slice.volumes },
      chapters: slice.contents,
    };
  }
  // 收集所有时间轴实例（时间轴…）的独立文档
  const timelines: Record<string, TimelineDoc> = {};
  for (const inst of usePluginStore.getState().instances) {
    if (!inst.enabled || inst.prototypeId !== TIMELINE_PROTOTYPE) continue;
    timelines[inst.id] = tl.collectDoc(inst.id);
  }
  // 收集所有设定库实例（设定库…）的独立文档
  const lore: Record<string, LoreDoc> = {};
  for (const inst of usePluginStore.getState().instances) {
    if (!inst.enabled || inst.prototypeId !== LORE_PROTOTYPE) continue;
    lore[inst.id] = lo.collectDoc(inst.id);
  }
  return {
    meta: { ...ws.project.meta, updatedAt: new Date().toISOString() },
    editors,
    timelines,
    lore,
    // 工程级布局/视图配置：插件实例列表（含顺序/名称/启停/侧栏变体）+ 各编辑器实例字号
    config: {
      instances: usePluginStore.getState().instances,
      editorFontSizes: useEditorStore.getState().fontSizes,
    },
  };
}

async function flush() {
  timer = null;
  if (busy) return; // 上次落盘未完成：跳过本轮，下一次变更会重新调度
  const data = collect();
  if (!data) return;
  busy = true;
  try {
    await saveProject(data);
    useWorkspaceStore.getState().updateProjectMeta({ updatedAt: data.meta.updatedAt });
  } catch (e) {
    console.warn("工程保存失败", e);
  } finally {
    busy = false;
  }
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, DEBOUNCE_MS);
}

/** 启动持久化订阅；打开工程后由 App 初始化一次。 */
export function startSaveController(): () => void {
  if (started) return () => undefined;
  started = true;
  const stores = [useEditorStore, useTimelineStore, useLoreStore, usePluginStore];
  const unsubs = stores.map((s) => s.subscribe(schedule));
  window.addEventListener("beforeunload", () => {
    if (timer) {
      clearTimeout(timer);
      void flush();
    }
  });
  return () => {
    unsubs.forEach((u) => u());
    started = false;
  };
}
