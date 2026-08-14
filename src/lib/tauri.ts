// Tauri 命令封装。在普通浏览器（非 Tauri 壳）下运行时，isTauri() 为 false，
// 命令会抛出错误，由各 store 捕获并降级为空数据，便于纯前端联调。

import { invoke } from "@tauri-apps/api/core";
import type { ProjectData, ProjectMeta } from "@/types/writeproj";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function listProjects(): Promise<ProjectMeta[]> {
  return invoke<ProjectMeta[]>("list_projects");
}

export function createProject(name: string): Promise<ProjectMeta> {
  return invoke<ProjectMeta>("create_project", { name });
}

export function readProject(id: string): Promise<ProjectData> {
  return invoke<ProjectData>("read_project", { id });
}

export function saveProject(data: ProjectData): Promise<void> {
  return invoke<void>("save_project", { data });
}

export function deleteProject(id: string): Promise<void> {
  return invoke<void>("delete_project", { id });
}

export function renameProject(id: string, newName: string): Promise<ProjectMeta> {
  return invoke<ProjectMeta>("rename_project", { id, newName });
}

export function setProjectNote(id: string, note: string): Promise<ProjectMeta> {
  return invoke<ProjectMeta>("set_project_note", { id, note });
}

export function getProjectsDir(): Promise<string> {
  return invoke<string>("projects_dir");
}

export function importProject(path: string): Promise<ProjectMeta> {
  return invoke<ProjectMeta>("import_project", { path });
}

export function migrateData(target: string): Promise<string> {
  return invoke<string>("migrate_data", { target });
}

/** C 盘应用数据目录（地址指针存放位置） */
export function getDataPointerDir(): Promise<string> {
  return invoke<string>("data_pointer_dir");
}

// ===================== 文件 I/O（导入导出用） =====================

/** 读取 UTF-8 文本文件（Markdown/TXT/.timeline/.lore 导入）。 */
export function readTextFile(path: string): Promise<string> {
  return invoke<string>("read_text_file", { path });
}

/** 读取二进制文件并返回 base64（PDF/DOCX/DOC/EPUB 导入、图片插入）。 */
export function readBinaryFile(path: string): Promise<string> {
  return invoke<string>("read_binary_file", { path });
}

/** 写文本文件（TXT/Markdown/.timeline/.lore 导出）；自动创建父目录。 */
export function writeTextFile(path: string, content: string): Promise<void> {
  return invoke<void>("write_text_file", { path, content });
}

/** 写二进制文件（PNG 导出；入参为 base64）；自动创建父目录。 */
export function writeBinaryFile(path: string, base64: string): Promise<void> {
  return invoke<void>("write_binary_file", { path, base64 });
}

/** 递归列出一个受支持导入格式的单个文件（文件夹导入用）。 */
export interface ImportFileInfo {
  path: string;
  name: string;
}

export function listImportFiles(dir: string): Promise<ImportFileInfo[]> {
  return invoke<ImportFileInfo[]>("list_import_files", { dir });
}

/** 图片型 PDF 导出负载：每页为前端渲染的 PNG base64，Rust 整页嵌入。 */
export interface ImagePdfPayload {
  title: string;
  /** 渲染 dpi（px = pt × dpi/72），Rust 侧按同 dpi 换算图片物理尺寸 */
  dpi: number;
  pages: string[];
}

/** 图片型 PDF 导出（前端 canvas 渲染逐页 → Rust 整页嵌入）。 */
export function exportImagePdf(payload: ImagePdfPayload, outputPath: string): Promise<void> {
  return invoke<void>("export_image_pdf", { payload, outputPath });
}

/** 更新检查结果（对应 Rust updater::UpdateInfo，camelCase） */
export interface UpdateInfo {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseNotes: string | null;
  downloadUrl: string | null;
}

/** 检查 GitHub 最新 release 是否有新版本 */
export function checkUpdate(): Promise<UpdateInfo> {
  return invoke<UpdateInfo>("check_update");
}

/** 下载最新安装包（Rust 侧自行解析 release 与资产，完成后打开）；返回下载到的文件路径 */
export function downloadUpdate(): Promise<string> {
  return invoke<string>("download_update");
}

/** 从 GitHub 默认分支拉取仓库根目录 CHANGELOG.md 原文（检查更新时刷新更新日志页） */
export function fetchChangelog(): Promise<string> {
  return invoke<string>("fetch_changelog");
}
