// 设置状态（core.config 后端）：级联配置的 ② 应用级插件设置 + ① 工程内实例覆盖 + 插件启停。
// 数据键：
//   config.json            → pluginSettings.<prototypeId>.<key>   （应用级，级联第 ② 层）
//   config.json            → pluginEnabled.<prototypeId>          （插件原型启停）
//   project-config.json    → ProjectConfig.instanceSettings.<instanceId>.<key> （实例覆盖，级联第 ① 层）
// 级联取值：实例覆盖 > 应用级插件设置 > manifest 出厂默认（ModuleContract.settings）
// 迁移：旧 editorFontSizes（project-config.json）读盘时转 instanceSettings.<id>.fontSize。

import { create } from "zustand";
import { getSetting, setSetting } from "@/lib/settings";
import { pluginRegistry } from "@/plugins/registry";
import type { ProjectData } from "@/types/writeproj";

/** 配置键前缀 */
const KEY_PLUGIN_SETTINGS = "pluginSettings";
const KEY_PLUGIN_ENABLED = "pluginEnabled";

interface SettingsState {
  /** 应用级插件设置：prototypeId -> key -> value（config.json） */
  pluginSettings: Record<string, Record<string, unknown>>;
  /** 工程内实例覆盖：instanceId -> key -> value（随 .writeproj 落盘） */
  instanceSettings: Record<string, Record<string, unknown>>;
  /** 插件原型启停：prototypeId -> enabled（config.json）；缺省视为启用 */
  prototypeEnabled: Record<string, boolean>;

  init: () => Promise<void>;
  /** 打开工程：读工程实例设置；迁移旧 editorFontSizes → instanceSettings.<id>.fontSize */
  loadProjectSettings: (data: ProjectData) => void;
  /** 关闭工程：清空实例覆盖（应用级设置保留） */
  reset: () => void;

  /** 应用级插件设置读写（级联第 ② 层） */
  getPluginSetting: (prototypeId: string, key: string) => unknown;
  setPluginSetting: (prototypeId: string, key: string, value: unknown) => void;
  hasPluginSetting: (prototypeId: string, key: string) => boolean;
  clearPluginSetting: (prototypeId: string, key: string) => void;

  /** 实例覆盖读写（级联第 ① 层，随工程落盘） */
  getInstanceSetting: (instanceId: string, key: string) => unknown;
  setInstanceSetting: (instanceId: string, key: string, value: unknown) => void;
  hasInstanceOverride: (instanceId: string, key: string) => boolean;
  clearInstanceOverride: (instanceId: string, key: string) => void;

  /** 删除实例时清除其全部实例覆盖（随 saveController 落盘同步丢弃） */
  removeInstanceSettings: (instanceId: string) => void;

  /** 插件原型启停 */
  setPrototypeEnabled: (prototypeId: string, enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  pluginSettings: {},
  instanceSettings: {},
  prototypeEnabled: {},

  init: async () => {
    const pluginSettings = await getSetting<Record<string, Record<string, unknown>>>(KEY_PLUGIN_SETTINGS, {});
    const prototypeEnabled = await getSetting<Record<string, boolean>>(KEY_PLUGIN_ENABLED, {});
    set({ pluginSettings, prototypeEnabled });
  },

  loadProjectSettings: (data) => {
    const instanceSettings: Record<string, Record<string, unknown>> = {};
    // 迁移：旧 editorFontSizes → instanceSettings.<id>.fontSize（仅当实例尚无 fontSize 覆盖时）
    const legacy = data.config?.editorFontSizes;
    const stored = data.config?.instanceSettings ?? {};
    for (const [instanceId, map] of Object.entries(stored)) {
      instanceSettings[instanceId] = { ...map };
    }
    if (legacy) {
      for (const [instanceId, size] of Object.entries(legacy)) {
        if (!instanceSettings[instanceId]?.fontSize) {
          instanceSettings[instanceId] = { ...instanceSettings[instanceId], fontSize: size };
        }
      }
    }
    set({ instanceSettings });
  },

  reset: () => set({ instanceSettings: {} }),

  getPluginSetting: (prototypeId, key) =>
    get().pluginSettings[prototypeId]?.[key] ?? undefined,
  hasPluginSetting: (prototypeId, key) =>
    !!get().pluginSettings[prototypeId] && key in get().pluginSettings[prototypeId]!,
  setPluginSetting: (prototypeId, key, value) => {
    const cur = get().pluginSettings[prototypeId] ?? {};
    const next = {
      ...get().pluginSettings,
      [prototypeId]: { ...cur, [key]: value },
    };
    set({ pluginSettings: next });
    void setSetting(KEY_PLUGIN_SETTINGS, next);
  },
  clearPluginSetting: (prototypeId, key) => {
    const map = get().pluginSettings[prototypeId];
    if (!map || !(key in map)) return;
    const rest = { ...map };
    delete rest[key];
    const next = { ...get().pluginSettings, [prototypeId]: rest };
    set({ pluginSettings: next });
    void setSetting(KEY_PLUGIN_SETTINGS, next);
  },

  getInstanceSetting: (instanceId, key) =>
    get().instanceSettings[instanceId]?.[key] ?? undefined,
  setInstanceSetting: (instanceId, key, value) => {
    const cur = get().instanceSettings[instanceId] ?? {};
    set({
      instanceSettings: {
        ...get().instanceSettings,
        [instanceId]: { ...cur, [key]: value },
      },
    });
    // saveController 已订阅 settingsStore → 防抖落盘到 project-config.json
  },
  hasInstanceOverride: (instanceId, key) =>
    !!get().instanceSettings[instanceId] && key in get().instanceSettings[instanceId]!,
  clearInstanceOverride: (instanceId, key) => {
    const map = get().instanceSettings[instanceId];
    if (!map || !(key in map)) return;
    const rest = { ...map };
    delete rest[key];
    set({
      instanceSettings: { ...get().instanceSettings, [instanceId]: rest },
    });
  },

  removeInstanceSettings: (instanceId) => {
    const { [instanceId]: _gone, ...instanceSettings } = get().instanceSettings;
    set({ instanceSettings });
    // saveController 已订阅 settingsStore → 防抖落盘到 project-config.json
  },

  setPrototypeEnabled: (prototypeId, enabled) => {
    const next = { ...get().prototypeEnabled, [prototypeId]: enabled };
    set({ prototypeEnabled: next });
    void setSetting(KEY_PLUGIN_ENABLED, next);
  },
}));

/** 级联取值：实例覆盖 > 应用级插件设置 > manifest 出厂默认 */
export function resolveSetting(
  prototypeId: string,
  instanceId: string,
  key: string,
): unknown {
  const st = useSettingsStore.getState();
  const inst = st.getInstanceSetting(instanceId, key);
  if (inst !== undefined) return inst;
  const app = st.getPluginSetting(prototypeId, key);
  if (app !== undefined) return app;
  const field = pluginRegistry.getModule(prototypeId)?.settings?.[key];
  return field?.default;
}

/** 是否可逐实例覆盖（由 manifest 声明；未知字段视为不可覆盖） */
export function isInstanceOverridable(prototypeId: string, key: string): boolean {
  return pluginRegistry.getModule(prototypeId)?.settings?.[key]?.instanceOverridable ?? false;
}
