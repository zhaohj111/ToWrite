// 编辑器工具栏：由 editor.toolbar 贡献点动态渲染 + 右侧快捷字号调节。
// 字号按插件实例隔离（级联解析）：工具栏位于 EditorInstanceProvider 内，经 useEditorInstance 取当前实例 id。

import { pluginRegistry } from "@/plugins/registry";
import { useEditorCtx } from "@/components/editor/editorContext";
import { useEditorInstance } from "@/components/editor/editorInstanceContext";
import { DEFAULT_FONT_SIZE } from "@/stores/editorStore";
import { EDITOR_PROTOTYPE } from "@/stores/pluginStore";
import { useSettingsStore, resolveSetting } from "@/stores/settingsStore";
import { cn } from "@/lib/cn";

const MIN_FONT = 12;
const MAX_FONT = 28;

export function Toolbar() {
  const editor = useEditorCtx();
  const instanceId = useEditorInstance();
  const items = pluginRegistry.getContributions("editor.toolbar");
  // 级联：实例覆盖 > 应用级插件设置 > manifest 默认（17）
  useSettingsStore();
  const fontSize = (resolveSetting(EDITOR_PROTOTYPE, instanceId, "fontSize") as number) ?? DEFAULT_FONT_SIZE;

  return (
    <div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-line/60 bg-app px-2">
      {items.map((item) =>
        item.divider ? (
          <span key={item.id} className="mx-1.5 h-4 w-px bg-line" />
        ) : (
          <button
            key={item.id}
            title={item.title}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => item.action({ editor })}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md transition-all duration-150 active:scale-95",
              item.isActive?.({ editor })
                ? "bg-accent/20 text-accent"
                : "text-fg-muted hover:bg-hover hover:text-fg",
            )}
          >
            <item.icon className="size-4" />
          </button>
        ),
      )}
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
