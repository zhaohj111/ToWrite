// 通用取色面板：预设色 + 饱和度/明度方块 + 色相滑条 + 十六进制值。
// 样式参考时间轴取色器面板；onChange 随交互实时回调（由使用方决定何时落盘）。

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { hexToHsv, hsvToHex, PRESET_COLORS } from "@/lib/color";
import { cn } from "@/lib/cn";

export function ColorPickerPanel({
  value,
  onChange,
  onCommit,
  presets,
}: {
  value: string;
  onChange: (color: string) => void;
  /** 一次交互结束（松手/点选预设）时回调：由使用方落一次最终值（如只入一次撤销栈） */
  onCommit?: (color: string) => void;
  presets?: string[];
}) {
  const palette = presets ?? PRESET_COLORS;
  const { h, s, v } = hexToHsv(value);

  const setFromSV = (el: HTMLElement, e: React.PointerEvent) => {
    const rect = el.getBoundingClientRect();
    const x = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    const y = Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1);
    onChange(hsvToHex(h, x, 1 - y));
  };
  const setFromHue = (el: HTMLElement, e: React.PointerEvent) => {
    const rect = el.getBoundingClientRect();
    const t = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    onChange(hsvToHex(t * 360, s, v));
  };

  return (
    <div className="w-[236px] p-2">
      {/* 预设色：点选即一次提交（单次撤销步） */}
      <div className="grid grid-cols-5 gap-1.5">
        {palette.map((c) => (
          <button
            key={c}
            title={c}
            onClick={() => (onCommit ? onCommit(c) : onChange(c))}
            className={cn(
              "size-6 rounded-full ring-1 ring-line transition-transform hover:scale-110",
              value.toLowerCase() === c.toLowerCase() && "ring-2 ring-accent",
            )}
            style={{ background: c }}
          />
        ))}
      </div>

      {/* 饱和度/明度方块：拖动中只回调解的实时色，松手才提交最终值 */}
      <div
        className="relative mt-2 h-28 w-full cursor-crosshair touch-none overflow-hidden rounded-lg border border-line/70"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hsvToHex(h, 1, 1)})`,
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setFromSV(e.currentTarget, e);
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) setFromSV(e.currentTarget, e);
        }}
        onPointerUp={() => onCommit?.(value)}
      >
        <div
          className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%`, background: value }}
        />
      </div>

      {/* 色相滑条：拖动中只回调解的实时色，松手才提交最终值 */}
      <div
        className="relative mt-1.5 h-3 w-full cursor-pointer touch-none rounded-full border border-line/70"
        style={{ background: "linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setFromHue(e.currentTarget, e);
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) setFromHue(e.currentTarget, e);
        }}
        onPointerUp={() => onCommit?.(value)}
      >
        <div
          className="pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{ left: `${(h / 360) * 100}%`, background: hsvToHex(h, 1, 1) }}
        />
      </div>

      {/* 十六进制值 */}
      <div className="mt-1.5 flex items-center justify-between">
        <span className="font-mono text-[11px] tabular-nums text-fg-muted">{value}</span>
        <span className="text-[10px] text-fg-muted/60">直接拖动取色</span>
      </div>
    </div>
  );
}

/** 取色小色块：点击弹出 ColorPickerPanel（与应用其它取色器一致），点面板外关闭。
 *  不用全屏遮罩，避免挡住所在表单的提交按钮。 */
export function ColorSwatchPicker({
  value,
  onChange,
  title,
  size = "md",
}: {
  value: string;
  onChange: (color: string) => void;
  title?: string;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // 点面板外部任意处关闭（色块本身、面板内部点击不关闭）
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      if (panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  const rect = wrapRef.current?.getBoundingClientRect();
  const panelStyle = rect
    ? {
        left: Math.min(rect.left, window.innerWidth - 268),
        top: Math.min(rect.bottom + 4, window.innerHeight - 320),
      }
    : { left: 0, top: 0 };

  return (
    <>
      <span ref={wrapRef} className="inline-flex">
        <button
          type="button"
          title={title}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "shrink-0 cursor-pointer rounded-full ring-1 ring-line transition-transform hover:scale-105 active:scale-95",
            size === "sm" ? "size-6" : "size-7",
          )}
          style={{ background: value }}
        />
      </span>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-50 overflow-hidden rounded-xl border border-line/70 bg-app shadow-pop"
            style={panelStyle}
          >
            <ColorPickerPanel value={value} onChange={onChange} />
          </div>,
          document.body,
        )}
    </>
  );
}
