// 快捷键注册表：默认键位 + 覆盖表 + 作用域分层 + 冲突检测。
// 作用域：app（应用壳命令，由 App 挂载的 window keydown 监听真实派发）
//        plugin:<prototypeId>（插件作用域，展示/冲突检测用；v0.8 编辑器贡献点落地后接注册表派发）。
// 覆盖持久化：config.json → keybindings（command -> keys[]）。
// 冲突规则：同作用域同键位 → 冲突标记（list 时由调用方标红）；app 作用域优先于插件作用域。

import { useSyncExternalStore } from "react";
import { getSetting, setSetting } from "@/lib/settings";

export interface KeyBindingDef {
  command: string;
  title: string;
  /** 键位，如 ["mod+r"]；override 后由 getEffectiveKeys 返回覆盖值 */
  keys: string[];
  scope: "app" | `plugin:${string}`;
  /** 生效条件（预留，v0.8 编辑器贡献点接线后使用） */
  when?: string;
}

const KEY_OVERRIDES = "keybindings";

type Listener = () => void;

// 改绑录制期间全局标志：录制快捷键时 App 的应用级命令派发监听会跳过，
// 避免「重绑 mod+r 时直接触发了刷新」之类的问题。
let recordingActive = 0;
export function setRecordingActive(on: boolean): void {
  recordingActive = on ? recordingActive + 1 : Math.max(0, recordingActive - 1);
}
export function isRecordingActive(): boolean {
  return recordingActive > 0;
}

class KeybindingRegistry {
  private defaults: KeyBindingDef[] = [];
  private overrides: Record<string, string[]> = {};
  private version = 0;
  private listeners = new Set<Listener>();

  register(defs: KeyBindingDef[]): void {
    // 按命令去重（dev/HMR 下模块可能重复注册，避免配置页显示重复条目）
    const existing = new Set(this.defaults.map((d) => d.command));
    this.defaults.push(...defs.filter((d) => !existing.has(d.command)));
    this.emit();
  }

  async init(): Promise<void> {
    const saved = await getSetting<Record<string, string[]>>(KEY_OVERRIDES, {});
    this.overrides = saved && typeof saved === "object" ? saved : {};
    this.emit();
  }

  /** 列出作用域内的键位（合并覆盖后）；scope 缺省 = 全部 */
  list(scope?: string): KeyBindingDef[] {
    return this.defaults
      .filter((d) => !scope || d.scope === scope)
      .map((d) => ({ ...d, keys: this.getEffectiveKeys(d.command) }));
  }

  getDef(command: string): KeyBindingDef | undefined {
    return this.defaults.find((d) => d.command === command);
  }

  /** 取生效键位：覆盖表优先，其次默认键位 */
  getEffectiveKeys(command: string): string[] {
    const ov = this.overrides[command];
    if (ov) return ov;
    return this.getDef(command)?.keys ?? [];
  }

  setOverride(command: string, keys: string[]): void {
    this.overrides = { ...this.overrides, [command]: keys };
    void setSetting(KEY_OVERRIDES, this.overrides);
    this.emit();
  }

  resetOverride(command: string): void {
    if (!(command in this.overrides)) return;
    const next = { ...this.overrides };
    delete next[command];
    this.overrides = next;
    void setSetting(KEY_OVERRIDES, this.overrides);
    this.emit();
  }

  hasOverride(command: string): boolean {
    return command in this.overrides;
  }

  /** 同作用域内同键位冲突：返回冲突对（取作用域内 list 的生效键位判断） */
  conflicts(scope: string): Array<{ commands: string[]; keys: string[] }> {
    const byKey = new Map<string, string[]>();
    for (const d of this.list(scope)) {
      for (const k of d.keys) {
        const list = byKey.get(k) ?? [];
        list.push(d.command);
        byKey.set(k, list);
      }
    }
    const out: Array<{ commands: string[]; keys: string[] }> = [];
    for (const [keys, commands] of byKey) {
      if (commands.length > 1) out.push({ commands, keys: [keys] });
    }
    return out;
  }

  getVersion(): number {
    return this.version;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }
}

export const keybindingRegistry = new KeybindingRegistry();

/** 单个组合键串（如 "mod+r"、"f1"）与键盘事件匹配；不跨组合键（应用壳/插件画布共用） */
export function matchChord(e: KeyboardEvent, chord: string): boolean {
  const parts = chord.toLowerCase().split("+");
  const hasMod = parts.includes("mod");
  const hasShift = parts.includes("shift");
  const hasAlt = parts.includes("alt");
  const k = parts[parts.length - 1];
  const mod = e.ctrlKey || e.metaKey;
  const shift = e.shiftKey;
  const alt = e.altKey;
  if (mod !== hasMod || alt !== hasAlt) return false;
  // 字符键允许 shift 差异：键位 "+"（shift+=）与 "-"（=）等按主键盘字符匹配
  if (shift !== hasShift) {
    if (!(k.length === 1 && !/[a-z0-9]/i.test(k) && e.key === k)) return false;
  }
  return e.key.toLowerCase() === k;
}

/** 命中某命令的任一单组合键（空格分隔的双键序列不在此处理） */
export function commandMatches(e: KeyboardEvent, def: { keys: string[] } | undefined): boolean {
  if (!def) return false;
  return def.keys.some((k) => !k.includes(" ") && matchChord(e, k));
}

/** React 订阅：注册表版本变化（覆盖/新增键位）时重渲染 */
export function useKeybindingsVersion(): number {
  return useSyncExternalStore(
    (cb) => keybindingRegistry.subscribe(cb),
    () => keybindingRegistry.getVersion(),
  );
}

/** 应用壳默认键位（app 作用域）：由 App 挂载时注册一次 */
export function registerAppKeybindings(): void {
  keybindingRegistry.register([
    { command: "app.reload", title: "重新加载界面", keys: ["mod+r"], scope: "app" },
    { command: "app.cycleZoom", title: "循环界面缩放", keys: ["mod+s"], scope: "app" },
    { command: "app.toggleTheme", title: "切换深色 / 浅色", keys: ["mod+shift+t"], scope: "app" },
    { command: "app.openSettings", title: "打开设置", keys: ["mod+,"], scope: "app" },
    { command: "app.backToStart", title: "回到开始页", keys: ["mod+shift+h"], scope: "app" },
  ]);
}

/** 核心插件默认键位（plugin:<prototypeId> 作用域）：展示/冲突检测用。
    实际编辑按键仍由 TipTap 原生 keymap 处理（v0.8 编辑器贡献点落地后再接注册表派发）。 */
export function registerPluginKeybindings(): void {
  keybindingRegistry.register([
    { command: "editor.undo", title: "撤销", keys: ["mod+z"], scope: "plugin:core.editor" },
    { command: "editor.redo", title: "重做", keys: ["mod+shift+z"], scope: "plugin:core.editor" },
    { command: "editor.bold", title: "加粗", keys: ["mod+b"], scope: "plugin:core.editor" },
    { command: "editor.italic", title: "斜体", keys: ["mod+i"], scope: "plugin:core.editor" },
    { command: "editor.strike", title: "删除线", keys: ["mod+shift+x"], scope: "plugin:core.editor" },
    { command: "editor.heading1", title: "标题 1", keys: ["mod+alt+1"], scope: "plugin:core.editor" },
    { command: "editor.heading2", title: "标题 2", keys: ["mod+alt+2"], scope: "plugin:core.editor" },
    { command: "editor.heading3", title: "标题 3", keys: ["mod+alt+3"], scope: "plugin:core.editor" },
    { command: "editor.bulletList", title: "无序列表", keys: ["mod+alt+4"], scope: "plugin:core.editor" },
    { command: "editor.orderedList", title: "有序列表", keys: ["mod+alt+5"], scope: "plugin:core.editor" },
    // 时间轴（plugin 作用域：展示/冲突检测由配置页处理，实际派发在 TimelineCanvas/TimelinePane 内）
    { command: "timeline.selectAll", title: "全选标签", keys: ["mod+a"], scope: "plugin:core.timeline" },
    { command: "timeline.toggleLegend", title: "图例显示切换", keys: ["mod+l"], scope: "plugin:core.timeline" },
    { command: "timeline.fit", title: "概览（适应全部标签）", keys: ["f"], scope: "plugin:core.timeline" },
    { command: "timeline.zoomIn", title: "放大", keys: ["="], scope: "plugin:core.timeline" },
    { command: "timeline.zoomOut", title: "缩小", keys: ["-"], scope: "plugin:core.timeline" },
    { command: "timeline.undo", title: "撤销", keys: ["mod+z"], scope: "plugin:core.timeline" },
    { command: "timeline.redo", title: "重做", keys: ["mod+shift+z"], scope: "plugin:core.timeline" },
    // 设定库（连接视图快捷键在 LoreGraphRoot 派发；全局在 LorePane 派发）
    { command: "lore.selectAll", title: "全选卡片（连接图）", keys: ["mod+a"], scope: "plugin:core.lore" },
    { command: "lore.zoomIn", title: "放大（连接图）", keys: ["="], scope: "plugin:core.lore" },
    { command: "lore.zoomOut", title: "缩小（连接图）", keys: ["-"], scope: "plugin:core.lore" },
    { command: "lore.fit", title: "概览（连接图）", keys: ["f"], scope: "plugin:core.lore" },
    { command: "lore.undo", title: "撤销", keys: ["mod+z"], scope: "plugin:core.lore" },
    { command: "lore.redo", title: "重做", keys: ["mod+shift+z"], scope: "plugin:core.lore" },
    { command: "lore.toggleLayout", title: "视图切换（网格/连接图）", keys: ["mod+shift+v"], scope: "plugin:core.lore" },
  ]);
}

// 模块级注册（幂等：register 按命令去重）：dev/HMR 重载本模块会重建注册表单例，
// 在此直接注册保证任何重载后默认键位仍在（配置页、快捷键派发始终可取到）。
registerAppKeybindings();
registerPluginKeybindings();
