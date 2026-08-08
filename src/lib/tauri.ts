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
