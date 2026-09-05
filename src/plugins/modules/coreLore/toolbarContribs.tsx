// core.lore —— 视图工具栏贡献点（lore.toolbar）：
// 撤销/重做、布局切换、连接线/关系文本颜色、标签管理由宿主 MainArea 按注册渲染。
// 与主文件解耦：色块按钮与工具项均在本文件登记，新增/调整只改本文件。

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Grid3x3, Redo2, Share2, Tags, Undo2 } from "lucide-react";
import type { PluginContext } from "@/types/plugin";
import { requestLoreRedo, requestLoreUndo } from "@/lib/loreBus";
import { requestLoreIo } from "@/lib/loreBus";
import { Download, FileDown, FileImage, FileUp } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ColorPickerPanel } from "@/components/ui/colorPicker";
import { cn } from "@/lib/cn";
import { ToolbarGuideButton } from "@/components/ui/quickGuide";
import { loreGuide } from "./guideData";

/** 工具栏色块按钮（自 mainArea 移入）：色块 + 文字标签，点击弹出通用取色面板（Portal 到 body） */
function ColorSwatch({
  value,
  onChange,
  title,
  label,
}: {
  value: string;
  onChange: (color: string) => void;
  title: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const rect = btnRef.current?.getBoundingClientRect();

  return (
    <>
      <button
        ref={btnRef}
        title={title}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-md px-1.5 transition-all duration-150 active:scale-95",
          open ? "bg-accent-soft" : "text-fg-muted hover:bg-hover hover:text-fg",
        )}
      >
        <span className="size-3.5 rounded-[4px] ring-1 ring-line" style={{ background: value }} />
        <span className="text-[11px] leading-none">{label}</span>
      </button>
      {open &&
        rect &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div
              className="fixed z-50 overflow-hidden rounded-xl border border-line/70 bg-app shadow-pop"
              style={{
                left: Math.min(rect.left, window.innerWidth - 268),
                top: rect.bottom + 4,
              }}
            >
              <div className="border-b border-line/50 px-3 py-1.5">
                <span className="text-[11px] font-medium text-fg">当前{label}颜色</span>
              </div>
              <ColorPickerPanel value={value} onChange={onChange} />
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

/** 注册设定库视图工具栏全部条目 */
export function registerLoreToolbar(ctx: PluginContext): void {
  // 操作指引置于最左（与撤销/重做以分隔线隔开）
  ctx.registerContribution("lore.toolbar", {
    id: "guide",
    title: "操作指引（新用户上手）",
    groupId: "toolbarGuide",
    render: () => <ToolbarGuideButton data={loreGuide} />,
  });
  ctx.registerContribution("lore.toolbar", {
    id: "divider-guide",
    title: "",
    divider: true,
  });
  ctx.registerContribution("lore.toolbar", {
    id: "undo",
    title: "撤销（编辑内容 / 返回上一步视图）",
    groupId: "toolbarUndo",
    icon: Undo2,
    action: ({ instanceId }) => requestLoreUndo(instanceId),
  });
  ctx.registerContribution("lore.toolbar", {
    id: "redo",
    title: "重做",
    groupId: "toolbarRedo",
    icon: Redo2,
    action: ({ instanceId }) => requestLoreRedo(instanceId),
  });
  ctx.registerContribution("lore.toolbar", {
    id: "divider-0",
    title: "",
    divider: true,
  });
  ctx.registerContribution("lore.toolbar", {
    id: "layout",
    title: "切换布局",
    groupId: "toolbarLayout",
    action: ({ onToggleLayout }) => onToggleLayout?.(),
    // 动态图标：显示当前布局的目标态（网格时显示连接图、连接图时显示网格）
    render: (tctx) => (
      <button
        title={tctx.layout === "graph" ? "切换为网格布局" : "切换为连接图"}
        onClick={() => tctx.onToggleLayout?.()}
        className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-all duration-150 hover:bg-hover hover:text-fg active:scale-95"
      >
        {tctx.layout === "graph" ? (
          <Grid3x3 className="size-4" />
        ) : (
          <Share2 className="size-4" />
        )}
      </button>
    ),
  });
  ctx.registerContribution("lore.toolbar", {
    id: "edge-color",
    groupId: "toolbarEdgeColor",
    title: "连接线颜色（新建连线 / 更改关系名时起效）",
    render: (tctx) => (
      <ColorSwatch
        value={tctx.edgeColor ?? "#8a8f98"}
        onChange={(c) => tctx.onSetEdgeColor?.(c)}
        title="连接线颜色（新建连线 / 更改关系名时起效）"
        label="连线"
      />
    ),
  });
  ctx.registerContribution("lore.toolbar", {
    id: "edge-label-color",
    title: "关系文本颜色（新建连线 / 更改关系名时起效）",
    groupId: "toolbarEdgeLabelColor",
    render: (tctx) => (
      <ColorSwatch
        value={tctx.edgeLabelColor ?? "#8a8f98"}
        onChange={(c) => tctx.onSetEdgeLabelColor?.(c)}
        title="关系文本颜色（新建连线 / 更改关系名时起效）"
        label="文本"
      />
    ),
  });
  ctx.registerContribution("lore.toolbar", {
    id: "tags",
    title: "标签管理",
    groupId: "toolbarTags",
    icon: Tags,
    isActive: ({ openPanelId }) => openPanelId === "tags",
    action: ({ openPanel }) => openPanel("tags"),
  });


  ctx.registerContribution("lore.toolbar", {
    id: "io",
    title: "导入 / 导出",
    groupId: "toolbarIO",
    render: (tctx) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            title="导入 / 导出"
            className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-all duration-150 hover:bg-hover hover:text-fg active:scale-95"
          >
            <Download className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => requestLoreIo(tctx.instanceId, "exportLoreFile")}>
            <FileDown className="size-3.5 opacity-70" />
            <span className="flex-1">导出设定库文件（.lore）</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => requestLoreIo(tctx.instanceId, "exportLorePng")}>
            <FileImage className="size-3.5 opacity-70" />
            <span className="flex-1">导出 PNG 图片（连接图）</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => requestLoreIo(tctx.instanceId, "importLoreFile")}>
            <FileUp className="size-3.5 opacity-70" />
            <span className="flex-1">导入设定库文件</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  });
}