import React from "react";
import ReactDOM from "react-dom/client";
import "@/styles.css";
import App from "@/App";
import { initPlugins } from "@/plugins";
import type { ThemeMode } from "@/stores/themeStore";

initPlugins();

// 渲染前预挂主题（浏览器路径同步读 localStorage，防闪白/闪黑；Tauri 路径异步，默认纸白）
try {
  const raw = localStorage.getItem("sf:theme");
  if (raw != null && (JSON.parse(raw) as ThemeMode) === "ink") {
    document.documentElement.classList.add("dark");
  }
} catch {
  // 忽略：解析失败时保持默认纸白
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
