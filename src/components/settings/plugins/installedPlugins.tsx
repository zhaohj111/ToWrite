// 插件 > 已安装插件：左栏原型列表（图标/名称/版本/启停开关）+ 右栏插件详情。
// core.config 为应用核心，仅信息展示不可启停；禁用原型不影响数据（.writeproj 不动），重启用即恢复。

import { useState } from "react";
import { Package } from "lucide-react";
import { pluginRegistry } from "@/plugins/registry";
import { useRegistryVersion } from "@/plugins/hooks";
import { useSettingsStore } from "@/stores/settingsStore";
import type { ModuleContract } from "@/types/plugin";
import { cn } from "@/lib/cn";
import { SettingToggle } from "@/components/settings/controls";
import { PluginDetail } from "@/components/settings/plugins/pluginDetail";

export function InstalledPlugins() {
  useRegistryVersion();
  const modules = pluginRegistry.listModules();
  const [selectedId, setSelectedId] = useState<string | null>(modules[0]?.id ?? null);
  const selected = modules.find((m) => m.id === selectedId) ?? modules[0] ?? null;

  return (
    <div className="flex h-full gap-0">
      {/* 左栏：原型列表 */}
      <div className="hidden-scrollbar w-72 shrink-0 overflow-y-auto pr-2">
        <div className="flex flex-col gap-0.5">
          {modules.map((m) => (
            <ModuleRow
              key={m.id}
              module={m}
              active={selected?.id === m.id}
              onSelect={() => setSelectedId(m.id)}
            />
          ))}
          {modules.length === 0 && (
            <p className="px-2 py-3 text-xs text-fg-muted">暂无可管理插件。</p>
          )}
        </div>
      </div>
      {/* 右栏：插件详情 */}
      <div className="min-w-0 flex-1 pl-2">
        {selected ? (
          <PluginDetail key={selected.id} module={selected} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-fg-muted">
            请选择左侧插件查看详情
          </div>
        )}
      </div>
    </div>
  );
}

function ModuleRow({
  module,
  active,
  onSelect,
}: {
  module: ModuleContract;
  active: boolean;
  onSelect: () => void;
}) {
  const enabled = useSettingsStore((s) => s.prototypeEnabled[module.id] ?? true);
  const setEnabled = useSettingsStore((s) => s.setPrototypeEnabled);
  const isCore = module.kind === "core";
  const Icon = module.views?.activityBar?.icon ?? Package;

  return (
    <div
      className={cn(
        "group flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors",
        active
          ? "border-accent/30 bg-accent/10"
          : "border-transparent hover:bg-hover",
        !enabled && !isCore && "opacity-50",
      )}
    >
      <button onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-panel-2 text-fg-muted transition-colors group-hover:text-accent">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[15px] text-fg">{module.name}</span>
            <span className="shrink-0 rounded border border-line px-1 font-mono text-[10px] text-fg-muted">
              {module.version ?? "—"}
            </span>
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-fg-muted">
            {module.id}
          </div>
        </div>
      </button>
      <SettingToggle
        checked={isCore ? true : enabled}
        onChange={(v) => setEnabled(module.id, v)}
        disabled={isCore}
        title={isCore ? "应用核心，不可禁用" : undefined}
      />
    </div>
  );
}
