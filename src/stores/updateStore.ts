// 应用更新检查状态：自动检查开关（config.json 持久化）+ 检查/下载流程状态 + 下载进度。
// 仿 useThemeStore 模式（zustand + getSetting/setSetting）；Rust 端下载时通过
// `update://progress` 事件推送 { downloaded, total }，前端经 listen 更新进度。
// 角标（开始页/活动栏设置图标）读 available 字段；检查/下载 UI 读 phase 与 progress。

import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { checkUpdate, downloadUpdate, fetchChangelog, isTauri } from "@/lib/tauri";
import { getSetting, setSetting } from "@/lib/settings";

const KEY_AUTO_CHECK = "updateAutoCheck";

export type UpdatePhase =
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "error"
  | "downloading"
  | "downloaded"
  | "download-error";

export interface DownloadProgressPayload {
  downloaded: number;
  total: number | null;
}

interface UpdateState {
  /** 启动时自动检查更新（config.json 持久化） */
  autoCheck: boolean;
  phase: UpdatePhase;
  /** 是否存在待更新新版本（角标据此显示） */
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  notes: string | null;
  downloadUrl: string | null;
  progress: DownloadProgressPayload | null;
  lastError: string | null;
  /** GitHub 拉取的最新 CHANGELOG.md；null = 未拉取/失败（更新日志页回退随包内置版本） */
  changelog: string | null;
  changelogLoading: boolean;
  changelogError: string | null;
  init: () => Promise<void>;
  setAutoCheck: (v: boolean) => void;
  checkNow: () => Promise<void>;
  download: () => Promise<void>;
  /** 重新从 GitHub 默认分支拉取 CHANGELOG.md（更新日志页「刷新」/ 首次打开触发） */
  refreshChangelog: () => Promise<void>;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  autoCheck: false,
  phase: "idle",
  available: false,
  currentVersion: "",
  latestVersion: "",
  notes: null,
  downloadUrl: null,
  progress: null,
  lastError: null,
  changelog: null,
  changelogLoading: false,
  changelogError: null,

  init: async () => {
    const autoCheck = await getSetting<boolean>(KEY_AUTO_CHECK, false);
    set({ autoCheck });
    await ensureProgressListener();
    if (autoCheck) {
      // 延迟自动检查，避免挤占启动时其他初始化
      window.setTimeout(() => void get().checkNow(), 2500);
    }
  },

  setAutoCheck: (v) => {
    set({ autoCheck: v });
    void setSetting(KEY_AUTO_CHECK, v);
  },

  checkNow: async () => {
    if (!isTauri()) {
      set({ phase: "error", lastError: "当前不在桌面环境中，无法检查更新" });
      return;
    }
    set({ phase: "checking", lastError: null });
    try {
      const info = await checkUpdate();
      set({
        phase: info.updateAvailable ? "available" : "up-to-date",
        available: info.updateAvailable,
        currentVersion: info.currentVersion,
        latestVersion: info.latestVersion,
        notes: info.releaseNotes,
        downloadUrl: info.downloadUrl,
      });
      // 手动/自动检查更新时，一并拉取 GitHub 最新 CHANGELOG.md 覆盖更新日志页；
      // 失败不影响更新检查结果，沿用已拉取/内置版本。
      void get().refreshChangelog();
    } catch (e) {
      set({ phase: "error", lastError: e instanceof Error ? e.message : String(e) });
    }
  },

  refreshChangelog: async () => {
    if (!isTauri()) return;
    if (get().changelogLoading) return;
    set({ changelogLoading: true, changelogError: null });
    try {
      const md = await fetchChangelog();
      set({ changelog: md, changelogLoading: false });
    } catch (e) {
      set({
        changelogLoading: false,
        changelogError: e instanceof Error ? e.message : String(e),
      });
    }
  },

  download: async () => {
    if (!get().available || !isTauri()) return;
    set({ phase: "downloading", progress: { downloaded: 0, total: null }, lastError: null });
    try {
      await downloadUpdate();
      set({ phase: "downloaded", progress: null });
    } catch (e) {
      set({ phase: "download-error", lastError: e instanceof Error ? e.message : String(e) });
    }
  },
}));

/** 进度事件监听只挂一次（init 时建立；非 Tauri 环境跳过） */
let listening = false;
async function ensureProgressListener(): Promise<void> {
  if (listening || !isTauri()) return;
  listening = true;
  await listen<DownloadProgressPayload>("update://progress", (e) => {
    useUpdateStore.setState({ progress: e.payload });
  });
}
