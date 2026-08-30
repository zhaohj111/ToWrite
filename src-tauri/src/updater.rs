// 更新检查与下载：GitHub Releases API（zhaohj111/ToWrite）+ Windows 安装包流式下载。
// check_update 返回是否有新版本及下载信息；download_update 下载安装包到应用数据目录并打开，
// 下载中通过 `update://progress` 事件推送 { downloaded, total }（前端 capabilities 已允许 listen）。
// 版本比较为数值分段手写实现（不引入 semver crate）；HTTP 用 reqwest（native-tls/schannel）。

use std::fs;
use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_opener::OpenerExt;

const LATEST_RELEASE_URL: &str = "https://api.github.com/repos/zhaohj111/ToWrite/releases/latest";
const REPO_API_URL: &str = "https://api.github.com/repos/zhaohj111/ToWrite";
const RAW_PREFIX: &str = "https://raw.githubusercontent.com/zhaohj111/ToWrite";

/// 仓库元信息（取默认分支，据此拉取最新 CHANGELOG.md）
#[derive(Deserialize)]
struct RepoMeta {
    default_branch: String,
}

// ---- GitHub Release JSON（body/size 可为 null，用 Option）----
#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    assets: Vec<GithubAsset>,
}

#[derive(Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

// ---- 返回前端 / 进度事件的 payload（camelCase）----
// UpdateInfo 跨 IPC 返回给前端，generate_handler! 宏生成的包装需公开引用该类型，故 pub。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    update_available: bool,
    current_version: String,
    latest_version: String,
    release_notes: Option<String>,
    download_url: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    downloaded: u64,
    total: Option<u64>,
}

// ---- 共享 Client：GitHub 要求 User-Agent，否则 403 ----
fn client(current_version: &str) -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent(format!("ToWrite/{}", current_version))
            .build()
            .expect("构建更新检查 HTTP 客户端失败")
    })
}

// ---- 版本比较：去掉前导非数字（v/前缀），按数字分段比较；忽略预发布尾段 ----
fn numeric_segments(s: &str) -> Vec<u64> {
    s.trim_start_matches(|c: char| !c.is_ascii_digit())
        .split(|c: char| !c.is_ascii_digit())
        .filter_map(|p| p.parse::<u64>().ok())
        .collect()
}

fn is_newer(current: &str, candidate: &str) -> bool {
    let a = numeric_segments(current);
    let b = numeric_segments(candidate);
    for i in 0..a.len().max(b.len()) {
        let x = a.get(i).copied().unwrap_or(0);
        let y = b.get(i).copied().unwrap_or(0);
        if x != y {
            return y > x;
        }
    }
    false
}

// ---- 拉取 latest release；404（仓库尚无 release）视为「无更新」----
async fn fetch_release(client: &reqwest::Client, current: &str) -> Result<GithubRelease, String> {
    let resp = client
        .get(LATEST_RELEASE_URL)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        // 无任何 release：返回与当前版本相同的空 release，使 available=false
        return Ok(GithubRelease {
            tag_name: current.to_string(),
            body: None,
            assets: vec![],
        });
    }
    if !resp.status().is_success() {
        return Err(format!("检查更新失败：HTTP {}", resp.status()));
    }
    resp.json::<GithubRelease>().await.map_err(|e| e.to_string())
}

/// 当前安装方式（Windows）：在卸载注册表中按 DisplayName 找到 ToWrite，
/// 有 WindowsInstaller=1 标志即为 MSI，否则为 NSIS。非 Windows / 找不到返回 None。
#[cfg(windows)]
fn installed_format() -> Option<&'static str> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;
    const UNINSTALL: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall";
    for hive in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
        let Ok(key) = RegKey::predef(hive).open_subkey_with_flags(UNINSTALL, KEY_READ) else {
            continue;
        };
        for sub in key.enum_keys().flatten() {
            let Ok(sk) = key.open_subkey_with_flags(&sub, KEY_READ) else { continue };
            let Ok(name) = sk.get_value::<String, _>("DisplayName") else { continue };
            if !(name.contains("ToWrite") || name.contains("拓文")) {
                continue;
            }
            let is_msi = sk
                .get_value::<u32, _>("WindowsInstaller")
                .map(|v| v == 1)
                .unwrap_or(false);
            return Some(if is_msi { "msi" } else { "exe" });
        }
    }
    None
}

#[cfg(not(windows))]
fn installed_format() -> Option<&'static str> {
    None
}

/// 安装包资产：优先与当前安装方式匹配（MSI 装→下 msi，NSIS 装→下 exe），
/// 避免跨格式升级触发「先卸载再装」弹窗；无法判定或缺少对应格式时回退 .exe，其次 .msi。
fn pick_asset(release: &GithubRelease) -> Option<&GithubAsset> {
    if let Some(ext) = installed_format() {
        let suffix = format!(".{ext}");
        if let Some(a) = release.assets.iter().find(|a| a.name.ends_with(&suffix)) {
            return Some(a);
        }
    }
    release
        .assets
        .iter()
        .find(|a| a.name.ends_with(".exe"))
        .or_else(|| release.assets.iter().find(|a| a.name.ends_with(".msi")))
}

// ---- 防并发下载：AtomicBool + RAII（不可持 std MutexGuard 跨 await，非 Send 无法编译）----
static DOWNLOADING: AtomicBool = AtomicBool::new(false);

struct DownloadGuard;
impl Drop for DownloadGuard {
    fn drop(&mut self) {
        DOWNLOADING.store(false, Ordering::SeqCst);
    }
}

/// 检查 GitHub 最新 release：返回是否有新版本及下载信息（无 Windows 安装包时 downloadUrl 为 null）。
#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<UpdateInfo, String> {
    let current = app.package_info().version.to_string();
    let client = client(&current);
    let release = fetch_release(client, &current).await?;
    let latest = release.tag_name.trim_start_matches(|c: char| !c.is_ascii_digit());
    let download_url = pick_asset(&release).map(|a| a.browser_download_url.clone());
    Ok(UpdateInfo {
        update_available: is_newer(&current, latest),
        current_version: current,
        latest_version: latest.to_string(),
        release_notes: release.body,
        download_url,
    })
}

/// 拉取仓库元信息（默认分支，供拉取 CHANGELOG.md / Supporter.md 使用）
async fn fetch_repo_meta(client: &reqwest::Client) -> Result<RepoMeta, String> {
    client
        .get(REPO_API_URL)
        .send()
        .await
        .map_err(|e| format!("获取仓库信息失败：{e}"))?
        .error_for_status()
        .map_err(|e| format!("获取仓库信息失败：{e}"))?
        .json()
        .await
        .map_err(|e| format!("解析仓库信息失败：{e}"))
}

/// 从 GitHub 默认分支拉取仓库根目录的 CHANGELOG.md（检查更新时前端一并调用，覆盖随包内置的旧版）。
/// bytes() 不依赖 charset feature（当前仅启用 json+native-tls），UTF-8 文本直接转 String。
#[tauri::command]
pub async fn fetch_changelog(app: AppHandle) -> Result<String, String> {
    let current = app.package_info().version.to_string();
    let client = client(&current);
    let meta = fetch_repo_meta(&client).await?;
    let url = format!("{RAW_PREFIX}/{}/CHANGELOG.md", meta.default_branch);
    let bytes = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("下载更新日志失败：{e}"))?
        .error_for_status()
        .map_err(|e| format!("下载更新日志失败：{e}"))?
        .bytes()
        .await
        .map_err(|e| format!("读取更新日志失败：{e}"))?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// 从 GitHub 默认分支拉取仓库根目录的 Supporter.md（赞助页「支持者名单」）。
/// 文件不存在（404）返回 None：前端据此不显示名单区域。
#[tauri::command]
pub async fn fetch_supporter(app: AppHandle) -> Result<Option<String>, String> {
    let current = app.package_info().version.to_string();
    let client = client(&current);
    let meta = fetch_repo_meta(&client).await?;
    let url = format!("{RAW_PREFIX}/{}/Supporter.md", meta.default_branch);
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("下载支持者名单失败：{e}"))?;
    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    let bytes = resp
        .error_for_status()
        .map_err(|e| format!("下载支持者名单失败：{e}"))?
        .bytes()
        .await
        .map_err(|e| format!("读取支持者名单失败：{e}"))?;
    Ok(Some(String::from_utf8_lossy(&bytes).into_owned()))
}

/// 下载最新 Windows 安装包到应用数据目录（updates/），完成后打开并返回文件路径。
/// 过程通过 `update://progress` 事件推送 { downloaded, total }。
#[tauri::command]
pub async fn download_update(app: AppHandle) -> Result<String, String> {
    if DOWNLOADING.swap(true, Ordering::SeqCst) {
        return Err("下载已在进行中".into());
    }
    let _guard = DownloadGuard;

    let current = app.package_info().version.to_string();
    let client = client(&current);
    let release = fetch_release(client, &current).await?;
    let asset = pick_asset(&release).ok_or("最新版本未提供 Windows 安装包")?;

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("updates");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let name = asset
        .name
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(&asset.name)
        .to_string();
    let part_path = dir.join(format!("{name}.part"));
    let final_path = dir.join(&name);

    let mut resp = client
        .get(&asset.browser_download_url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let _ = fs::remove_file(&part_path);
        return Err(format!("下载失败：HTTP {}", resp.status()));
    }
    let total = resp.content_length();

    let mut downloaded = 0u64;
    // 写文件放在独立作用域块里：块结束即关闭句柄（drop）。
    // 不关闭句柄就去 rename / 打开安装包，Windows 会弹「另一个程序正在使用此文件」，
    // 且 exe 不会真正启动（ShellExecute 已放弃）。File 无用户态缓冲，drop 即释放。
    {
        let mut file = fs::File::create(&part_path).map_err(|e| e.to_string())?;
        loop {
            let chunk = resp.chunk().await.map_err(|e| {
                let _ = fs::remove_file(&part_path);
                e.to_string()
            })?;
            let Some(chunk) = chunk else { break };
            file.write_all(&chunk).map_err(|e| {
                let _ = fs::remove_file(&part_path);
                e.to_string()
            })?;
            downloaded += chunk.len() as u64;
            let _ = app.emit("update://progress", &DownloadProgress { downloaded, total });
        }
    }

    fs::rename(&part_path, &final_path).map_err(|e| {
        let _ = fs::remove_file(&part_path);
        e.to_string()
    })?;

    // 打开安装包；失败不阻断（文件已下载），且失败时不自动退出应用
    let path_str = final_path.to_string_lossy().into_owned();
    match app.opener().open_path(&path_str, None::<&str>) {
        Ok(()) => {
            // 安装包已启动：短暂延迟后自动退出应用，让安装程序独占更新，
            // 否则安装时（尤其跨格式先卸载）会弹「应用未关闭」。open_path 经
            // ShellExecute 启动的安装程序独立于本进程，应用退出不影响其继续安装。
            let app = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(2000));
                app.exit(0);
            });
        }
        Err(e) => eprintln!("打开安装包失败：{e}"),
    }
    Ok(path_str)
}
