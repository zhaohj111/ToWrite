// 时间轴文件格式（.timeline）：一条完整时间轴（含实例级图例）的 JSON 快照。
import type { TimelineData } from "@/types/writeproj";

export const TIMELINE_FORMAT = "towrite.timeline";
export const TIMELINE_FORMAT_VERSION = 1;

export interface TimelineSnapshot {
  format: typeof TIMELINE_FORMAT;
  version: number;
  title: string;
  data: TimelineData;
}

/** 把一条时间轴序列化为 .timeline 文件文本。 */
export function serializeTimeline(title: string, data: TimelineData): string {
  const snapshot: TimelineSnapshot = {
    format: TIMELINE_FORMAT,
    version: TIMELINE_FORMAT_VERSION,
    title: title || "未命名时间轴",
    data,
  };
  return JSON.stringify(snapshot, null, 2);
}

export interface ParsedTimeline {
  title: string;
  data: TimelineData;
}

/** 解析 .timeline 文件文本；格式不合法时抛出明确错误。 */
export function parseTimeline(text: string): ParsedTimeline {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("文件不是有效的时间轴格式（JSON 解析失败）。");
  }
  const obj = raw as Partial<TimelineSnapshot>;
  if (obj.format !== TIMELINE_FORMAT) {
    throw new Error("文件不是拓文时间轴格式（towrite.timeline）。");
  }
  if (typeof obj.version !== "number" || obj.version > TIMELINE_FORMAT_VERSION) {
    throw new Error(`时间轴文件版本 ${obj.version} 高于当前支持版本 ${TIMELINE_FORMAT_VERSION}。`);
  }
  if (!obj.data || !Array.isArray(obj.data.nodes)) {
    throw new Error("时间轴文件缺少 data.nodes，无法导入。");
  }
  return { title: obj.title || "导入的时间轴", data: obj.data };
}
