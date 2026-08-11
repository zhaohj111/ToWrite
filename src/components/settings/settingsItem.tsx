// 设置项行：标题 + 描述 + 控件。页面内与搜索结果共用的渲染单元。
// focused 时滚动到可视区并显示短暂高亮环（搜索结果点击跳转用）。

import { useEffect, useRef, useState } from "react";
import type { SettingItemMeta } from "@/types/settings";
import { cn } from "@/lib/cn";

export function SettingsItem({
  item,
  focused,
  onFocusDone,
}: {
  item: SettingItemMeta;
  focused?: boolean;
  onFocusDone?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ring, setRing] = useState(false);

  useEffect(() => {
    if (!focused) return;
    setRing(true);
    ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const t = setTimeout(() => {
      setRing(false);
      onFocusDone?.();
    }, 2200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);

  const stacked = item.layout === "stack";
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-xl border border-transparent px-4 py-4 transition-all duration-500",
        stacked ? "flex flex-col gap-3" : "flex items-center justify-between gap-8",
        ring && "border-accent/60 bg-accent/5",
      )}
    >
      <div className={cn(!stacked && "min-w-0")}>
        <div className="text-[15px] font-medium text-fg-strong">{item.title}</div>
        {item.description && (
          <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{item.description}</p>
        )}
      </div>
      {/* 多行/多元素控件：独占下方整行（单栏多行排版）；单横栏控件保持右上角定位 */}
      <div className={cn(stacked ? "w-full" : "shrink-0")}>{item.render()}</div>
    </div>
  );
}
