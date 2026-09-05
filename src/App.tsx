import { useEffect } from "react";
import { TitleBar } from "@/components/titlebar";
import { ToastHost } from "@/components/toasts";
import { StartPage } from "@/components/startPage";
import { ContentPage } from "@/components/contentPage";
import { SettingsPage } from "@/components/settings/settingsPage";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useLayoutStore } from "@/stores/layoutStore";
import { useThemeStore } from "@/stores/themeStore";
import { useProjectStore } from "@/stores/projectStore";
import { usePluginStore } from "@/stores/pluginStore";
import { useLoreUiStore } from "@/stores/loreUiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUpdateStore } from "@/stores/updateStore";
import { getSetting } from "@/lib/settings";
import {
  isRecordingActive,
  keybindingRegistry,
  matchChord,
  registerAppKeybindings,
  registerPluginKeybindings,
} from "@/lib/keybindings";
import { startSaveController } from "@/lib/saveController";

export default function App() {
  const view = useWorkspaceStore((s) => s.view);
  const zoom = useLayoutStore((s) => s.zoom);

  useEffect(() => {
    void useLayoutStore.getState().init();
    void useThemeStore.getState().init();
    void useProjectStore.getState().loadProjects();
    void usePluginStore.getState().init();
    void useLoreUiStore.getState().init();
    // 更新检查：载入自动检查开关，开启时延迟自动检查（updateStore 内部处理）
    void useUpdateStore.getState().init();
    // 级联配置：载入应用级插件设置与插件启停；随后按启动行为决定是否自动打开最近工程
    registerAppKeybindings();
    registerPluginKeybindings();
    void keybindingRegistry.init();
    void useSettingsStore.getState().init().then(() => {
      void useProjectStore.getState().loadProjects().then(() => {
        void startupOpenRecent();
      });
    });
    startSaveController();
  }, []);

  // 应用壳快捷键派发（app 作用域，经注册表）：reload / zoom / theme / settings / back。
  // 替换旧硬编码 F5 / mod+r；输入控件内不触发，避免影响输入法与编辑。
  // 支持双键序列（如 mod+a v）：第一键命中后武装待第二键（SEQ_TIMEOUT 内未按下自动作废）。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      // 改绑录制期间不派发应用命令（录制监听以 capture 处理按键）
      if (isRecordingActive()) return;
      // 双键序列：先处理已在进行中的序列（下一键命中即派发，否则作废）
      if (seqPending) {
        const p = seqPending;
        if (matchChord(e, p.chords[p.idx])) {
          window.clearTimeout(p.timer);
          seqPending = null;
          e.preventDefault();
          dispatchAppCommand(p.command);
          return;
        }
        window.clearTimeout(p.timer);
        seqPending = null;
      }
      // F5 保留为强制刷新（WebView2 不一定自带该快捷键）
      if (e.key === "F5") {
        e.preventDefault();
        reloadApp();
        return;
      }
      const defs = keybindingRegistry.list("app");
      for (const def of defs) {
        for (const alt of def.keys) {
          const chords = alt.toLowerCase().split(" ").filter(Boolean);
          if (chords.length === 1) {
            if (matchChord(e, chords[0])) {
              e.preventDefault();
              dispatchAppCommand(def.command);
              return;
            }
          } else if (matchChord(e, chords[0])) {
            // 双键序列第一键命中：武装待第二键
            seqPending = {
              command: def.command,
              chords,
              idx: 1,
              timer: window.setTimeout(() => {
                seqPending = null;
              }, SEQ_TIMEOUT),
            };
            e.preventDefault();
            return;
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 禁用浏览器默认右键菜单；之后实现自定义右键菜单时，可在此监听 contextmenu 自行渲染
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    window.addEventListener("contextmenu", onContextMenu);
    return () => window.removeEventListener("contextmenu", onContextMenu);
  }, []);

  // CSS zoom 会把 100vh/100vw 一起放大导致底部状态栏被挤出窗口，
  // 这里按缩放因子反向补偿尺寸，使缩放后恰好填满视口，任何档位都完整可见。
  const zoomFactor = zoom / 100;

  return (
    <div
      className="relative flex flex-col overflow-hidden"
      style={{
        zoom: zoomFactor,
        height: `calc(100vh / ${zoomFactor})`,
        width: `calc(100vw / ${zoomFactor})`,
      }}
    >
      {/* 氛围层：缓慢漂移的墨色光晕 + 细腻噪点 */}
      <div className="ambient" aria-hidden />
      <div className="grain" aria-hidden />
      {/* 窗口顶部结果提示（导出等操作的成功/失败通知） */}
      <ToastHost />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <TitleBar />
        <div key={view} className="anim-page min-h-0 flex-1 overflow-hidden">
          {view === "settings" ? (
            <SettingsPage />
          ) : view === "start" ? (
            <StartPage />
          ) : (
            <ContentPage />
          )}
        </div>
      </div>
    </div>
  );
}

/** 防抖强制刷新（F5 与应用命令共用，防止系统快捷键与页面监听同时触发二次刷新） */
let lastReload = 0;
function reloadApp() {
  const now = Date.now();
  if (now - lastReload < 400) return;
  lastReload = now;
  window.location.reload();
}

/** app 作用域命令执行器（注册表派发） */
function dispatchAppCommand(command: string) {
  switch (command) {
    case "app.reload":
      reloadApp();
      break;
    case "app.cycleZoom":
      useLayoutStore.getState().cycleZoom();
      break;
    case "app.toggleTheme":
      useThemeStore.getState().toggle();
      break;
    case "app.openSettings":
      useWorkspaceStore.getState().openSettings();
      break;
    case "app.backToStart":
      useProjectStore.getState().closeProject();
      break;
  }
}


/** 双键序列的进行中状态（app 作用域；超时或按键不匹配自动作废） */
let seqPending: { command: string; chords: string[]; idx: number; timer: number } | null = null;
const SEQ_TIMEOUT = 1200;

/** 按启动行为自动打开最近工程（config.json startupBehavior = "recent" 时） */
async function startupOpenRecent(): Promise<void> {
  const behavior = await getSetting<string>("startupBehavior", "start");
  if (behavior !== "recent") return;
  const id = useProjectStore.getState().recent[0]?.id;
  if (id) await useProjectStore.getState().openProjectById(id);
}
