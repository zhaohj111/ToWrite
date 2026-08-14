// 窗口顶部结果提示宿主（ToastHost）：固定居中于标题栏下方，按类型着色图标。
// 成功提示带「在文件夹中显示」按钮（Tauri opener 插件 revealItemInDir；浏览器联调下隐藏）。
// 由 App 挂载一次；各插件经 PluginContext.notify / @/lib/notify 触发。

import { CheckCircle2, FolderOpen, Info, X, XCircle } from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useNotifyStore, type ToastKind } from "@/stores/notifyStore";
import { isTauri } from "@/lib/tauri";
import { cn } from "@/lib/cn";

const KIND_ICON: Record<ToastKind, typeof Info> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

/** 图标着色：成功走朱砂强调色（应用单一强调色的正向语义），错误走 danger，中性走 info */
const KIND_COLOR: Record<ToastKind, string> = {
  success: "text-accent",
  error: "text-danger",
  info: "text-info",
};

export function ToastHost() {
  const toasts = useNotifyStore((s) => s.toasts);
  const dismiss = useNotifyStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[50px] z-[120] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => {
        const Icon = KIND_ICON[t.kind];
        return (
          <div
            key={t.id}
            className="toast-item glass pointer-events-auto flex w-full max-w-[460px] items-start gap-2.5 rounded-xl px-3.5 py-2.5 shadow-pop"
          >
            <Icon className={cn("mt-0.5 size-4 shrink-0", KIND_COLOR[t.kind])} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] leading-snug text-fg-strong">{t.message}</p>
              {t.detail && (
                <p className="mt-0.5 break-all text-[11px] leading-snug text-fg-muted">
                  {t.detail}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {t.filePath && isTauri() && (
                <button
                  title="在文件夹中显示"
                  onClick={() => void revealItemInDir(t.filePath!).catch(() => undefined)}
                  className="rounded-md p-1 text-fg-muted transition-colors hover:bg-hover hover:text-fg-strong"
                >
                  <FolderOpen className="size-3.5" />
                </button>
              )}
              <button
                title="关闭"
                onClick={() => dismiss(t.id)}
                className="rounded-md p-1 text-fg-muted transition-colors hover:bg-hover hover:text-fg-strong"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
