// 操作快捷指引通用组件（与具体插件解耦）：
// - EmptyStateGuide：画布为空时的居中引导卡——每个工程每个插件仅弹出一次（按「工程 id + 插件」记录）
// - ToolbarGuideButton：工具栏「?」按钮，点击弹出同款指引弹层（Portal 到 body），不显示红点
// 各插件在自身模块目录提供 QuickGuideData（标题/步骤/跳转原型 id），在工具栏注册处与画布空态处传入。
// 「查看完整说明」跳转 设置 → 插件 → 已安装插件 → 对应插件详情 →「操作说明」tab。

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, CircleHelp, MousePointer2, type LucideIcon } from "lucide-react";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { getSetting, setSetting } from "@/lib/settings";
import { cn } from "@/lib/cn";

/** 插件提供的指引数据（由各插件模块定义，本组件不感知具体插件） */
export interface QuickGuideData {
  /** 插件原型 id（「查看完整说明」跳转的插件详情目标） */
  prototypeId: string;
  /** 卡片 / 弹层标题 */
  title: string;
  /** 副标题（一句话） */
  subtitle: string;
  /** 步骤列表（图标 + 一句话） */
  steps: { icon: LucideIcon; text: string }[];
  /** 空态卡末尾提示文案中的补充项（如「标签筛选、导出与更多」） */
  footerHint: string;
}

/** 打开设置 → 插件 → 已安装插件 → 该插件详情 →「操作说明」tab */
export function openPluginDocs(data: QuickGuideData): void {
  useWorkspaceStore.getState().openSettings({
    group: "plugin",
    pageId: "plugin.installed",
    pluginGuide: data.prototypeId,
  });
}

/** 步骤列表（卡片与弹层共用） */
function GuideSteps({ steps }: { steps: QuickGuideData["steps"] }) {
  return (
    <ul className="space-y-2">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className="mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full bg-panel-3 text-fg-muted">
            <s.icon className="size-2.5" />
          </span>
          <span className="min-w-0 text-[12px] leading-relaxed text-fg">{s.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** 空态引导卡：仅画布为空时由宿主渲染；每工程每插件仅弹出一次（首次显示即记录，之后不再出现） */
export function EmptyStateGuide({
  projectId,
  data,
}: {
  projectId: string;
  data: QuickGuideData;
}) {
  const [visible, setVisible] = useState(false);
  const key = `guideShown.${projectId}.${data.prototypeId}`;

  // 首次进入空状态：显示并立刻记录（该工程该插件不再弹出）
  useEffect(() => {
    let alive = true;
    void getSetting<boolean>(key, false).then((v) => {
      if (alive && !v) {
        setVisible(true);
        void setSetting(key, true);
      }
    });
    return () => {
      alive = false;
    };
  }, [key]);

  if (!visible) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      <div
        data-overlay
        onContextMenu={(e) => e.preventDefault()}
        className="anim-rise pointer-events-auto w-[min(360px,92%)] rounded-2xl border border-line/70 bg-app/85 p-5 shadow-pop backdrop-blur-sm"
      >
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <MousePointer2 className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-fg-strong">{data.title}</h3>
            <p className="mt-0.5 text-[11px] text-fg-muted">{data.subtitle}</p>
          </div>
        </div>
        <div className="mt-4">
          <GuideSteps steps={data.steps} />
        </div>
        <p className="mt-3 text-[11px] text-fg-muted/80">
          提示：工具栏最左侧「?」可随时再次打开本指引；{data.footerHint}详见完整说明。
        </p>
        <div className="mt-4 flex items-center justify-end gap-2 border-t border-line/60 pt-3.5">
          <button
            onClick={() => {
              setVisible(false);
              openPluginDocs(data);
            }}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-fg-muted transition-colors hover:bg-hover hover:text-fg"
          >
            <BookOpen className="size-3.5" /> 查看完整说明
          </button>
          <button
            onClick={() => setVisible(false)}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-85"
          >
            知道了
          </button>
        </div>
      </div>
    </div>
  );
}

/** 工具栏「?」按钮：位于工具栏最左侧（分隔线前），无红点；弹层与取色器同款定位（Portal 到 body） */
export function ToolbarGuideButton({ data }: { data: QuickGuideData }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const rect = btnRef.current?.getBoundingClientRect();

  return (
    <>
      <button
        ref={btnRef}
        title="操作指引"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-all duration-150 active:scale-95",
          open ? "bg-accent-soft text-accent" : "text-fg-muted hover:bg-hover hover:text-fg",
        )}
      >
        <CircleHelp className="size-4" />
      </button>
      {open &&
        rect &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div
              className="fixed z-50 w-[300px] overflow-hidden rounded-xl border border-line/70 bg-app shadow-pop"
              style={{
                left: Math.max(8, Math.min(rect.left, window.innerWidth - 312)),
                top: rect.bottom + 4,
              }}
            >
              <div className="border-b border-line/50 px-3.5 py-2.5">
                <span className="text-[12px] font-semibold text-fg-strong">{data.title}</span>
              </div>
              <div className="px-3.5 py-3">
                <GuideSteps steps={data.steps} />
              </div>
              <div className="flex items-center justify-between border-t border-line/60 px-3.5 py-2.5">
                <button
                  onClick={() => {
                    setOpen(false);
                    openPluginDocs(data);
                  }}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-hover hover:text-fg"
                >
                  <BookOpen className="size-3.5" /> 查看完整说明
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-lg bg-accent px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:opacity-85"
                >
                  知道了
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
