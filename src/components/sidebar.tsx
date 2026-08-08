// 宿主侧边栏容器：由模块的 sidebar 视图决定内容。
// 右边界支持拖拽调整宽度（pointer 事件手写，与章节树同款方案；WebView2 下原生 DnD 不可靠）；
// 宽度为应用级 UI 偏好（config.json），随 zoom 一同持久化，拖拽换算需除以 CSS zoom 因子。

import { useEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useSidebarView } from "@/plugins/hooks";
import {
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  useLayoutStore,
} from "@/stores/layoutStore";
import { EditorInstanceProvider } from "@/components/editor/editorInstanceContext";
import { cn } from "@/lib/cn";

export function Sidebar() {
  const sidebarId = useLayoutStore((s) => s.sidebarId);
  const setSidebar = useLayoutStore((s) => s.setSidebar);
  const sidebarWidth = useLayoutStore((s) => s.sidebarWidth);
  const setSidebarWidth = useLayoutStore((s) => s.setSidebarWidth);
  const zoom = useLayoutStore((s) => s.zoom);
  const view = useSidebarView(sidebarId);

  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState(false);
  // 拖拽起点：指针 x、起始宽度、CSS zoom 因子（clientX 为屏幕像素，宽度为布局像素，需换算）
  const pendingRef = useRef<{ x: number; startWidth: number; zoomFactor: number } | null>(null);
  const draggingRef = useRef(false);

  const startResize = (e: React.PointerEvent) => {
    if (e.button !== 0 || e.pointerType !== "mouse") return;
    pendingRef.current = { x: e.clientX, startWidth: sidebarWidth, zoomFactor: zoom / 100 };
    draggingRef.current = false;
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const p = pendingRef.current;
      if (!p) return;
      if (!draggingRef.current) {
        if (Math.abs(e.clientX - p.x) < 4) return; // 4px 判定为点击，避免误拖
        draggingRef.current = true;
        setDragging(true);
      }
      const width = p.startWidth + (e.clientX - p.x) / p.zoomFactor;
      setSidebarWidth(Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, width)));
    };
    const onUp = () => {
      pendingRef.current = null;
      draggingRef.current = false;
      setDragging(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (pendingRef.current || draggingRef.current)) onUp();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [setSidebarWidth]);

  // 拖拽期间禁用文本选择，避免选到侧栏/正文内容
  useEffect(() => {
    if (!dragging) return;
    const prev = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.userSelect = prev;
    };
  }, [dragging]);

  if (!view) return null;
  const Component = view.component;

  return (
    <div
      className="relative flex shrink-0 flex-col border-r border-line/60 bg-app"
      style={{ width: sidebarWidth }}
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-line/50 px-4">
        <span className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-fg-muted">
          <span className="size-1.5 rounded-full bg-accent" />
          {view.title}
        </span>
        <button
          title="收起侧边栏"
          onClick={() => setSidebar(null)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-hover hover:text-fg"
        >
          <ChevronLeft className="size-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {/* key 按实例重建侧边栏，避免不同实例（正文/大纲）之间的折叠/搜索等本地状态串扰 */}
        <EditorInstanceProvider key={view.id} value={view.id}>
          <Component />
        </EditorInstanceProvider>
      </div>

      {/* 右边界拖拽调整宽度：悬停/拖拽时显示强调线 */}
      <div
        className={cn(
          "absolute inset-y-0 right-0 z-20 w-2 cursor-col-resize touch-none",
          dragging && "bg-accent/10",
        )}
        onPointerDown={startResize}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <div
          className={cn(
            "absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 rounded-full transition-colors",
            dragging ? "bg-accent" : hover ? "bg-accent/70" : "bg-transparent",
          )}
        />
      </div>
    </div>
  );
}
