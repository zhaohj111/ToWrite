// 关于 > 关于应用：版本号（读 i18n 贡献，与界面同步）、开源许可、反馈与文档入口（占位）。

import { ExternalLink, Github } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauri } from "@/lib/tauri";
import { pluginRegistry } from "@/plugins/registry";

/** 当前应用版本：读 i18n 贡献（与界面同步），缺省回退 0.6.0；更新控件复用 */
export function appVersion(): string {
  const res = pluginRegistry.getContributions("i18n.resources");
  const zh = res.find((r) => r.locale === "zh-CN");
  return zh?.resources?.["app.version"] ?? "0.6.0";
}

export function VersionInfo() {
  return <span className="font-mono text-[15px] text-fg">{appVersion()}</span>;
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
