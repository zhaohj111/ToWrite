// 设定库文件格式（.lore）：一个设定库文件（卡片+关系边）+ 实例级标签的 JSON 快照。
import type { LoreData, LoreTag } from "@/types/writeproj";

export const LORE_FORMAT = "towrite.lore";
export const LORE_FORMAT_VERSION = 1;

export interface LoreSnapshot {
  format: typeof LORE_FORMAT;
  version: number;
  title: string;
  data: LoreData;
  tags?: LoreTag[];
}

/** 把一个设定库文件序列化为 .lore 文件文本。 */
export function serializeLore(title: string, data: LoreData, tags: LoreTag[]): string {
  const snapshot: LoreSnapshot = {
    format: LORE_FORMAT,
    version: LORE_FORMAT_VERSION,
    title: title || "未命名设定库",
    data,
    tags,
  };
  return JSON.stringify(snapshot, null, 2);
}

export interface ParsedLore {
  title: string;
  data: LoreData;
  tags: LoreTag[];
}

/** 解析 .lore 文件文本；格式不合法时抛出明确错误。 */
export function parseLore(text: string): ParsedLore {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("文件不是有效的设定库格式（JSON 解析失败）。");
  }
  const obj = raw as Partial<LoreSnapshot>;
  if (obj.format !== LORE_FORMAT) {
    throw new Error("文件不是拓文设定库格式（towrite.lore）。");
  }
  if (typeof obj.version !== "number" || obj.version > LORE_FORMAT_VERSION) {
    throw new Error(`设定库文件版本 ${obj.version} 高于当前支持版本 ${LORE_FORMAT_VERSION}。`);
  }
  if (!obj.data || !Array.isArray(obj.data.cards)) {
    throw new Error("设定库文件缺少 data.cards，无法导入。");
  }
  return {
    title: obj.title || "导入的设定库",
    data: obj.data,
    tags: Array.isArray(obj.tags) ? obj.tags : [],
  };
}
