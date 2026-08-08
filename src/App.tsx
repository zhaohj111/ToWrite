import { useEffect } from "react";
import { TitleBar } from "@/components/titlebar";
import { StartPage } from "@/components/startPage";
import { ContentPage } from "@/components/contentPage";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useLayoutStore } from "@/stores/layoutStore";
import { useThemeStore } from "@/stores/themeStore";
import { useProjectStore } from "@/stores/projectStore";
import { useEditorStore } from "@/stores/editorStore";
import { usePluginStore } from "@/stores/pluginStore";
import { useLoreUiStore } from "@/stores/loreUiStore";
import { startSaveController } from "@/lib/saveController";

export default function App() {
  const view = useWorkspaceStore((s) => s.view);
  const zoom = useLayoutStore((s) => s.zoom);

  useEffect(() => {
    void useLayoutStore.getState().init();
    void useThemeStore.getState().init();
    void useProjectStore.getState().loadProjects();
    void useEditorStore.getState().initFontSize();
    void usePluginStore.getState().init();
    void useLoreUiStore.getState().init();
    startSaveController();
  }, []);

  // 应用内强制刷新：Ctrl/Cmd+R 或 F5 重新加载页面（WebView2 不一定自带该快捷键）
  useEffect(() => {
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      const isReload =
        e.key === "F5" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r");
      if (!isReload) return;
      e.preventDefault();
      const now = Date.now();
      if (now - last < 400) return; // 防止系统快捷键与页面监听同时触发导致二次刷新
      last = now;
      window.location.reload();
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

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <TitleBar />
        <div key={view} className="anim-page min-h-0 flex-1 overflow-hidden">
          {view === "start" ? <StartPage /> : <ContentPage />}
        </div>
      </div>
    </div>
  );
}
