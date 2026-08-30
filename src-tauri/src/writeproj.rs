//! .writeproj 工程文件的读写（ZIP 容器）。
//!
//! 内部结构：
//!   project.json      - 工程元数据（名称、备注、创建/更新时间等）
//!   editors.json      - 按编辑器实例 id 存放的多份编辑器文档
//!   timelines.json    - 按时间轴实例 id 存放的多份时间轴文档（文件/分卷树 + 各文件节点）
//!   lore.json         - 按设定库实例 id 存放的多份设定库文档（文件/分卷树 + 共享标签 + 各文件内容）
//! 兼容：旧版 structure.json / chapters/* / timeline.json / lore/<id>.json 在读取时迁移进新格式。

use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;

use chrono::Local;
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

pub fn now_iso() -> String {
    Local::now().to_rfc3339()
}

pub fn new_id() -> String {
    Uuid::new_v4().to_string()
}

fn default_format_version() -> u32 {
    1
}

fn default_kind() -> String {
    "event".to_string()
}

fn default_range_start() -> f64 {
    0.0
}

fn default_range_end() -> f64 {
    10.0
}

fn default_tick_step() -> f64 {
    1.0
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMeta {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub note: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default = "default_format_version")]
    pub format_version: u32,
    #[serde(default)]
    pub semantic_index: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterMeta {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub order: u32,
    #[serde(default)]
    pub volume_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VolumeMeta {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub order: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StructureData {
    #[serde(default)]
    pub chapters: Vec<ChapterMeta>,
    #[serde(default)]
    pub volumes: Vec<VolumeMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineNode {
    pub id: String,
    pub label: String,
    #[serde(default = "default_kind")]
    pub kind: String,
    #[serde(default)]
    pub color: String,
    pub x: f64,
    pub y: f64,
    #[serde(default)]
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineEdge {
    pub id: String,
    pub source: String,
    pub target: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColorLegendItem {
    pub id: String,
    pub label: String,
    pub color: String,
    #[serde(default)]
    pub hidden: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TimelineData {
    #[serde(default)]
    pub nodes: Vec<TimelineNode>,
    #[serde(default)]
    pub edges: Vec<TimelineEdge>,
    #[serde(default)]
    pub color_legend: Vec<ColorLegendItem>,
    #[serde(default = "default_range_start")]
    pub range_start: f64,
    #[serde(default = "default_range_end")]
    pub range_end: f64,
    #[serde(default = "default_tick_step")]
    pub tick_step: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LoreEntry {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub category: String,
    /// 设定内容（TipTap JSON，与章节正文同格式；旧版纯字符串可反序列化为 String 值）
    #[serde(default)]
    pub content: serde_json::Value,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default)]
    pub x: Option<f64>,
    #[serde(default)]
    pub y: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoreTag {
    pub id: String,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoreEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    #[serde(default)]
    pub label: Option<String>,
    /// 连接线颜色（新建连线时由工具栏「连接线颜色」确定）
    #[serde(default)]
    pub color: Option<String>,
    /// 关系文本颜色（新建连线/更改关系名时由工具栏「关系文本颜色」确定）
    #[serde(default)]
    pub label_color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LoreData {
    #[serde(default)]
    pub cards: Vec<LoreEntry>,
    #[serde(default)]
    pub edges: Vec<LoreEdge>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoreFileMeta {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub order: u32,
    #[serde(default)]
    pub folder_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoreFolderMeta {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub order: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LoreStructure {
    #[serde(default)]
    pub files: Vec<LoreFileMeta>,
    #[serde(default)]
    pub folders: Vec<LoreFolderMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LoreDoc {
    #[serde(default)]
    pub structure: LoreStructure,
    /// 标签跨该实例全部文件共享
    #[serde(default)]
    pub tags: Vec<LoreTag>,
    #[serde(default)]
    pub docs: HashMap<String, LoreData>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct EditorDoc {
    #[serde(default)]
    pub structure: StructureData,
    #[serde(default)]
    pub chapters: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineFileMeta {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub order: u32,
    #[serde(default)]
    pub folder_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineFolderMeta {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub order: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TimelineStructure {
    #[serde(default)]
    pub files: Vec<TimelineFileMeta>,
    #[serde(default)]
    pub folders: Vec<TimelineFolderMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TimelineDoc {
    #[serde(default)]
    pub structure: TimelineStructure,
    /// 颜色图例跨该实例全部时间轴文件共享
    #[serde(default)]
    pub color_legend: Vec<ColorLegendItem>,
    #[serde(default)]
    pub docs: HashMap<String, TimelineData>,
}

/// 工程内持久化的插件实例（存在哪些实例 + 顺序 + 名称/启停/侧栏变体），与程序级模板相互隔离
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPluginInstance {
    pub id: String,
    /// 插件原型 id，如 core.editor
    pub prototype_id: String,
    /// 显示名称，如「正文」「大纲」
    pub name: String,
    /// 原型 sidebars 中选中的变体 id；null = 不启用侧边栏
    #[serde(default)]
    pub sidebar_view_id: Option<String>,
    #[serde(default)]
    pub enabled: bool,
}

/// 设定库-时间轴联动关联段（单一数据源，只存 id）。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectAssociations {
    /// 时间轴文件 id -> 设定卡片 id 列表
    #[serde(default)]
    pub timeline_to_lore: HashMap<String, Vec<String>>,
}

/// 工程级布局/视图配置（插件实例列表、实例字号等），存于工程内 `project-config.json`。
/// 全部字段可选：旧工程读取时缺省为空，回退到程序级配置/默认值。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfig {
    /// 工程插件实例列表（含顺序、名称、启停、侧栏变体）；缺省时回退程序级模板
    #[serde(default)]
    pub instances: Option<Vec<ProjectPluginInstance>>,
    /// 各编辑器实例的字号（px，实例 id -> 字号）；缺省时回退程序级默认字号。
    /// v0.6 起不再写入（迁移为 instance_settings.<id>.fontSize），仅保留读取兼容
    #[serde(default)]
    pub editor_font_sizes: Option<HashMap<String, u32>>,
    /// 实例级设置覆盖（级联第 ① 层）：instanceId -> key -> value
    #[serde(default)]
    pub instance_settings: Option<HashMap<String, HashMap<String, serde_json::Value>>>,
    /// 该工程的默认主视图（实例 id）；缺省时打开工程回退 "editor"
    #[serde(default)]
    pub main_view: Option<String>,
    /// 设定库-时间轴联动关联；旧工程缺省为空段
    #[serde(default)]
    pub associations: Option<ProjectAssociations>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectData {
    pub meta: ProjectMeta,
    /// 按编辑器实例 id（正文/大纲…）存放的多份文档
    #[serde(default)]
    pub editors: HashMap<String, EditorDoc>,
    /// 按时间轴实例 id（时间轴…）存放的多份文档
    #[serde(default)]
    pub timelines: HashMap<String, TimelineDoc>,
    /// 旧版单时间轴（v1 兼容，读取时迁移进 timelines）
    #[serde(default)]
    pub timeline: TimelineData,
    /// 按设定库实例 id（lore…）存放的多份文档（文件/分卷树 + 共享标签 + 各文件内容）
    #[serde(default)]
    pub lore: HashMap<String, LoreDoc>,
    /// 工程级布局/视图配置（实例顺序、实例字号等）
    #[serde(default)]
    pub config: ProjectConfig,
}

pub fn empty_project(name: &str) -> ProjectData {
    let now = now_iso();
    let meta = ProjectMeta {
        id: new_id(),
        name: name.to_string(),
        note: String::new(),
        created_at: now.clone(),
        updated_at: now,
        format_version: 2,
        semantic_index: false,
    };
    ProjectData {
        meta,
        editors: HashMap::new(),
        timelines: HashMap::new(),
        timeline: TimelineData::default(),
        lore: HashMap::new(),
        config: ProjectConfig::default(),
    }
}

pub fn write_project_file(path: &Path, data: &ProjectData) -> Result<(), String> {
    let file = File::create(path).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    write_json_entry(&mut zip, "project.json", &data.meta, &options)?;
    write_json_entry(&mut zip, "editors.json", &data.editors, &options)?;
    write_json_entry(&mut zip, "timelines.json", &data.timelines, &options)?;
    write_json_entry(&mut zip, "lore.json", &data.lore, &options)?;
    write_json_entry(&mut zip, "project-config.json", &data.config, &options)?;

    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

fn write_json_entry<W: Write + std::io::Seek>(
    zip: &mut ZipWriter<W>,
    name: &str,
    value: &impl Serialize,
    options: &SimpleFileOptions,
) -> Result<(), String> {
    let bytes = serde_json::to_vec(value).map_err(|e| e.to_string())?;
    zip.start_file(name, *options).map_err(|e| e.to_string())?;
    zip.write_all(&bytes).map_err(|e| e.to_string())?;
    Ok(())
}

fn read_json_entry<T: for<'de> Deserialize<'de>>(
    archive: &mut ZipArchive<File>,
    name: &str,
) -> Result<T, String> {
    let mut entry = archive.by_name(name).map_err(|e| e.to_string())?;
    let mut s = String::new();
    entry.read_to_string(&mut s).map_err(|e| e.to_string())?;
    serde_json::from_str(&s).map_err(|e| e.to_string())
}

pub fn read_meta_only(path: &Path) -> Result<ProjectMeta, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
    read_json_entry(&mut archive, "project.json")
}

pub fn read_project_file(path: &Path) -> Result<ProjectData, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;

    let meta: ProjectMeta = read_json_entry(&mut archive, "project.json")?;

    // 新格式 editors.json 按实例存放多份编辑器文档；旧格式（structure.json + chapters/*）迁移为 "editor" 实例
    let editors: HashMap<String, EditorDoc> = read_json_entry(&mut archive, "editors.json")
        .unwrap_or_else(|_| {
            let structure: StructureData = read_json_entry(&mut archive, "structure.json")
                .unwrap_or_default();
            let mut chapters: HashMap<String, serde_json::Value> = HashMap::new();
            for i in 0..archive.len() {
                if let Ok(mut entry) = archive.by_index(i) {
                    let name = entry.name().to_string();
                    if let Some(rest) = name.strip_prefix("chapters/") {
                        if let Some(id) = rest.strip_suffix(".json") {
                            let mut s = String::new();
                            if entry.read_to_string(&mut s).is_ok() {
                                let value = serde_json::from_str(&s)
                                    .unwrap_or_else(|_| json!({ "type": "doc", "content": [] }));
                                chapters.insert(id.to_string(), value);
                            }
                        }
                    }
                }
            }
            let mut m: HashMap<String, EditorDoc> = HashMap::new();
            m.insert("editor".to_string(), EditorDoc { structure, chapters });
            m
        });

    // 新格式 timelines.json 按实例存放多份时间轴文档；旧版 timeline.json 迁移为默认实例的一个默认文件
    let timelines: HashMap<String, TimelineDoc> = read_json_entry(&mut archive, "timelines.json")
        .unwrap_or_else(|_| {
            let legacy: TimelineData = read_json_entry(&mut archive, "timeline.json")
                .unwrap_or_else(|_| TimelineData::default());
            let mut m: HashMap<String, TimelineDoc> = HashMap::new();
            if legacy.nodes.is_empty() && legacy.edges.is_empty() && legacy.color_legend.is_empty() {
                return m;
            }
            let file_id = "tl-1".to_string();
            let mut structure = TimelineStructure::default();
            structure.files.push(TimelineFileMeta {
                id: file_id.clone(),
                title: "时间轴".to_string(),
                order: 0,
                folder_id: None,
            });
            let mut docs: HashMap<String, TimelineData> = HashMap::new();
            docs.insert(file_id.clone(), legacy);
            m.insert(
                "timeline".to_string(),
                TimelineDoc {
                    structure,
                    color_legend: docs[&file_id].color_legend.clone(),
                    docs,
                },
            );
            m
        });

    // 新格式 lore.json 按实例存放多份设定库文档；旧格式 lore/<id>.json 扁平条目迁移进默认实例
    let lore: HashMap<String, LoreDoc> = read_json_entry(&mut archive, "lore.json").unwrap_or_else(|_| {
        let mut flat: Vec<LoreEntry> = Vec::new();
        for i in 0..archive.len() {
            let mut entry = match archive.by_index(i) {
                Ok(e) => e,
                Err(_) => continue,
            };
            let name = entry.name().to_string();
            if let Some(rest) = name.strip_prefix("lore/") {
                if let Some(_id) = rest.strip_suffix(".json") {
                    let mut s = String::new();
                    if entry.read_to_string(&mut s).is_ok() {
                        if let Ok(e) = serde_json::from_str::<LoreEntry>(&s) {
                            flat.push(e);
                        }
                    }
                }
            }
        }
        if flat.is_empty() {
            return HashMap::new();
        }
        flat.sort_by(|a, b| a.title.cmp(&b.title));
        let file_id = "lore-1".to_string();
        let mut structure = LoreStructure::default();
        structure.files.push(LoreFileMeta {
            id: file_id.clone(),
            title: "设定库".to_string(),
            order: 0,
            folder_id: None,
        });
        let mut docs: HashMap<String, LoreData> = HashMap::new();
        docs.insert(
            file_id,
            LoreData {
                cards: flat.into_iter().map(legacy_lore_entry).collect(),
                edges: Vec::new(),
            },
        );
        let mut m: HashMap<String, LoreDoc> = HashMap::new();
        m.insert(
            "lore".to_string(),
            LoreDoc {
                structure,
                tags: Vec::new(),
                docs,
            },
        );
        m
    });

    // 工程级配置（实例顺序/实例字号等）；旧工程无该条目时回退默认空配置
    let config: ProjectConfig = read_json_entry(&mut archive, "project-config.json")
        .unwrap_or_else(|_| ProjectConfig::default());

    Ok(ProjectData {
        meta,
        editors,
        timelines,
        timeline: TimelineData::default(),
        lore,
        config,
    })
}

/// 旧版扁平设定条目迁移：content 若为纯字符串则包装为 TipTap 段落文档
fn legacy_lore_entry(entry: LoreEntry) -> LoreEntry {
    let content = match &entry.content {
        serde_json::Value::String(s) => {
            let text = if s.is_empty() {
                json!([])
            } else {
                json!([{ "type": "text", "text": s }])
            };
            json!({
                "type": "doc",
                "content": [{ "type": "paragraph", "content": text }]
            })
        }
        _ => entry.content.clone(),
    };
    LoreEntry { content, ..entry }
}

/// 读取工程、修改元数据（名称/备注等）、重新写回磁盘。返回更新后的元数据。
pub fn update_meta<F: Fn(&mut ProjectMeta)>(path: &Path, f: F) -> Result<ProjectMeta, String> {
    let mut data = read_project_file(path)?;
    f(&mut data.meta);
    data.meta.updated_at = now_iso();
    write_project_file(path, &data)?;
    Ok(data.meta)
}
