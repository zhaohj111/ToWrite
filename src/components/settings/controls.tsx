// 设置项通用控件：下拉 / 开关 / 数字步进器（设置目录树与搜索结果共用一套外观）。

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";

export interface SelectOption {
  label: string;
  value: string;
}

/**
 * 自定义下拉（Radix）：完全替代原生 select——按钮 + 弹出列表均走主题样式，
 * 纸白底 / 黄褐悬停 / 朱砂选中一致生效；菜单经 settings-surface 覆盖纸白。
 */
export function SettingSelect({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  disabled?: boolean;
}) {
  const selected = options.find((o) => o.value === value);
  return (
    <div className="relative min-w-40 shrink-0">
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <button
            disabled={disabled}
            className={cn(
              "flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-line bg-panel-3 px-3 text-sm text-fg transition-all",
              "hover:border-line-strong hover:bg-hover",
              "focus:border-accent/40",
              "disabled:pointer-events-none disabled:opacity-40",
            )}
          >
            <span className="truncate">{selected?.label ?? "—"}</span>
            <ChevronDown className="size-4 shrink-0 text-fg-muted" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="settings-surface min-w-52">
          {options.map((o) => (
            <DropdownMenuItem
              key={o.value}
              disabled={o.value === value}
              onSelect={() => onChange(o.value)}
            >
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.value === value && <Check className="size-4 shrink-0 text-accent" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** 开关（role="switch"） */
export function SettingToggle({
  checked,
  onChange,
  disabled,
  title,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      title={title}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200",
        checked ? "bg-accent" : "bg-line-strong",
        disabled && "pointer-events-none opacity-40",
      )}
    >
      <span
        className={cn(
          "absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow transition-transform duration-200",
          checked && "translate-x-4",
        )}
      />
    </button>
  );
}

/** 数字输入（手动编辑 + 步进；min/max 夹取，按步长修整浮点精度） */
export function SettingNumber({
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  suffix?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  // 按步长精度修整（0.1 步进的浮点累积 → 0.30000000000000004 修整为 0.3）
  const stepDecimals = (String(step).split(".")[1] ?? "").length;
  const clamp = (v: number) =>
    Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const round = (v: number) => {
    const n = clamp(v);
    return stepDecimals === 0 ? Math.round(n) : parseFloat(n.toFixed(stepDecimals));
  };
  const commitDraft = () => {
    if (draft !== null) {
      const v = parseFloat(draft);
      if (Number.isFinite(v)) onChange(round(v));
    }
    setDraft(null);
  };
  const inputCls = "flex h-8 min-w-16 items-center justify-center rounded-lg border border-line bg-panel-3/70 px-2.5 font-mono text-[15px] text-fg tabular-nums focus:border-accent/40 focus:outline-none";
  return (
    <div className={cn("flex items-center gap-1.5", disabled && "opacity-40")}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(round(value - step))}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-fg-muted transition-colors hover:border-line-strong hover:bg-hover hover:text-fg focus:border-accent/40 disabled:pointer-events-none"
      >
        −
      </button>
      {draft === null ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setDraft(String(value))}
          title="点击输入"
          className={cn(inputCls, "hover:border-line-strong")}
        >
          {value}
          {suffix && <span className="ml-0.5 text-xs text-fg-muted">{suffix}</span>}
        </button>
      ) : (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitDraft();
            if (e.key === "Escape") setDraft(null);
          }}
          className={cn(inputCls, "w-20 text-center")}
        />
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(round(value + step))}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-fg-muted transition-colors hover:border-line-strong hover:bg-hover hover:text-fg focus:border-accent/40 disabled:pointer-events-none"
      >
        ＋
      </button>
    </div>
  );
}
