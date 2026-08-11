// 应用 > 应用快捷键：应用壳命令键位列表，行内改绑 / 恢复默认（复用共享 ShortcutRow）。

import { keybindingRegistry, useKeybindingsVersion } from "@/lib/keybindings";
import { ShortcutRow } from "@/components/settings/shortcutRow";

/** 应用壳命令键位列表（可改绑） */
export function AppShortcutsList() {
  useKeybindingsVersion();
  const defs = keybindingRegistry.list("app");
  if (defs.length === 0) {
    return <span className="text-[13px] text-fg-muted">暂无应用命令键位</span>;
  }
  return (
    <div className="flex w-full flex-col gap-1">
      {defs.map((d) => (
        <ShortcutRow key={d.command} def={d} />
      ))}
    </div>
  );
}
