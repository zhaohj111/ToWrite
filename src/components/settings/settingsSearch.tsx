// 设置全局搜索：对 settings.pages 全部设置项（title + keywords + path 各段）匹配。
// 命中项内联渲染 render() 控件 + 路径徽标；点击 → 跳转页面并高亮该项。
// 工程作用域设置项在无工程打开时不可达，不参与搜索。

import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { pluginRegistry } from "@/plugins/registry";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useSupporterAvailable } from "@/stores/updateStore";
import type { SettingItemMeta, SettingsPageContribution } from "@/types/settings";
import { cn } from "@/lib/cn";

interface Hit {
  page: SettingsPageContribution;
  item: SettingItemMeta;
}

export function SettingsSearch({
  onPick,
}: {
  onPick: (page: SettingsPageContribution, itemId: string) => void;
}) {
  const hasProject = !!useWorkspaceStore((s) => s.project);
  const supporterAvailable = useSupporterAvailable();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // 插件自有设置页（prototypeId）不参与全局搜索：只能从其插件详情的「配置」tab 进入
  // 支持者名单页：无 Supporter.md（或尚未完成启动检查）时不参与搜索
  const pages = pluginRegistry
    .getContributions("settings.pages")
    .filter((p) => !p.prototypeId && (p.id !== "about.supporter" || supporterAvailable));

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return [];
    const out: Hit[] = [];
    for (const page of pages) {
      if (page.scope === "project" && !hasProject) continue;
      for (const item of page.items) {
        const title = item.title.toLowerCase();
        const keywords = item.keywords.some((k) => k.toLowerCase().includes(q));
        const pathHit = item.path
          .toLowerCase()
          .split(">")
          .some((seg) => seg.includes(q));
        if (title.includes(q) || keywords || pathHit) out.push({ page, item });
      }
    }
    return out.slice(0, 8);
  }, [query, pages, hasProject]);

  // 点击外部关闭搜索结果
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, []);

  const pick = (hit: Hit) => {
    onPick(hit.page, hit.item.id);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative w-80 shrink-0">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted/70" />
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && hits.length > 0) pick(hits[0]);
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="搜索设置…"
        className="h-9 w-full rounded-lg border border-line bg-panel-3/60 pl-9 pr-3 text-sm text-fg caret-accent transition-all outline-none placeholder:text-fg-muted/60 hover:border-line-strong focus:border-accent/40"
      />
      {open && query.trim() && (
        <div className="glass anim-scale absolute left-0 right-0 top-11 z-50 max-h-80 overflow-y-auto rounded-xl p-1.5 shadow-xl">
          {hits.length === 0 ? (
            <div className="px-3 py-2.5 text-sm text-fg-muted">未找到相关设置</div>
          ) : (
            hits.map((hit) => (
              <button
                key={`${hit.page.id}:${hit.item.id}`}
                onClick={() => pick(hit)}
                className="group flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-hover"
              >
                <span className="flex items-center gap-2 text-[15px] text-fg">
                  <span className="truncate">{hit.item.title}</span>
                  <CornerDownLeft className="ml-auto size-3.5 shrink-0 text-fg-muted opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
                <span className="text-xs text-fg-muted/80">{hit.item.path}</span>
                <span className="pointer-events-none">
                  {hit.item.render()}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
