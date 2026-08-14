// 编辑器工具栏：由 editor.toolbar 贡献点动态渲染 + 右侧快捷字号调节。
// v0.7：
//   - 带 groupId 的项按实例级显示开关过滤（resolveSetting，false 隐藏）
//   - 带 menu 的项渲染为下拉菜单（导出/导入/表格等）；menu 项带 children 时渲染为二级子菜单
//   - danger 项用主题朱砂红（--color-danger）
// 字号按插件实例隔离（级联解析）：工具栏位于 EditorInstanceProvider 内，经 useEditorInstance 取当前实例 id。

import { pluginRegistry } from "@/plugins/registry";
import { useEditorCtx } from "@/components/editor/editorContext";
import { useEditorInstance } from "@/components/editor/editorInstanceContext";
import { DEFAULT_FONT_SIZE } from "@/stores/editorStore";
import { EDITOR_PROTOTYPE } from "@/stores/pluginStore";
import { useSettingsStore, resolveSetting } from "@/stores/settingsStore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";
import type { ToolbarItem } from "@/types/plugin";

const MIN_FONT = 12;
const MAX_FONT = 28;

/** 按显示开关过滤 + 清理孤立分隔线 */
function applyVisibility(items: ToolbarItem[], instanceId: string): ToolbarItem[] {
  const visible = items.filter(
    (i) => !i.groupId || resolveSetting(EDITOR_PROTOTYPE, instanceId, i.groupId) !== false,
  );
  // 去掉首尾及相邻的分隔线（相邻开关组都隐藏后避免残留空分隔）
  return visible.filter((item, idx, arr) => {
    if (!item.divider) return true;
    const prev = arr[idx - 1];
    const next = arr[idx + 1];
    const prevIsDivider = !!prev?.divider;
    const nextIsDivider = !!next?.divider;
    const atEdge = idx === 0 || idx === arr.length - 1;
    return !prevIsDivider && !nextIsDivider && !atEdge;
  });
}

export function Toolbar() {
  const editor = useEditorCtx();
  const instanceId = useEditorInstance();
  const allItems = pluginRegistry.getContributions("editor.toolbar");
  // 级联：实例覆盖 > 应用级插件设置 > manifest 默认（17）；订阅 settingsStore 响应设置页改动
  useSettingsStore();
  const fontSize = (resolveSetting(EDITOR_PROTOTYPE, instanceId, "fontSize") as number) ?? DEFAULT_FONT_SIZE;
  const items = applyVisibility(allItems, instanceId);

  return (
    <div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-line/60 bg-app px-2">
      {items.map((item) => {
        if (item.divider) {
          return <span key={item.id} className="mx-1.5 h-4 w-px shrink-0 bg-line" />;
        }
        const ctx = { editor, instanceId };
        const buttonClass = cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-all duration-150 active:scale-95",
          item.isActive?.(ctx)
            ? "bg-accent/20 text-accent"
            : "text-fg-muted hover:bg-hover hover:text-fg",
        );
        // 自定义内联渲染（取色块等）
        if (item.render) {
          return <span key={item.id} className="flex shrink-0 items-center">{item.render(ctx)}</span>;
        }
        // 下拉菜单项
        if (item.menu && item.menu.length > 0) {
          return (
            <DropdownMenu key={item.id}>
              <DropdownMenuTrigger asChild>
                <button title={item.title} onMouseDown={(e) => e.preventDefault()} className={buttonClass}>
                  <item.icon className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {item.menu.map((mi, i) =>
                  mi.children && mi.children.length > 0 ? (
                    <DropdownMenuSub key={i}>
                      <DropdownMenuSubTrigger className="px-2.5 py-2 text-sm">
                        {mi.icon ? <mi.icon className="size-3.5 opacity-70" /> : null}
                        <span className="flex-1">{mi.title}</span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent sideOffset={4}>
                        {mi.children.map((sub, j) => (
                          <DropdownMenuItem
                            key={j}
                            onSelect={() => sub.run?.(ctx)}
                            className={cn(
                              "px-2.5 py-2 text-sm",
                              sub.danger &&
                                "text-danger data-[highlighted]:bg-danger/10 data-[highlighted]:text-danger",
                            )}
                          >
                            {sub.icon ? <sub.icon className="size-3.5 opacity-70" /> : null}
                            <span className="flex-1">{sub.title}</span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  ) : (
                    <DropdownMenuItem
                      key={i}
                      onSelect={() => mi.run?.(ctx)}
                      className={cn(
                        mi.danger &&
                          "text-danger data-[highlighted]:bg-danger/10 data-[highlighted]:text-danger",
                      )}
                    >
                      {mi.icon ? <mi.icon className="size-3.5 opacity-70" /> : null}
                      <span className="flex-1">{mi.title}</span>
                    </DropdownMenuItem>
                  ),
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        }
        // 普通按钮
        return (
          <button
            key={item.id}
            title={item.title}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => item.action(ctx)}
            className={buttonClass}
          >
            <item.icon className="size-4" />
          </button>
        );
      })}
      {items.length === 0 && <span className="text-xs text-fg-muted">工具栏为空</span>}

      {/* ===== 快捷字号调节 ===== */}
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        <span className="mx-1.5 h-4 w-px bg-line" />
        <button
          title="减小字号"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => useSettingsStore.getState().setInstanceSetting(instanceId, "fontSize", Math.max(MIN_FONT, fontSize - 1))}
          className="flex h-7 w-8 items-center justify-center rounded-md font-mono text-[13px] font-semibold text-fg-muted transition-all duration-150 hover:bg-hover hover:text-fg active:scale-95"
        >
          A−
        </button>
        <button
          title={`重置字号（${DEFAULT_FONT_SIZE}px）`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => useSettingsStore.getState().setInstanceSetting(instanceId, "fontSize", DEFAULT_FONT_SIZE)}
          className="flex h-7 min-w-7 items-center justify-center rounded-md px-1 font-mono text-xs text-fg-muted transition-all duration-150 hover:bg-hover hover:text-fg active:scale-95"
        >
          {fontSize}
        </button>
        <button
          title="增大字号"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => useSettingsStore.getState().setInstanceSetting(instanceId, "fontSize", Math.min(MAX_FONT, fontSize + 1))}
          className="flex h-7 w-8 items-center justify-center rounded-md font-mono text-[13px] font-semibold text-fg-muted transition-all duration-150 hover:bg-hover hover:text-fg active:scale-95"
        >
          A+
        </button>
      </div>
    </div>
  );
}
