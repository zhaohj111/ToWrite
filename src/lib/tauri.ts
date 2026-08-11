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
