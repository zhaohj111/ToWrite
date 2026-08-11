// .writeproj 工程文件的数据模型（与 src-tauri/src/writeproj.rs 的 serde 结构一一对应）。
// v0.5 冻结：chapters/ 下的章节正文为 TipTap JSON 文档。

import type { PluginInstance } from "@/stores/pluginStore";

export interface ProjectMeta {
  id: string;
  name: string;
  note: string;
  createdAt: string;
  updatedAt: string;
  formatVersion: number;
  semanticIndex: boolean;
}

export interface ChapterMeta {
  id: string;
  title: string;
  order: number;
  /** 所属分卷 id；缺省表示未分卷（顶层章节） */
  volumeId?: string;
}

export interface VolumeMeta {
  id: string;
  title: string;
  order: number;
}

export interface StructureData {
  chapters: ChapterMeta[];
  volumes: VolumeMeta[];
}

export interface TimelineNodeData {
  id: string;
  label: string;
  kind: string;
  color: string;
  /** 节点中心点在时间轴画布内容坐标系中的 x（横向时间位置） */
  x: number;
  /** 节点中心点的 y（可自由拖动到轴体上方或下方） */
  y: number;
  /** 自定义颜色时的注释；使用图例色时可不填 */
  note?: string;
}

export interface TimelineEdgeData {
  id: string;
  source: string;
  target: string;
}

export interface ColorLegendItem {
  id: string;
  label: string;
  color: string;
  /** 图例中关闭该颜色时 true（该颜色的标签不显示） */
  hidden?: boolean;
}

export interface TimelineData {
  nodes: TimelineNodeData[];
  edges: TimelineEdgeData[];
  colorLegend: ColorLegendItem[];
  /** 时间区间起点（默认 0） */
  rangeStart: number;
  /** 时间区间终点（默认 10） */
  rangeEnd: number;
  /** 轴体刻度最小值（默认 1）；缩放时自动调大以保持可读 */
  tickStep: number;
}

/** 时间轴文件（一条独立的轴体，含其全部节点） */
export interface TimelineFileMeta {
  id: string;
  title: string;
  order: number;
  /** 所属分卷 id；缺省表示未分卷（顶层） */
  folderId?: string;
}

export interface TimelineFolderMeta {
  id: string;
  title: string;
  order: number;
}

/** 一个时间轴实例（如「时间轴」）的完整文档：文件/分卷树 + 实例级共享图例 + 各文件内容 */
export interface TimelineDoc {
  structure: {
    files: TimelineFileMeta[];
    folders: TimelineFolderMeta[];
  };
  /** 颜色图例跨该实例全部时间轴文件共享 */
  colorLegend?: ColorLegendItem[];
  docs: Record<string, TimelineData>;
}

export interface LoreEntry {
  id: string;
  title: string;
  category: string;
  /** 设定内容（TipTap JSON，与章节正文同格式） */
  content: ChapterDoc;
  /** 标签 id 列表（引用实例级标签 LoreTag.id） */
  tags: string[];
  /** 备注（纯文本） */
  note?: string;
  /** 力导向图中的坐标；仅用户拖拽后持久化，缺省由布局计算 */
  x?: number;
  y?: number;
}

/** 设定库标签（实例级共享，跨文件） */
export interface LoreTag {
  id: string;
  name: string;
  color: string;
}

/** 卡片间自定义关系（图中连线） */
export interface LoreEdge {
  id: string;
  source: string;
  target: string;
  /** 连接关系名，如「师徒」「敌对」 */
  label?: string;
  /** 连接线颜色（新建连线时由工具栏「连接线颜色」确定） */
  color?: string;
  /** 关系文本颜色（新建连线/更改关系名时由工具栏「关系文本颜色」确定） */
  labelColor?: string;
}

/** 单个设定库文件的内容：卡片 + 关系边 */
export interface LoreData {
  cards: LoreEntry[];
  edges: LoreEdge[];
}

/** 设定库文件元数据（文件树节点） */
export interface LoreFileMeta {
  id: string;
  title: string;
  order: number;
  folderId?: string;
}

export interface LoreFolderMeta {
  id: string;
  title: string;
  order: number;
}

export interface LoreStructure {
  files: LoreFileMeta[];
  folders: LoreFolderMeta[];
}

/** 一个设定库实例的完整文档：文件/分卷树 + 共享标签 + 各文件内容 */
export interface LoreDoc {
  structure: LoreStructure;
  /** 标签跨该实例全部文件共享 */
  tags: LoreTag[];
  docs: Record<string, LoreData>;
}

/** TipTap 文档（JSON），v0.5 冻结的 chapters/ 内容格式 */
export type ChapterDoc = Record<string, unknown>;

/** 一个编辑器实例（如「正文」「大纲」）的完整文档：章节结构 + 各章正文 */
export interface EditorDoc {
  structure: StructureData;
  chapters: Record<string, ChapterDoc>;
}

/** 工程级布局/视图配置（插件实例列表、实例字号等），存于工程内 project-config.json */
export interface ProjectConfig {
  /** 工程插件实例列表（含顺序、名称、启停、侧栏变体）；缺省时回退程序级模板 */
  instances?: PluginInstance[];
  /** 各编辑器实例的字号（px，实例 id -> 字号）；缺省时回退程序级默认字号。
      v0.6 起不再写入（迁移为 instanceSettings.<id>.fontSize），仅保留读取兼容 */
  editorFontSizes?: Record<string, number>;
  /** 实例级设置覆盖（级联第 ① 层）：instanceId -> key -> value */
  instanceSettings?: Record<string, Record<string, unknown>>;
  /** 该工程的默认主视图（实例 id）；缺省时打开工程回退 "editor" */
  mainView?: string;
}

export interface ProjectData {
  meta: ProjectMeta;
  /** 按编辑器实例 id 存放的多份文档（正文/大纲各自独立） */
  editors: Record<string, EditorDoc>;
  /** 按时间轴实例 id 存放的多份文档（文件/分卷树 + 各文件内容） */
  timelines: Record<string, TimelineDoc>;
  /** 旧版单时间轴（v1）；读盘时已迁移进 timelines，仅保留类型兼容 */
  timeline?: TimelineData;
  /** 按设定库实例 id（lore…）存放的多份文档（文件/分卷树 + 共享标签 + 各文件内容） */
  lore: Record<string, LoreDoc>;
  /** 工程级布局/视图配置（实例顺序、实例字号等） */
  config?: ProjectConfig;
}

export const EMPTY_DOC: ChapterDoc = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export function emptyChapterDoc(): ChapterDoc {
  return JSON.parse(JSON.stringify(EMPTY_DOC));
}
