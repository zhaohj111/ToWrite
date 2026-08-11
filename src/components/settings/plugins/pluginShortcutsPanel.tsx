// 插件「配置」tab：该插件作用域（plugin:<prototypeId>）快捷键列表，行内改绑 / 恢复默认。
// 改绑录制逻辑（组合键 / 双键序列 / F 键）见共享的 ShortcutRow。

import { keybindingRegistry, useKeybindingsVersion } from "@/lib/keybindings";
import { ShortcutRow } from "@/components/settings/shortcutRow";
import type { ModuleContract } from "@/types/plugin";

export function PluginShortcutsPanel({ module }: { module: ModuleContract }) {
  useKeybindingsVersion();
  const defs = keybindingRegistry.list(`plugin:${module.id}`);
  if (defs.length === 0) {
    return <p className="text-[13px] text-fg-muted">该插件暂无已注册快捷键。</p>;
  }
  return (
    <div className="flex flex-col gap-1">
      {defs.map((d) => (
        <ShortcutRow key={d.command} def={d} />
      ))}
    </div>
  );
}
