// 插件「配置」tab：manifest 声明的设置字段 → 级联第 ② 层应用级默认值（config.json → pluginSettings）。
// 每个字段带「已覆盖」徽标与「恢复默认」（clearPluginSetting）。

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SettingNumber,
  SettingSelect,
  SettingToggle,
} from "@/components/settings/controls";
import { useSettingsStore } from "@/stores/settingsStore";
import type { ModuleContract, SettingFieldDef } from "@/types/plugin";

export function PluginSettingsPanel({ module }: { module: ModuleContract }) {
  const fields = Object.entries(module.settings ?? {});
  if (fields.length === 0) {
    return <p className="text-xs text-fg-muted">该插件暂无应用级设置。</p>;
  }
  return (
    <div className="flex flex-col divide-y divide-line/50">
      {fields.map(([key, field]) => (
        <PluginFieldRow key={key} module={module} fieldKey={key} field={field} />
      ))}
    </div>
  );
}

function PluginFieldRow({
  module,
  fieldKey,
  field,
}: {
  module: ModuleContract;
  fieldKey: string;
  field: SettingFieldDef;
}) {
  const has = useSettingsStore(
    (s) => !!s.pluginSettings[module.id] && fieldKey in s.pluginSettings[module.id]!,
  );
  const value = useSettingsStore((s) => s.pluginSettings[module.id]?.[fieldKey]);
  const effective = value ?? field.default;
  const setValue = (v: unknown) =>
    useSettingsStore.getState().setPluginSetting(module.id, fieldKey, v);
  const reset = () => useSettingsStore.getState().clearPluginSetting(module.id, fieldKey);

  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[15px] text-fg-strong">
          {field.label}
          {has && (
            <span className="rounded border border-accent/30 bg-accent/10 px-1 text-[10px] text-accent">
              已覆盖
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[13px] text-fg-muted">
          出厂默认 {String(field.default)}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <FieldControl type={field.type} value={effective} onChange={setValue} field={field} />
        {has && (
          <Button variant="ghost" size="sm" onClick={reset}>
            恢复默认
          </Button>
        )}
      </div>
    </div>
  );
}

function FieldControl({
  type,
  value,
  onChange,
  field,
}: {
  type: SettingFieldDef["type"];
  value: unknown;
  onChange: (v: unknown) => void;
  field: SettingFieldDef;
}) {
  switch (type) {
    case "number":
      return (
        <SettingNumber
          value={Number(value)}
          onChange={(v) => onChange(v)}
          min={field.min}
          max={field.max}
          step={field.step}
        />
      );
    case "boolean":
      return <SettingToggle checked={!!value} onChange={(v) => onChange(v)} />;
    case "select":
      return (
        <SettingSelect
          value={String(value)}
          onChange={(v) => onChange(v)}
          options={field.options ?? []}
        />
      );
    case "color":
      return (
        <input
          type="color"
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 cursor-pointer rounded-lg border border-line bg-transparent p-0.5 outline-none"
        />
      );
    case "string":
    default:
      return (
        <Input
          className="min-w-40"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}
