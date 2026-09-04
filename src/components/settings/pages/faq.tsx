// 常见问题（help.faq）：答疑整理中，先占位。
// 操作说明不再单独建页：各插件「完整说明」直达 设置 > 插件 > 已安装插件 > 详情旁的「操作说明」tab。

import { MessageCircleQuestion } from "lucide-react";

export const FaqPage = () => (
  <div className="flex max-w-3xl flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line/70 px-8 py-16 text-center">
    <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
      <MessageCircleQuestion className="size-6" />
    </span>
    <h3 className="text-[15px] font-semibold text-fg-strong">常见问题整理中</h3>
    <p className="max-w-md text-[13px] leading-relaxed text-fg-muted">
      诸如「如何导入 Word 文档」「时间轴标签为什么显示灰色」等高频问题将在此逐一整理；
      在此期间，各插件详细操作可查看
      <b className="font-medium text-fg"> 插件 → 已安装插件 → 操作说明</b>。
    </p>
  </div>
);
