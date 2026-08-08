mod commands;
mod writeproj;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::list_projects,
            commands::create_project,
            commands::read_project,
            commands::save_project,
            commands::delete_project,
            commands::rename_project,
            commands::set_project_note,
            commands::projects_dir,
            commands::import_project
        ])
        .setup(|app| {
            // 启动默认最大化（非全屏）：窗口先隐藏再最大化并展示，避免闪烁。
            if let Some(win) = app.get_webview_window("main") {
                // 用 512px 大图覆盖运行时窗口图标：Tauri 默认只取 icon.ico 第一帧（16px），
                // 会导致任务栏图标在高 DPI 下放大变糊。
                if let Ok(icon) = tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png")) {
                    let _ = win.set_icon(icon);
                }
                let _ = win.maximize();
                let _ = win.show();
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app, _event| {});
}
