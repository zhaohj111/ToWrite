// 关于 > 关于应用：版本号（读编译进二进制的版本，Tauri getVersion；浏览器开发回退常量）、
// 开源许可、反馈与文档入口（占位）。

import { ExternalLink, Github } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauri } from "@/lib/tauri";
import { useAppVersion } from "@/lib/appInfo";

export function VersionInfo() {
  const version = useAppVersion();
  return <span className="font-mono text-[15px] text-fg">{version}</span>;
}

/** 作者（开发者署名，链接到 GitHub；Tauri 下用 opener 插件在系统浏览器打开） */
export function AuthorInfo() {
  const openGithub = () => {
    const url = "https://github.com/zhaohj111";
    if (isTauri()) void openUrl(url);
    else window.open(url, "_blank", "noopener,noreferrer");
  };
  return (
    <button
      type="button"
      onClick={openGithub}
      className="inline-flex items-center gap-1.5 text-[15px] text-accent transition-colors hover:underline"
    >
      <Github className="size-4" />
      zhaohj111
      <ExternalLink className="size-3.5" />
    </button>
  );
}

export function LicenseInfo() {
  return (
    <div className="w-full text-[13px] leading-relaxed text-fg-muted">
      <p>拓文（ToWrite）基于 MIT 许可开源。</p>
      <p className="mt-1.5">
        允许任何人免费使用、复制、修改、合并、发布、分发、再许可及销售软件副本，唯一的条件是保留版权声明与许可声明。
      </p>
    </div>
  );
}

export function FeedbackEntry() {
  return (
    <span className="flex items-center gap-1 text-[13px] text-fg-muted">
      反馈渠道与使用文档将在 v1.0 提供
      <ExternalLink className="size-3.5" />
    </span>
  );
}
