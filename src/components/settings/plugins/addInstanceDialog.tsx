// 新增插件实例对话框：选择原型（core 应用核心不可实例化）+ 名称 + 侧边栏变体。
// 被禁用原型（应用级启停关闭）的实例禁止新增。

import { useEffect, useState } from "react";
import { pluginRegistry } from "@/plugins/registry";
import { useRegistryVersion } from "@/plugins/hooks";
import { usePluginStore } from "@/stores/pluginStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingSelect, type SelectOption } from "@/components/settings/controls";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function AddInstanceDialog({
  open,
  onClose,
  presetPrototypeId,
}: {
  open: boolean;
  onClose: () => void;
  /** 由插件详情「新增实例」进入时预选该原型 */
  presetPrototypeId?: string;
}) {
  useRegistryVersion();
  const addInstance = usePluginStore((s) => s.addInstance);
  const prototypeEnabled = useSettingsStore((s) => s.prototypeEnabled);

  const modules = pluginRegistry
    .listModules()
    .filter((m) => m.kind !== "core");

  const [prototypeId, setPrototypeId] = useState("");
  const [name, setName] = useState("");
  const [sidebarViewId, setSidebarViewId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const first = modules.find((m) => m.id === presetPrototypeId) ?? modules[0];
    if (first) {
      setPrototypeId(first.id);
      setName(first.name);
      setSidebarViewId(first.views?.sidebars?.[0]?.id ?? null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const proto = modules.find((m) => m.id === prototypeId) ?? null;
  const protoDisabled = !!proto && prototypeEnabled[proto.id] === false;

  const variantOptions: SelectOption[] = [
    { label: "不启用侧边栏", value: "" },
    ...(proto?.views?.sidebars ?? []).map((s) => ({ label: s.title, value: s.id })),
  ];

  const protoOptions: SelectOption[] = modules.map((m) => ({
    label: prototypeEnabled[m.id] === false ? `${m.name}（已禁用）` : m.name,
    value: m.id,
  }));

  const submit = () => {
    if (!proto || protoDisabled) return;
    addInstance({
      prototypeId: proto.id,
      name,
      sidebarViewId: sidebarViewId || null,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="settings-surface">
        <DialogHeader>
          <DialogTitle>新增插件实例</DialogTitle>
          <DialogDescription>
            为插件创建一个新实例（独立的文档与视图）。core.config 为应用核心，不可实例化。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-xs text-fg-muted">
            插件原型
            <SettingSelect
              value={prototypeId}
              onChange={(v) => {
                const m = modules.find((x) => x.id === v);
                setPrototypeId(v);
                if (m) {
                  setName(m.name);
                  setSidebarViewId(m.views?.sidebars?.[0]?.id ?? null);
                }
              }}
              options={protoOptions}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-fg-muted">
            实例名称
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如「正文」「大纲」"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-fg-muted">
            侧边栏变体
            <SettingSelect
              value={sidebarViewId ?? ""}
              onChange={(v) => setSidebarViewId(v || null)}
              options={variantOptions}
            />
          </label>
          {protoDisabled && (
            <p className="text-xs text-danger">
              该插件原型已在应用级禁用，请先在「已安装插件」页启用后再新增实例。
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={submit} disabled={!proto || protoDisabled}>
            创建实例
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
