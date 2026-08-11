// 插件实例配置（右栏）：名称、侧边栏变体 + 实例级设置覆盖（级联第 ① 层，随工程落盘）。
// 实例级覆盖显示「自定义」徽标，可「恢复跟随插件」（clearInstanceOverride 回退到应用级/出厂默认）。

import { pluginRegistry } from "@/plugins/registry";
import { usePluginStore, type PluginInstance } from "@/stores/pluginStore";
import {
  useSettingsStore,
  isInstanceOverridable,
  resolveSetting,
} from "@/stores/settingsStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SettingNumber,
  SettingSelect,
  SettingToggle,
} from "@/components/settings/controls";
import type { SettingFieldDef } from "@/types/plugin";

/** 无实例覆盖时的稳定空对象（避免每次渲染产生新引用 → useSyncExternalStore 无限循环白屏） */
const EMPTY_OVERRIDES: Record<string, unknown> = {};

export function InstanceConfig({ instance }: { instance: PluginInstance }) {
  const updateInstance = usePluginStore((s) => s.updateInstance);
  const proto = pluginRegistry.getModule(instance.prototypeId);

  if (!proto) {
    return <p className="text-sm text-fg-muted">该实例的原型插件不可用。</p>;
  }

  const variantOptions = [
    { label: "不启用侧边栏", value: "" },
    ...(proto.views?.sidebars ?? []).map((s) => ({ label: s.title, value: s.id })),
  ];

  const overridable = Object.entries(proto.settings ?? {}).filter(
    ([key]) => isInstanceOverridable(proto.id, key),
  );

  return (
    <div className="flex flex-col gap-6">
      {/* ===== 实例信息 ===== */}
      <section>
        <h4 className="mb-2 text-[13px] font-semibold tracking-wide text-fg-muted">实例信息</h4>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-[13px] text-fg-muted">
            名称
            <Input
              value={instance.name}
              onChange={(e) => updateInstance(instance.id, { name: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] text-fg-muted">
            侧边栏变体
            <SettingSelect
              value={instance.sidebarViewId ?? ""}
              onChange={(v) => updateInstance(instance.id, { sidebarViewId: v || null })}
              options={variantOptions}
            />
          </label>
          <div className="flex items-center gap-2 font-mono text-[11px] text-fg-muted">
            <span>{instance.id}</span>
            <span className="rounded border border-line px-1">{proto.name}</span>
          </div>
        </div>
      </section>

      {/* ===== 实例级设置覆盖 ===== */}
      <section>
        <h4 className="mb-2 text-[13px] font-semibold tracking-wide text-fg-muted">
          实例级设置（覆盖应用级）
        </h4>
        <p className="mb-2 text-xs text-fg-muted/70">
          未覆盖时跟随插件应用级值（级联：实例 &gt; 应用级 &gt; 出厂默认）。
        </p>
        {overridable.length === 0 ? (
          <p className="text-[13px] text-fg-muted">该插件暂无实例级设置。</p>
        ) : (
          <div className="flex flex-col divide-y divide-line/50">
            {overridable.map(([key, field]) => (
              <OverrideRow key={key} instance={instance} fieldKey={key} field={field} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function OverrideRow({
  instance,
  fieldKey,
  field,
}: {
  instance: PluginInstance;
  fieldKey: string;
  field: SettingFieldDef;
}) {
  const map = useSettingsStore((s) => s.instanceSettings[instance.id]) ?? EMPTY_OVERRIDES;
  const hasOverride = fieldKey in map;
  // 订阅 instanceSettings；effective 落级联（未覆盖时取应用级/出厂默认）
  const effective =
    map[fieldKey] ?? resolveSetting(instance.prototypeId, instance.id, fieldKey);
  const setValue = (v: unknown) =>
    useSettingsStore.getState().setInstanceSetting(instance.id, fieldKey, v);
  const clear = () =>
    useSettingsStore.getState().clearInstanceOverride(instance.id, fieldKey);

  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[15px] text-fg-strong">
          {field.label}
          {hasOverride && (
            <span className="rounded border border-accent/30 bg-accent/10 px-1 text-[10px] text-accent">
              自定义
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[13px] text-fg-muted">出厂默认 {String(field.default)}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <FieldControl type={field.type} value={effective} onChange={setValue} field={field} />
        {hasOverride && (
          <Button variant="ghost" size="sm" onClick={clear}>
            恢复跟随插件
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
