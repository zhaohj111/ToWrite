// 关于 > 更新日志：左侧大纲（一级标题，取自 md 的标题层级）+ 右侧正文渲染；
// 点击大纲滚动到对应标题，滚动时用 IntersectionObserver 高亮当前章节。
// 内容优先级：检查更新时从 GitHub 拉取的最新 CHANGELOG.md > 随包内置版本（source prop）。
// 首次打开若尚未拉取则后台刷新一次；大纲旁提供手动「刷新」按钮。

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Markdown, parseHeadings } from "@/components/ui/markdown";
import { useUpdateStore } from "@/stores/updateStore";
import { cn } from "@/lib/cn";

const ANCHOR_PREFIX = "changelog-heading-";

export function ChangelogPage({ source }: { source: string }) {
  const githubChangelog = useUpdateStore((s) => s.changelog);
  const changelogLoading = useUpdateStore((s) => s.changelogLoading);
  const changelogError = useUpdateStore((s) => s.changelogError);

  const md = githubChangelog ?? source;
  const headings = useMemo(() => parseHeadings(md), [md]);
  const [active, setActive] = useState(-1);

  // 首次打开且尚未拉取到 GitHub 版本时，后台拉取最新更新日志（失败回退随包内置，不打扰）
  useEffect(() => {
    if (githubChangelog == null) void useUpdateStore.getState().refreshChangelog();
  }, [githubChangelog]);

  // 与 Markdown 渲染共用同一套标题顺序，保证锚点 id 一一对应
  const headingId = (_: unknown, index: number) => `${ANCHOR_PREFIX}${index}`;

  const jumpTo = (index: number) => {
    document
      .getElementById(`${ANCHOR_PREFIX}${index}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(index);
  };

  // 滚动到某章节时高亮大纲对应项（观察视口中部横带内的标题）
  useEffect(() => {
    const els = headings
      .map((_, i) => document.getElementById(`${ANCHOR_PREFIX}${i}`))
      .filter((el): el is HTMLElement => !!el);
    if (els.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const id = (e.target as HTMLElement).id;
            const idx = Number(id.slice(ANCHOR_PREFIX.length));
            setActive(idx);
          }
        }
      },
      { rootMargin: "-70px 0px -70% 0px" },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [headings]);

  return (
    <div className="flex w-full items-start gap-8">
      <aside className="sticky top-0 w-52 shrink-0">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs text-fg-muted">大纲</span>
          <button
            type="button"
            onClick={() => void useUpdateStore.getState().refreshChangelog()}
            disabled={changelogLoading}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-fg-muted transition-colors hover:bg-hover hover:text-fg disabled:opacity-60"
            title="从 GitHub 拉取最新更新日志"
          >
            <RefreshCw className={cn("size-3", changelogLoading && "animate-spin")} />
            {changelogLoading ? "拉取中" : "刷新"}
          </button>
        </div>
        {changelogError && (
          <p className="mb-1.5 text-[11px] leading-snug text-danger" title={changelogError}>
            拉取失败，显示内置版本
          </p>
        )}
        <div className="flex max-h-[60vh] flex-col gap-0.5 overflow-y-auto">
          {headings.map((h, i) => (
            <button
              key={i}
              onClick={() => jumpTo(i)}
              title={h.text}
              className={cn(
                "truncate rounded-md py-1 pr-2 text-left text-[13px] transition-colors",
                i === active
                  ? "bg-accent/10 text-accent"
                  : "text-fg-muted hover:bg-hover hover:text-fg",
              )}
              style={{ paddingLeft: 8 + (h.level - 1) * 12 }}
            >
              {h.text}
            </button>
          ))}
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <Markdown source={md} headingId={headingId} />
      </div>
    </div>
  );
}
