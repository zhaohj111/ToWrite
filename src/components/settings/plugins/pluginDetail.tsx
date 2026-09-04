// 已安装插件详情：头部（图标/名称/类型/启停/新增实例/管理实例）+ tab（详情/更新日志/配置）。
// core.config 不可启停；「管理实例」跳转到 插件 > 插件实例 页。

import { useEffect, useState } from "react";
import { ListPlus, Package, Settings2 } from "lucide-react";
import { pluginRegistry } from "@/plugins/registry";
import { useRegistryVersion } from "@/plugins/hooks";
import { usePluginStore } from "@/stores/pluginStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { keybindingRegistry, useKeybindingsVersion } from "@/lib/keybindings";
import type { ModuleContract } from "@/types/plugin";
import type { SettingsPageContribution } from "@/types/settings";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { SettingToggle } from "@/components/settings/controls";
import { SettingsItem } from "@/components/settings/settingsItem";
import { PluginSettingsPanel } from "@/components/settings/plugins/pluginSettingsPanel";
import { PluginShortcutsPanel } from "@/components/settings/plugins/pluginShortcutsPanel";
import { AddInstanceDialog } from "@/components/settings/plugins/addInstanceDialog";
import { useSettingsNav } from "@/components/settings/settingsNavContext";
import { useWorkspaceStore } from "@/stores/workspaceStore";

const KIND_LABEL: Record<ModuleContract["kind"], string> = {
  core: "应用核心",
  heavy: "重型模块",
  light: "轻量插件",
};

type Tab = "details" | "guide" | "changelog" | "config";

export function PluginDetail({ module }: { module: ModuleContract }) {
  useRegistryVersion();
  const { navigate } = useSettingsNav();
  const [tab, setTab] = useState<Tab>("details");
  const [adding, setAdding] = useState(false);

  // 外部「查看完整说明」定位：进入时切到本插件的「操作说明」tab（消费后清除）
  const pluginGuideTarget = useWorkspaceStore((s) => s.pluginGuideTarget);
  useEffect(() => {
    if (pluginGuideTarget !== module.id) return;
    setTab("guide");
    useWorkspaceStore.setState({ pluginGuideTarget: null });
  }, [pluginGuideTarget, module.id]);
  const isCore = module.kind === "core";
  const enabled = useSettingsStore((s) => s.prototypeEnabled[module.id] ?? true);
  const setEnabled = useSettingsStore((s) => s.setPrototypeEnabled);
  const instances = usePluginStore((s) => s.instances);
  const instanceCount = instances.filter((i) => i.prototypeId === module.id).length;
  const Icon = module.views?.activityBar?.icon ?? Package;

  return (
    <div className="flex h-full flex-col gap-4">
      {/* ===== 头部 ===== */}
      <div className="flex items-center gap-4 rounded-2xl border border-line/60 bg-panel-2/80 px-4 py-3.5">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent-soft">
          <Icon className="size-5 text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-display text-lg font-semibold text-fg-strong">
              {module.name}
            </h3>
            <KindBadge kind={module.kind} />
            <span className="rounded border border-line px-1 font-mono text-[11px] text-fg-muted">
              v{module.version ?? "—"}
            </span>
          </div>
          <p className="mt-0.5 truncate font-mono text-xs text-fg-muted">
            {module.id}
            {module.author ? ` · ${module.author}` : ""}
          </p>
        </div>
        {!isCore && (
          <SettingToggle
            checked={enabled}
            onChange={(v) => setEnabled(module.id, v)}
          />
        )}
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
            <ListPlus className="size-4" /> 新增实例
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate("plugin", "plugin.instances")}>
            <Settings2 className="size-4" /> 管理实例
          </Button>
        </div>
      </div>

      {/* ===== tab 切换 ===== */}
      <div className="flex gap-1 border-b border-line/60">
        {(
          [
            { id: "details", title: "详情" },
            { id: "guide", title: "操作说明" },
            { id: "changelog", title: "更新日志" },
            { id: "config", title: "配置" },
          ] as { id: Tab; title: string }[]
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "relative px-3 py-2 text-sm transition-colors",
              tab === t.id
                ? "text-accent"
                : "text-fg-muted hover:text-fg",
            )}
          >
            {t.title}
            {tab === t.id && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />
            )}
          </button>
        ))}
      </div>

      {/* ===== tab 内容 ===== */}
      <div className="hidden-scrollbar min-h-0 flex-1 overflow-y-auto pb-6">
        {tab === "details" && <DetailsTab module={module} instanceCount={instanceCount} />}
        {tab === "guide" && <GuideTab module={module} />}
        {tab === "changelog" && <ChangelogTab module={module} />}
        {tab === "config" && <ConfigTab module={module} />}
      </div>

      <AddInstanceDialog
        open={adding}
        onClose={() => setAdding(false)}
        presetPrototypeId={module.id}
      />
    </div>
  );
}

function KindBadge({ kind }: { kind: ModuleContract["kind"] }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded border px-1 text-[10px]",
        kind === "core"
          ? "border-accent/30 bg-accent/10 text-accent"
          : "border-line bg-panel-2 text-fg-muted",
      )}
    >
      {KIND_LABEL[kind]}
    </span>
  );
}

function DetailsTab({ module, instanceCount }: { module: ModuleContract; instanceCount: number }) {
  useKeybindingsVersion();
  const kbCount = keybindingRegistry.list(`plugin:${module.id}`).length;
  const settingsCount = Object.keys(module.settings ?? {}).length;
  const sb = module.views?.sidebars?.map((s) => s.title).join("、") ?? "无";
  return (
    <div className="flex max-w-3xl flex-col gap-3">
      <p className="text-[15px] leading-relaxed text-fg-muted">{module.description}</p>
      {/* 详情正文：宣传版 README（开发目的 / 作用简述） */}
      {module.readme && <Markdown source={module.readme} />}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
        <dt className="text-fg-muted">活动栏入口</dt>
        <dd className="text-fg">{module.views?.activityBar?.label ?? "无"}</dd>
        <dt className="text-fg-muted">侧边栏变体</dt>
        <dd className="text-fg">{sb}</dd>
        <dt className="text-fg-muted">主视图</dt>
        <dd className="text-fg">{module.views?.mainView?.title ?? "无"}</dd>
        <dt className="text-fg-muted">设置项</dt>
        <dd className="text-fg">{settingsCount}</dd>
        <dt className="text-fg-muted">快捷键</dt>
        <dd className="text-fg">{kbCount}</dd>
        <dt className="text-fg-muted">当前工程实例</dt>
        <dd className="text-fg">{instanceCount}</dd>
      </dl>
    </div>
  );
}

/** 操作说明 tab：插件 GUIDE.md（简明操作指引）全文 */
function GuideTab({ module }: { module: ModuleContract }) {
  if (module.guideMd) {
    return <Markdown source={module.guideMd} />;
  }
  return <p className="text-sm text-fg-muted">该插件暂无操作说明。</p>;
}

function ChangelogTab({ module }: { module: ModuleContract }) {
  if (module.changelogMd) {
    return <Markdown source={module.changelogMd} />;
  }
  const changelog = module.changelog;
  if (!changelog || changelog.length === 0) {
    return <p className="text-sm text-fg-muted">暂无更新日志。</p>;
  }
  return (
    <div className="flex max-w-2xl flex-col gap-5">
      {changelog.map((entry) => (
        <div key={entry.version}>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[15px] font-semibold text-accent">
              v{entry.version}
            </span>
            <span className="text-[13px] text-fg-muted">{entry.date}</span>
          </div>
          <ul className="mt-1.5 space-y-1 text-[13px] text-fg-muted">
            {entry.notes.map((n, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-accent/70">·</span>
                <span className="leading-relaxed">{n}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ConfigTab({ module }: { module: ModuleContract }) {
  // 方案 B：插件以 prototypeId 注册的自有设置页，只在本插件「配置」tab 内展示，不进下拉导航。
  // 页面可自定义布局组件（component），或按 items 自动渲染设置项；经设置页外层 SettingsNavContext 跳转。
  const ownPages = (
    pluginRegistry.getContributions("settings.pages") as SettingsPageContribution[]
  ).filter((p) => p.prototypeId === module.id);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {ownPages.map((page) => (
        <section key={page.id}>
          <h4 className="mb-1 text-[13px] font-semibold tracking-wide text-fg-muted">
            {page.title}
          </h4>
          <p className="mb-2 text-xs text-fg-muted/70">{page.path}</p>
          {page.component ? (
            <page.component />
          ) : (
            <div className="flex flex-col divide-y divide-line/50">
              {page.items.map((item) => (
                <SettingsItem key={item.id} item={item} />
              ))}
            </div>
          )}
        </section>
      ))}

      <section>
        <h4 className="mb-1 text-[13px] font-semibold tracking-wide text-fg-muted">
          设置（应用级默认）
        </h4>
        <p className="mb-2 text-xs text-fg-muted/70">
          应用级值会被工程内实例覆盖；实例级覆盖见「插件实例」页。
        </p>
        <PluginSettingsPanel module={module} />
      </section>
      <section>
        <h4 className="mb-2 text-[13px] font-semibold tracking-wide text-fg-muted">快捷键</h4>
        <PluginShortcutsPanel module={module} />
      </section>
    </div>
  );
}
