// 状态栏实时反馈：总字数、本章字数、模式与缩放。

import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useEditorStore, EMPTY_SLICE } from "@/stores/editorStore";
import { useLayoutStore } from "@/stores/layoutStore";
import { countDocWords } from "@/lib/text";

export function StatusBar() {
  const project = useWorkspaceStore((s) => s.project);
  const slices = useEditorStore((s) => s.slices);
  const mainViewId = useLayoutStore((s) => s.mainViewId);
  const zoom = useLayoutStore((s) => s.zoom);
  const cycleZoom = useLayoutStore((s) => s.cycleZoom);

  // 取当前活动编辑器实例的字数；非编辑器视图（时间轴等）回退到「正文」实例
  const activeId = slices[mainViewId] ? mainViewId : "editor";
  const slice = slices[activeId] ?? EMPTY_SLICE;
  const { chapters, contents, currentChapterId: currentId } = slice;

  const current = chapters.find((c) => c.id === currentId);
  const chapterWords = currentId ? countDocWords(contents[currentId]) : 0;
  const totalWords = chapters.reduce((sum, c) => sum + countDocWords(contents[c.id]), 0);

  return (
    <div className="flex h-[26px] shrink-0 items-center gap-3 border-t border-line/60 bg-app px-4 text-[11px] text-fg-muted">
      {project ? (
        <>
          <span className="flex items-center gap-1.5 truncate text-fg">
            <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-accent" />
            {current?.title ?? "—"}
          </span>
          <span className="h-3 w-px bg-line" />
          <span className="font-mono tabular-nums">
            本章 <span key={chapterWords} className="anim-num inline-block">{chapterWords}</span> 字
          </span>
          <span className="h-3 w-px bg-line" />
          <span className="font-mono tabular-nums">
            总字数 <span key={totalWords} className="anim-num inline-block">{totalWords}</span>
          </span>
        </>
      ) : (
        <span>未打开工程</span>
      )}
      <div className="flex-1" />
      <span className="hidden text-fg-muted/70 sm:inline">本地模式</span>
      <button
        onClick={cycleZoom}
        title="切换界面缩放（90% / 100% / 120% / 150%）"
        className="rounded-md px-1.5 py-0.5 font-mono tabular-nums transition-colors hover:bg-hover hover:text-fg active:scale-90"
      >
        {zoom}%
      </button>
    </div>
  );
}
