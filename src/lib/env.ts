// 运行环境判定：Vite 编译时注入。
// `vite dev` / `tauri dev`（未打包）为 true；`vite build` 的打包产物为 false。
// 开发环境专属行为（如更新日志仅用随包内置版本、调试入口）统一经此开关控制。

export const isDev = import.meta.env.DEV;
