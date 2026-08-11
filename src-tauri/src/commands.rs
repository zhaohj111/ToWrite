//! Tauri 命令层：工程文件管理与 .writeproj 读写。

use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use crate::writeproj;

/// 地址指针文件：位于 C 盘应用数据目录（app_data_dir），内容仅保存工程数据实际存放路径。
/// 数据本体可在任意磁盘（迁移后），应用数据处只保留这一个指针，不存工程文件。
fn pointer_path(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("data-location.json")
}

fn read_pointer(app: &AppHandle) -> Option<PathBuf> {
    let text = fs::read_to_string(pointer_path(app)).ok()?;
    let value: serde_json::Value = serde_json::from_str(&text).ok()?;
    let dir = value.get("projectsDir")?.as_str()?;
    let dir = PathBuf::from(dir);
    dir.is_dir().then_some(dir)
}

fn write_pointer(app: &AppHandle, dir: &Path) -> Result<(), String> {
    let p = pointer_path(app);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let value = serde_json::json!({ "projectsDir": dir.to_string_lossy() });
    let bytes = serde_json::to_vec(&value).map_err(|e| e.to_string())?;
    fs::write(&p, bytes).map_err(|e| e.to_string())
}

/// 默认工程存放目录：<文档目录>/ToWrite/projects。
/// 首次运行时把旧版目录 <文档目录>/ScriptForge 整体迁移为 ToWrite，既有工程不丢失。
fn default_projects_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .document_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| e.to_string())?;
    let legacy = base.join("ScriptForge");
    let target = base.join("ToWrite");
    // 一次性迁移旧目录；迁移失败则沿用旧目录，避免既有工程失联
    let dir = if !target.exists() && legacy.exists() {
        match fs::rename(&legacy, &target) {
            Ok(_) => target.join("projects"),
            Err(_) => legacy.join("projects"),
        }
    } else {
        target.join("projects")
    };
    Ok(dir)
}

/// 工程存放目录：优先读取地址指针（迁移后的实际位置）；无指针/指针失效时回退默认目录。
fn ensure_projects_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(dir) = read_pointer(app) {
        return Ok(dir);
    }
    let dir = default_projects_dir(app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // 首次解析时写入地址指针：C 盘应用数据处仅保存此指针
    write_pointer(app, &dir)?;
    Ok(dir)
}

fn project_path(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    let dir = ensure_projects_dir(app)?;
    Ok(dir.join(format!("{}.writeproj", id)))
}

/// 列出所有工程（按更新时间倒序）。
#[tauri::command]
pub fn list_projects(app: AppHandle) -> Result<Vec<writeproj::ProjectMeta>, String> {
    let dir = ensure_projects_dir(&app)?;
    let mut metas = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().map(|e| e == "writeproj").unwrap_or(false) {
            if let Ok(meta) = writeproj::read_meta_only(&path) {
                metas.push(meta);
            }
        }
    }
    metas.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(metas)
}

/// 新建工程，落盘一个空的 .writeproj。
#[tauri::command]
pub fn create_project(app: AppHandle, name: String) -> Result<writeproj::ProjectMeta, String> {
    let dir = ensure_projects_dir(&app)?;
    let name = if name.trim().is_empty() {
        "未命名工程".to_string()
    } else {
        name.trim().to_string()
    };
    let data = writeproj::empty_project(&name);
    let path = dir.join(format!("{}.writeproj", data.meta.id));
    writeproj::write_project_file(&path, &data)?;
    Ok(data.meta)
}

/// 读取工程完整数据。
#[tauri::command]
pub fn read_project(app: AppHandle, id: String) -> Result<writeproj::ProjectData, String> {
    let path = project_path(&app, &id)?;
    writeproj::read_project_file(&path)
}

/// 保存工程完整数据（前端防抖 2 秒后调用）。
#[tauri::command]
pub fn save_project(app: AppHandle, data: writeproj::ProjectData) -> Result<(), String> {
    let dir = ensure_projects_dir(&app)?;
    let path = dir.join(format!("{}.writeproj", data.meta.id));
    writeproj::write_project_file(&path, &data)
}

/// 删除工程文件。
#[tauri::command]
pub fn delete_project(app: AppHandle, id: String) -> Result<(), String> {
    let path = project_path(&app, &id)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 重命名工程（仅改 project.json 元数据）。
#[tauri::command]
pub fn rename_project(app: AppHandle, id: String, new_name: String) -> Result<writeproj::ProjectMeta, String> {
    let path = project_path(&app, &id)?;
    let new_name = if new_name.trim().is_empty() {
        "未命名工程".to_string()
    } else {
        new_name.trim().to_string()
    };
    writeproj::update_meta(&path, |m| m.name = new_name.clone())
}

/// 设置工程备注（仅改 project.json 元数据）。
#[tauri::command]
pub fn set_project_note(app: AppHandle, id: String, note: String) -> Result<writeproj::ProjectMeta, String> {
    let path = project_path(&app, &id)?;
    writeproj::update_meta(&path, |m| m.note = note.clone())
}

/// 返回工程存放目录绝对路径。
#[tauri::command]
pub fn projects_dir(app: AppHandle) -> Result<String, String> {
    ensure_projects_dir(&app).map(|d| d.to_string_lossy().to_string())
}

/// 从任意位置导入一个 .writeproj 文件到工程目录（对应开始页“打开工程文件”）。
#[tauri::command]
pub fn import_project(app: AppHandle, path: String) -> Result<writeproj::ProjectMeta, String> {
    let src = PathBuf::from(&path);
    if !src.exists() {
        return Err("文件不存在".to_string());
    }
    let data = writeproj::read_project_file(&src)?;
    let dir = ensure_projects_dir(&app)?;
    let dest = dir.join(format!("{}.writeproj", data.meta.id));
    if dest != src {
        fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    }
    Ok(data.meta)
}

/// 数据迁移：把工程目录整体移动到 target，并在 C 盘应用数据处更新地址指针。
/// 同盘优先整体移动；跨盘回退为复制 + 删除。目标目录已存在且非空时拒绝，避免覆盖数据。
#[tauri::command]
pub fn migrate_data(app: AppHandle, target: String) -> Result<String, String> {
    let current = ensure_projects_dir(&app)?;
    let target = PathBuf::from(&target);
    if current == target {
        return Ok(current.to_string_lossy().to_string());
    }
    if target.exists() {
        let empty = fs::read_dir(&target).map_err(|e| e.to_string())?.next().is_none();
        if !empty {
            return Err("目标目录已存在且非空，请选择空目录或新路径".to_string());
        }
        fs::remove_dir(&target).map_err(|e| e.to_string())?;
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // 优先整体移动（同盘）；跨盘失败回退为复制 + 删除
    if fs::rename(&current, &target).is_err() {
        copy_dir(&current, &target)?;
        fs::remove_dir_all(&current).map_err(|e| e.to_string())?;
    }
    write_pointer(&app, &target)?;
    Ok(target.to_string_lossy().to_string())
}

/// 递归复制目录（跨盘迁移回退用）。
fn copy_dir(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if from.is_dir() {
            copy_dir(&from, &to)?;
        } else {
            fs::copy(&from, &to).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// 返回 C 盘应用数据目录（地址指针存放位置，仅展示用）。
#[tauri::command]
pub fn data_pointer_dir(app: AppHandle) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}
