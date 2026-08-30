// 设定库-时间轴联动的跨实例跳转与名称解析工具。
// 关联只存 id，所有名称/位置均在展示时从对应 store 实时解析。

import { usePluginStore, TIMELINE_PROTOTYPE } from "@/stores/pluginStore";
import { LORE_PROTOTYPE } from "@/stores/loreStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { useLoreStore } from "@/stores/loreStore";
import { useAssociationStore } from "@/stores/associationStore";
import { useLayoutStore } from "@/stores/layoutStore";
import { useLoreUiStore } from "@/stores/loreUiStore";
import { requestLoreFocus } from "@/lib/loreBus";

export interface TimelineFileRef {
  instanceId: string;
  fileId: string;
  title: string;
  instanceName: string;
}

export interface LoreCardRef {
  instanceId: string;
  fileId: string;
  cardId: string;
  title: string;
  instanceName: string;
}

/** 收集当前工程所有启用时间轴实例里的时间轴文件 */
export function getAllTimelineFiles(): TimelineFileRef[] {
  const out: TimelineFileRef[] = [];
  const tl = useTimelineStore.getState();
  for (const inst of usePluginStore.getState().instances) {
    if (!inst.enabled || inst.prototypeId !== TIMELINE_PROTOTYPE) continue;
    const slice = tl.getSlice(inst.id);
    for (const f of slice.files) {
      out.push({ instanceId: inst.id, fileId: f.id, title: f.title, instanceName: inst.name });
    }
  }
  return out;
}

/** 收集当前工程所有启用设定库实例里的设定卡片 */
export function getAllLoreCards(): LoreCardRef[] {
  const out: LoreCardRef[] = [];
  const lo = useLoreStore.getState();
  for (const inst of usePluginStore.getState().instances) {
    if (!inst.enabled || inst.prototypeId !== LORE_PROTOTYPE) continue;
    const slice = lo.getSlice(inst.id);
    for (const f of slice.files) {
      for (const c of slice.docs[f.id]?.cards ?? []) {
        out.push({
          instanceId: inst.id,
          fileId: f.id,
          cardId: c.id,
          title: c.title,
          instanceName: inst.name,
        });
      }
    }
  }
  return out;
}

/** 按时间轴文件 id 查找所在实例与文件标题 */
export function findTimelineFile(fileId: string): TimelineFileRef | undefined {
  return getAllTimelineFiles().find((f) => f.fileId === fileId);
}

/** 按设定卡片 id 查找所在实例/文件/标题 */
export function findLoreCard(cardId: string): LoreCardRef | undefined {
  return getAllLoreCards().find((c) => c.cardId === cardId);
}

/** 取某个时间轴文件关联的设定卡片展示数据（已按名称实时解析） */
export function getCardRefsForTimelineFile(fileId: string): LoreCardRef[] {
  const ids = useAssociationStore.getState().getCardsForFile(fileId);
  const all = getAllLoreCards();
  return ids.map((id) => all.find((c) => c.cardId === id)).filter((c): c is LoreCardRef => !!c);
}

/** 取某张设定卡片关联的时间轴文件展示数据（反向即时推导） */
export function getFileRefsForCard(cardId: string): TimelineFileRef[] {
  const ids = useAssociationStore.getState().getFilesForCard(cardId);
  const all = getAllTimelineFiles();
  return ids.map((id) => all.find((f) => f.fileId === id)).filter((f): f is TimelineFileRef => !!f);
}

/** 设定库→时间轴：切换主视图/侧栏到对应时间轴实例并打开文件 */
export function openTimelineFromLoreFile(fileId: string): void {
  const ref = findTimelineFile(fileId);
  if (!ref) return;
  useTimelineStore.getState().setCurrentFile(ref.instanceId, fileId);
  useLayoutStore.getState().setMainView(ref.instanceId);
  useLayoutStore.getState().setSidebar(ref.instanceId);
}

/** 时间轴→设定库：切换主视图/侧栏到对应设定库实例，切到连接图并居中选中卡片 */
export function openLoreFromTimelineCard(cardId: string): void {
  const ref = findLoreCard(cardId);
  if (!ref) return;
  useLoreStore.getState().setCurrentFile(ref.instanceId, ref.fileId);
  useLoreUiStore.getState().showInGraph(ref.instanceId, ref.cardId);
  useLayoutStore.getState().setMainView(ref.instanceId);
  useLayoutStore.getState().setSidebar(ref.instanceId);
  // 等待连接图挂载后居中（若不在此实例，刚切换主视图时 LoreGraph 尚未注册处理器）
  window.setTimeout(() => requestLoreFocus(ref.instanceId, ref.cardId), 80);
}
