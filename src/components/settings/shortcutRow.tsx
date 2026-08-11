// 快捷键行：作用域内改绑 / 恢复默认 / 冲突检测。
// 插件作用域（插件「配置」tab）与应用作用域（应用快捷键页）共用。
//
// 改绑录制规则：
//   1. 单个组合键需至少一个修饰键（Ctrl/Shift/Alt/Cmd），或为单个功能键（F1 等）；
//   2. 支持双键序列：先按第一个组合键并松开，800ms 内再按一个普通键即组成序列（如 Ctrl+A → V），
//      第二个键松开即确认；等待超时则只确认第一个组合键。
//   3. 修饰键按下只累计状态、不确认；等到实际按键抬起（keyup）才提交，
//      避免「只按 Ctrl/Shift 就立即确认」。

import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  keybindingRegistry,
  setRecordingActive,
  useKeybindingsVersion,
  type KeyBindingDef,
} from "@/lib/keybindings";
import { formatKeys } from "@/types/settings";

/** 第一个组合键松开后等待第二个键的窗口（ms）；超时则确认为单个组合键 */
const SECOND_CHORD_WINDOW = 800;

export function ShortcutRow({ def }: { def: KeyBindingDef }) {
  useKeybindingsVersion();
  const [recording, setRecording] = useState(false);
  const [pending, setPending] = useState<string | null>(null); // 当前正在录制的组合键预览
  const [firstChord, setFirstChord] = useState<string | null>(null); // 已记录的第一个组合键
  const [phase, setPhase] = useState<"capturing" | "awaitSecond">("capturing");

  const keys = keybindingRegistry.getEffectiveKeys(def.command);
  const hasOverride = keybindingRegistry.hasOverride(def.command);
  // 作用域内冲突（同作用域同键位）
  const scopeConflict = keybindingRegistry
    .conflicts(def.scope)
    .filter((c) => c.commands.includes(def.command));
  // 跨作用域撞键：插件行查应用壳命令；应用行查插件作用域（应用优先）
  const otherDefs =
    def.scope === "app"
      ? keybindingRegistry.list().filter((d) => d.scope !== "app")
      : keybindingRegistry.list("app");
  const otherHit = otherDefs.some((o) => o.keys.some((k) => keys.includes(k)));

  useEffect(() => {
    if (!recording) {
      setPending(null);
      setFirstChord(null);
      setPhase("capturing");
      setRecordingActive(false);
      return;
    }
    setRecordingActive(true);
    let mods: string[] = [];
    let base: string | null = null;
    let chords: string[] = [];
    let phaseLocal: "capturing" | "awaitSecond" = "capturing";
    let timer: ReturnType<typeof setTimeout> | null = null;

    const modsOf = (e: KeyboardEvent): string[] => {
      const m: string[] = [];
      if (e.ctrlKey || e.metaKey) m.push("mod");
      if (e.shiftKey) m.push("shift");
      if (e.altKey) m.push("alt");
      return m;
    };
    const isModifier = (k: string) =>
      k === "Control" || k === "Shift" || k === "Alt" || k === "Meta";
    const isFunctionKey = (k: string) => /^f(\d{1,2})$/.test(k.toLowerCase());
    // 第一个组合键：需修饰键或功能键（否则视为无效，如单独按字母）
    const chord0 = () =>
      base && (mods.length > 0 || isFunctionKey(base)) ? [...mods, base].join("+") : null;
    // 第二（及后续）组合键：允许纯普通键（如 Ctrl+A → V 里的 V）
    const chord = () => (base ? [...mods, base].join("+") : null);

    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
    const finish = () => {
      clearTimer();
      setRecording(false);
    };

    const onDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        finish();
        return;
      }
      if (e.repeat) return;
      if (isModifier(e.key)) {
        mods = modsOf(e);
        setPending(phaseLocal === "awaitSecond" ? chord() : chord0());
        return;
      }
      base = e.key.toLowerCase();
      mods = modsOf(e);
      // 第二个组合键开始：取消单键确认定时器
      if (phaseLocal === "awaitSecond") clearTimer();
      setPending(phaseLocal === "awaitSecond" ? chord() : chord0());
    };

    const onUp = (e: KeyboardEvent) => {
      if (!base || e.key.toLowerCase() !== base) return;
      if (phaseLocal === "capturing") {
        const c = chord0();
        if (!c) {
          base = null; // 无修饰键且非功能键：无效，等待重新按键
          setPending(null);
          return;
        }
        // 第一个组合键确定 → 进入等待第二个键；超时未按下则确认为单个组合键
        chords = [c];
        phaseLocal = "awaitSecond";
        setPhase("awaitSecond");
        setFirstChord(c);
        base = null;
        setPending(null);
        timer = setTimeout(() => {
          keybindingRegistry.setOverride(def.command, [c]);
          finish();
        }, SECOND_CHORD_WINDOW);
        return;
      }
      // 第二个组合键抬起 → 确认序列
      const c = chord();
      if (!c) {
        base = null;
        setPending(null);
        return;
      }
      chords[1] = c;
      const seq = chords.join(" ");
      keybindingRegistry.setOverride(def.command, [seq]);
      finish();
    };

    window.addEventListener("keydown", onDown, true);
    window.addEventListener("keyup", onUp, true);
    return () => {
      window.removeEventListener("keydown", onDown, true);
      window.removeEventListener("keyup", onUp, true);
      clearTimer();
    };
  }, [recording, def.command]);

  const conflict = scopeConflict.length > 0 || otherHit;

  const preview = () => {
    if (phase === "awaitSecond") {
      if (pending) {
        return (
          <span className="font-mono text-[13px] text-accent">
            已记录 {formatKeys([firstChord ?? ""])} → {formatKeys([pending])} 松开确认（Esc 取消）
          </span>
        );
      }
      return (
        <span className="font-mono text-[13px] text-accent">
          已记录 {formatKeys([firstChord ?? ""])}，再按一个键组成序列，否则等待确认单键
        </span>
      );
    }
    if (pending) {
      return (
        <span className="font-mono text-[13px] text-accent">
          {formatKeys([pending])} 松开确认（Esc 取消）
        </span>
      );
    }
    return <span className="font-mono text-[13px] text-accent">请按下组合键（Esc 取消）…</span>;
  };

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-line/60 bg-panel-3/30 px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[15px] text-fg">
          <KeyRound className="size-3.5 text-fg-muted" />
          <span className="truncate">{def.title}</span>
          {conflict && (
            <span className="shrink-0 rounded border border-danger/30 bg-danger/10 px-1 text-[10px] text-danger">
              {scopeConflict.length > 0
                ? "键位冲突"
                : def.scope === "app"
                  ? "与插件命令撞键"
                  : "与应用命令撞键"}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {recording ? (
          preview()
        ) : (
          <kbd className="font-mono text-[13px] text-fg-muted">{formatKeys(keys)}</kbd>
        )}
        {!recording && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPending(null);
                setFirstChord(null);
                setPhase("capturing");
                setRecording(true);
              }}
            >
              改绑
            </Button>
            {hasOverride && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => keybindingRegistry.resetOverride(def.command)}
              >
                恢复默认
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
