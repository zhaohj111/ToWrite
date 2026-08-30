// 关于 > 赞助支持：请作者喝杯咖啡（爱发电赞助）。
// 爱发电为平台托管支付：金额/昵称/支付在官方页面内完成（跳过平台页自行收款违反条款），
// 此处提供「前往官方赞助页」按钮，在系统浏览器打开。

import { Coffee, ExternalLink, Heart, HeartHandshake } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauri } from "@/lib/tauri";

/** 爱发电创作者主页（赞助在官方页面内完成） */
const AFDIAN_URL = "https://ifdian.net/a/zhaohjgg";

export function SponsorPage() {
  const openAfdian = () => {
    if (isTauri()) void openUrl(AFDIAN_URL);
    else window.open(AFDIAN_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex w-full flex-col items-center">
      <div className="flex w-full max-w-sm flex-col items-center gap-2.5 text-center">
        {/* 标题与说明（居中） */}
        <span
          className="flex size-10 items-center justify-center rounded-full"
          style={{ background: "var(--color-accent-soft)" }}
        >
          <Coffee className="size-5 text-accent" />
        </span>
        <h3 className="font-display text-lg font-semibold text-fg-strong">请作者喝杯咖啡</h3>
        <p className="text-[13px] leading-relaxed text-fg-muted">
          如果拓文（ToWrite）帮到了你的写作，欢迎通过爱发电赞助——每一份心意都将用于后续功能开发。
        </p>

        {/* 爱发电赞助入口（官方页面内输入金额/昵称并支付） */}
        <button
          type="button"
          onClick={openAfdian}
          className="mt-2 inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-5 text-sm font-medium text-white transition-opacity hover:opacity-90 active:scale-[0.98]"
        >
          <HeartHandshake className="size-4" />
          前往爱发电赞助
          <ExternalLink className="size-3.5 opacity-80" />
        </button>
        <span className="text-xs text-fg-muted/60">{AFDIAN_URL}</span>
        
        <p className="mt-3 flex items-center gap-1.5 text-xs text-fg-muted/80">
          无论任何金额，赞助后都将加入官方支持者名单展示，感谢你的认可与支持！
          如需自定义展示昵称，请在备注中表明，无则使用爱发电昵称。
        </p>

        {/* 致谢 */}
        <p className="mt-3 flex items-center gap-1.5 text-xs text-fg-muted/80">
          <Heart className="size-3.5 text-danger" />
          感谢每一位支持者，你们的认可让这个项目得以继续。
        </p>

      </div>
    </div>
  );
}

export default SponsorPage;
