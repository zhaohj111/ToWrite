// 关于 > 关于应用 > 版本与更新：当前版本、手动检查、自动检查开关、下载进度与结果。
// 状态来自 updateStore（Rust check_update / download_update + update://progress 事件）。

import { AlertCircle, CheckCircle2, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingToggle } from "@/components/settings/controls";
import { appVersion } from "@/components/settings/pages/aboutApp";
import { useUpdateStore } from "@/stores/updateStore";
import { cn } from "@/lib/cn";

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function UpdateControl() {
  const phase = useUpdateStore((s) => s.phase);
  const autoCheck = useUpdateStore((s) => s.autoCheck);
  const setAutoCheck = useUpdateStore((s) => s.setAutoCheck);
  const checkNow = useUpdateStore((s) => s.checkNow);
  const download = useUpdateStore((s) => s.download);
  const latestVersion = useUpdateStore((s) => s.latestVersion);
  const notes = useUpdateStore((s) => s.notes);
  const downloadUrl = useUpdateStore((s) => s.downloadUrl);
  const progress = useUpdateStore((s) => s.progress);
  const lastError = useUpdateStore((s) => s.lastError);

  const pct =
    progress && progress.total
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null;
  const busy = phase === "checking" || phase === "downloading";

  return (
    <div className="flex w-full flex-col gap-4">
      {/* 当前版本 + 自动检查开关 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-[15px] text-fg">{appVersion()}</span>
        <label className="flex items-center gap-2 text-[13px] text-fg-muted">
          启动时自动检查更新
          <SettingToggle checked={autoCheck} onChange={setAutoCheck} />
        </label>
      </div>

      {/* 检查动作 */}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => void checkNow()} disabled={busy}>
          <RefreshCw className={cn("size-3.5", phase === "checking" && "animate-spin")} />
          {phase === "checking" ? "正在检查…" : "检查更新"}
        </Button>
      </div>

      {/* 结果 / 下载进度 */}
      {phase === "up-to-date" && (
        <p className="flex items-center gap-1.5 text-[13px] text-fg-muted">
          <CheckCircle2 className="size-3.5 text-accent" /> 已是最新版本
        </p>
      )}

      {phase === "available" && (
        <div className="flex flex-col gap-2 rounded-lg border border-accent/25 bg-accent/5 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-fg-strong">
              发现新版本 <span className="font-mono text-accent">{latestVersion}</span>
            </span>
            <Button size="sm" onClick={() => void download()} disabled={!downloadUrl}>
              <Download className="size-3.5" /> 下载并更新
            </Button>
          </div>
          {downloadUrl == null && (
            <p className="text-xs text-fg-muted">
              该版本未提供 Windows 安装包，暂无法自动下载。
            </p>
          )}
          {notes && (
            <p className="line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-fg-muted">
              {notes}
            </p>
          )}
        </div>
      )}

      {phase === "downloading" && progress && (
        <div className="flex flex-col gap-1.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-line/60">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-200"
              style={{ width: `${pct ?? 0}%` }}
            />
          </div>
          <div className="text-xs text-fg-muted">
            {pct != null ? `下载中 ${pct}%` : "下载中…"}
            {" · "}
            {fmtSize(progress.downloaded)}
            {progress.total != null ? ` / ${fmtSize(progress.total)}` : ""}
          </div>
        </div>
      )}

      {phase === "downloaded" && (
        <p className="flex items-center gap-1.5 text-[13px] text-fg-muted">
          <CheckCircle2 className="size-3.5 text-accent" /> 已下载，正在打开安装包…
        </p>
      )}

      {(phase === "error" || phase === "download-error") && (
        <p className="flex items-center gap-1.5 text-[13px] text-danger">
          <AlertCircle className="size-3.5" /> {lastError ?? "检查更新失败"}
        </p>
      )}
    </div>
  );
}
