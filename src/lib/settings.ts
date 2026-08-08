// 程序级配置（非项目数据）：窗口位置/缩放/近期工程等，存于 tauri-plugin-store。
// 非 Tauri 环境下降级到 localStorage，便于浏览器联调。

import { load, type Store } from "@tauri-apps/plugin-store";
import { isTauri } from "@/lib/tauri";

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = load("config.json", { autoSave: true });
  }
  return storePromise;
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  if (!isTauri()) {
    const raw = localStorage.getItem(`sf:${key}`);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  }
  try {
    const store = await getStore();
    const value = await store.get<T>(key);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  if (!isTauri()) {
    localStorage.setItem(`sf:${key}`, JSON.stringify(value));
    return;
  }
  try {
    const store = await getStore();
    await store.set(key, value);
    await store.save();
  } catch {
    // 忽略配置写入失败（如首次启动时权限未就绪）
  }
}
