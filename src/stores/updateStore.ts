// 应用更新检查状态：自动检查开关（config.json 持久化）+ 检查/下载流程状态 + 下载进度。
// 仿 useThemeStore 模式（zustand + getSetting/setSetting）；Rust 端下载时通过
// `update://progress` 事件推送 { downloaded, total }，前端经 listen 更新进度。
// 角标（开始页/活动栏设置图标）读 available 字段；检查/下载 UI 读 phase 与 progress。

import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { checkUpdate, downloadUpdate, fetchChangelog, fetchSupporter, isTauri } from "@/lib/tauri";
import { isDev } from "@/lib/env";
import { getSetting, setSetting } from "@/lib/settings";
import { notifyError, notifySuccess } from "@/lib/notify";

/**
 * 本地支持者名单（仓库根目录 Supporter.md）：仅开发/测试环境读取，文件不存在则为空。
 * 用动态 glob（import.meta.glob + ?raw）：文件缺失不导致构建失败（该场景即「无文件不显示」）。
 */
const localSupporterModules = import.meta.glob<string>("../../Supporter.md", {
  query: "?raw",
  import: "default",
});
const LOCAL_SUPPORTER_KEY = "../../Supporter.md";

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
  /** GitHub 拉取的仓库根目录 Supporter.md；null = 未拉取/文件不存在（不显示名单） */
  supporter: string | null;
  supporterLoading: boolean;
  /** 是否已完成启动检查（含「文件不存在」结果），赞助页据此决定是否显示名单区 */
  supporterChecked: boolean;
  init: () => Promise<void>;
  setAutoCheck: (v: boolean) => void;
  checkNow: () => Promise<void>;
  download: () => Promise<void>;
  /** 重新从 GitHub 默认分支拉取 CHANGELOG.md（更新日志页「刷新」/ 首次打开触发） */
  refreshChangelog: () => Promise<void>;
  /** 启动时检查仓库根目录 Supporter.md 并拉取（开发环境读本地文件；文件不存在则不显示名单） */
  fetchSupporter: () => Promise<void>;
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
  supporter: null,
  supporterLoading: false,
  supporterChecked: false,

  init: async () => {
    const autoCheck = await getSetting<boolean>(KEY_AUTO_CHECK, false);
    set({ autoCheck });
    await ensureProgressListener();
    if (autoCheck) {
      // 延迟自动检查，避免挤占启动时其他初始化；支持者名单排队在检查更新之后
      window.setTimeout(() => {
        void get()
          .checkNow()
          .then(() => get().fetchSupporter());
      }, 2500);
    } else {
      // 未启用自动检查更新：启动时仍检查并拉取支持者名单
      window.setTimeout(() => void get().fetchSupporter(), 2500);
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
    // 开发环境下只使用随包内置更新日志，不拉取远程（GitHub）内容
    if (isDev) return;
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
  fetchSupporter: async () => {
    // 每次会话只检查一次（启动时发起；「文件不存在」也视为已完成检查）
    if (get().supporterLoading || get().supporterChecked) return;
    // 开发/测试环境：读取本地仓库根目录 Supporter.md，不拉远程；文件不存在则不显示名单
    if (isDev) {
      set({ supporterLoading: true });
      try {
        const load = localSupporterModules[LOCAL_SUPPORTER_KEY];
        if (load) {
          set({ supporter: await load(), supporterLoading: false, supporterChecked: true });
        } else {
          set({ supporter: null, supporterLoading: false, supporterChecked: true });
        }
      } catch (e) {
        console.warn("读取本地支持者名单失败", e);
        set({ supporter: null, supporterLoading: false, supporterChecked: true });
      }
      return;
    }
    if (!isTauri()) return;
    set({ supporterLoading: true });
    try {
      const md = await fetchSupporter();
      set({ supporter: md, supporterLoading: false, supporterChecked: true });
    } catch (e) {
      console.warn("拉取支持者名单失败", e);
      set({ supporter: null, supporterLoading: false, supporterChecked: true });
    }
  },

  download: async () => {
    if (!get().available || !isTauri()) return;
    set({ phase: "downloading", progress: { downloaded: 0, total: null }, lastError: null });
    try {
      const path = await downloadUpdate();
      set({ phase: "downloaded", progress: null });
      // 窗口顶部结果提示（导出同款样式）：下载完成 + 路径（可一键在文件夹中显示）；
      // Rust 侧随后会打开安装程序，应用可能随之退出，提示保持简短。
      notifySuccess("更新包下载完成", "安装程序即将启动，应用关闭后请按提示完成更新", path);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ phase: "download-error", lastError: msg });
      notifyError("更新包下载失败", msg);
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
/** 支持者名单是否可用（启动检查完成且文件存在）：设置导航据此显示「支持者名单」页 */
export function useSupporterAvailable(): boolean {
  const supporter = useUpdateStore((s) => s.supporter);
  const checked = useUpdateStore((s) => s.supporterChecked);
  return checked && supporter != null;
}
