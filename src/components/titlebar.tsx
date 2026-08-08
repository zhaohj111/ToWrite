// 自定义标题栏：隐藏系统顶栏后自行实现窗口控制。
// 双击拖拽区最大化/还原；右键弹出窗口系统菜单。

import { useEffect, useState } from "react";
import { Copy, Minus, Moon, Square, Sun, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@/lib/tauri";
import { cn } from "@/lib/cn";
import { useThemeStore } from "@/stores/themeStore";
import appIcon from "../../src-tauri/icons/32x32.png";

interface MenuState {
  x: number;
  y: number;
}

function MenuItem({
  label,
  danger,
  onClick,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center rounded-md px-3 py-1.5 text-left text-xs transition-colors",
        danger
          ? "text-danger hover:bg-danger/15"
          : "text-fg hover:bg-hover",
      )}
    >
      {label}
    </button>
  );
}

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const theme = useThemeStore((s) => s.mode);
  const toggleTheme = useThemeStore((s) => s.toggle);

  useEffect(() => {
    if (!isTauri()) return;
    const win = getCurrentWindow();
    win.isMaximized().then(setMaximized).catch(() => undefined);
    const unlisten = win.onResized(() =>
      win.isMaximized().then(setMaximized).catch(() => undefined),
    );
    return () => {
      unlisten.then((fn) => fn()).catch(() => undefined);
    };
  }, []);

  const win = isTauri() ? getCurrentWindow() : null;

  return (
    <>
      <div
        className="relative flex h-[38px] shrink-0 items-center justify-between border-b border-line/70 bg-app pl-3"
        data-tauri-drag-region
        onDoubleClick={() => {
          win?.toggleMaximize().catch(() => undefined);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        <div className="flex items-center gap-2.5" data-tauri-drag-region>
          <img
            src={appIcon}
            alt="拓文"
            draggable={false}
            className="size-4 rounded-[4px] shadow-card"
          />
          <span className="font-display text-[13px] font-bold tracking-[0.18em] text-fg-strong">
            拓文
          </span>
          <span className="text-[10px] tracking-widest text-fg-muted/70">TOWRITE</span>
        </div>

        <div className="flex h-full items-stretch">
          <button
            onClick={toggleTheme}
            className="flex w-[40px] items-center justify-center text-fg-muted transition-colors hover:bg-hover hover:text-fg active:scale-90"
            title={theme === "paper" ? "切换到墨夜" : "切换到纸白"}
          >
            {theme === "paper" ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
          </button>
          <button
            onClick={() => win?.minimize().catch(() => undefined)}
            className="flex w-[46px] items-center justify-center text-fg-muted transition-colors hover:bg-hover hover:text-fg active:scale-90"
            title="最小化"
          >
            <Minus className="size-3.5" />
          </button>
          <button
            onClick={() => win?.toggleMaximize().catch(() => undefined)}
            className="flex w-[46px] items-center justify-center text-fg-muted transition-colors hover:bg-hover hover:text-fg active:scale-90"
            title={maximized ? "还原" : "最大化"}
          >
            {maximized ? <Copy className="size-3" /> : <Square className="size-3" />}
          </button>
          <button
            onClick={() => win?.close().catch(() => undefined)}
            className="flex w-[46px] items-center justify-center text-fg-muted transition-colors hover:bg-danger hover:text-white active:scale-90"
            title="关闭"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {menu && (
        <>
          <div
            className="fixed inset-0 z-[99]"
            onClick={() => setMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu(null);
            }}
          />
          <div
            className="glass anim-scale fixed z-[100] min-w-[180px] rounded-xl p-1.5 shadow-pop"
            style={{ left: menu.x, top: menu.y }}
          >
            <MenuItem
              label="最小化"
              onClick={() => {
                win?.minimize().catch(() => undefined);
                setMenu(null);
              }}
            />
            <MenuItem
              label={maximized ? "还原" : "最大化"}
              onClick={() => {
                win?.toggleMaximize().catch(() => undefined);
                setMenu(null);
              }}
            />
            <div className="mx-2 my-1 h-px bg-line" />
            <MenuItem
              label="关闭窗口"
              danger
              onClick={() => {
                win?.close().catch(() => undefined);
                setMenu(null);
              }}
            />
          </div>
        </>
      )}
    </>
  );
}
