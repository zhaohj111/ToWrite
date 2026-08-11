// 应用元信息：版本号统一从编译进二进制的版本读取（Tauri 自带 @tauri-apps/api/app 的 getVersion，
// 数据源是 Cargo.toml / tauri.conf.json —— 唯一权威来源），不再经过插件 / i18n 贡献点。
// 纯浏览器开发（非 Tauri 壳）读不到二进制版本，回退到常量。

import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";
import { isTauri } from "@/lib/tauri";

/** 浏览器开发环境（非 Tauri）的版本回退值 */
export const DEV_APP_VERSION = "0.6.0";

/** 异步取应用版本；Tauri 下读二进制版本，浏览器开发回退常量 */
export async function getAppVersion(): Promise<string> {
  return isTauri() ? getVersion() : DEV_APP_VERSION;
}

/** 版本号 Hook：Tauri 下异步读取，加载完成前先显示回退值，避免闪烁 */
export function useAppVersion(): string {
  const [version, setVersion] = useState(DEV_APP_VERSION);
  useEffect(() => {
    let alive = true;
    void getAppVersion().then((v) => {
      if (alive) setVersion(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  return version;
}
