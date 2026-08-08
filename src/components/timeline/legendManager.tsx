// 图例管理悬浮面板（工具栏「颜色管理」打开，居中显示在时间轴上方）：
// 按注释搜索、添加图例、修改图例注释、删除图例与批量删除。
// 「选择当前使用颜色」与颜色管理合并：默认点选图例行即设为当前使用颜色
// （新建标签 / 替换颜色时使用）；「选择删除」为按钮触发，进入后点选/滑过多选再批量删除。
// 多列网格展示；点选当前色时高亮对应行。

import { useEffect, useRef, useState } from "react";
import { Check, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useTimelineStore, DEFAULT_COLOR_LEGEND } from "@/stores/timelineStore";
import { useTimelineUiStore } from "@/stores/timelineUiStore";
import { cn } from "@/lib/cn";

export function LegendManager({
  instanceId,
  onClose,
}: {
  instanceId: string;
  onClose: () => void;
}) {
  const slice = useTimelineStore((s) => s.slices[instanceId]);
  const colorLegend = slice?.colorLegend ?? DEFAULT_COLOR_LEGEND;
  const addLegendEntry = useTimelineStore((s) => s.addLegendEntry);
  const renameLegendEntry = useTimelineStore((s) => s.renameLegendEntry);
  const deleteLegendEntry = useTimelineStore((s) => s.deleteLegendEntry);
  const record = useTimelineStore((s) => s.record);

  const currentColor =
    useTimelineUiStore((s) => s.currentColors[instanceId]) ??
    colorLegend[0]?.color ??
    DEFAULT_COLOR_LEGEND[0].color;
  const setCurrentColor = useTimelineUiStore((s) => s.setCurrentColor);

  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [newColor, setNewColor] = useState("#d7b25c");
  const [newLabel, setNewLabel] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  // 「选择删除」模式：按钮触发；进入后点选/滑过多选，退出时清空选择
  const [deleteMode, setDeleteMode] = useState(false);

  // —— 「选择删除」模式下左键按住滑过多选（可选中也可取消选中）——
  const toggleRow = (id: string) => {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const dragSelectRef = useRef(false);
  const lastToggleRef = useRef<string | null>(null);
  const deleteModeRef = useRef(deleteMode);
  deleteModeRef.current = deleteMode;

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragSelectRef.current) return;
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const id = el?.closest?.("[data-legend-row]")?.getAttribute("data-legend-row");
      if (id && id !== lastToggleRef.current) {
        lastToggleRef.current = id;
        toggleRow(id);
      }
    };
    const onUp = () => {
      dragSelectRef.current = false;
      lastToggleRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // toggleRow 只依赖稳定的 setSel，可安全一次性注册
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const query = q.trim().toLowerCase();
  const filtered = colorLegend.filter((l) => l.label.toLowerCase().includes(query));

  const onRowPointerDown = (e: React.PointerEvent, l: (typeof colorLegend)[number]) => {
    if (e.button !== 0 || e.pointerType !== "mouse") return;
    if ((e.target as HTMLElement).closest("button, input")) return;
    if (deleteModeRef.current) {
      // 删除模式：滑过选择
      dragSelectRef.current = true;
      lastToggleRef.current = l.id;
      toggleRow(l.id);
    } else {
      // 默认：点选设为当前使用颜色
      setCurrentColor(instanceId, l.color);
    }
  };

  const commitRename = () => {
    if (renamingId && draft.trim()) {
      record(instanceId);
      renameLegendEntry(instanceId, renamingId, draft);
    }
    setRenamingId(null);
  };

  const add = () => {
    if (!newLabel.trim()) return;
    record(instanceId);
    addLegendEntry(instanceId, newColor, newLabel);
    setNewLabel("");
    setAdding(false);
  };

  const enterDeleteMode = () => {
    setRenamingId(null);
    setSel(new Set());
    setDeleteMode(true);
  };
  const exitDeleteMode = () => {
    setRenamingId(null);
    setSel(new Set());
    setDeleteMode(false);
  };

  const selectAll = () => setSel(new Set(filtered.map((l) => l.id)));

  const batchDelete = () => {
    if (sel.size === 0) return;
    record(instanceId);
    sel.forEach((id) => deleteLegendEntry(instanceId, id));
    setSel(new Set());
  };

  return (
    <div
      data-overlay
      className="absolute left-1/2 top-2 z-40 flex max-h-[min(540px,82vh)] w-[min(680px,94vw)] -translate-x-1/2 select-none flex-col overflow-hidden rounded-xl border border-line/70 bg-app shadow-pop"
    >
      {/* 头部：标题 + 当前使用颜色 + 关闭 */}
      <div className="flex items-center justify-between border-b border-line/50 px-3.5 py-2">
        <span className="flex items-center gap-2 text-xs font-semibold tracking-wide text-fg">
          颜色管理
          <span className="flex items-center gap-1.5 rounded-md border border-line/70 bg-panel-2 px-1.5 py-0.5 text-[10px] font-normal text-fg-muted">
            <span className="size-2.5 rounded-full ring-1 ring-line" style={{ background: currentColor }} />
            当前使用
          </span>
        </span>
        <button
          onClick={onClose}
          title="关闭"
          className="flex h-6 w-6 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* 搜索 + 添加 / 选择删除 */}
      <div className="flex items-center gap-2 border-b border-line/50 p-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="按注释搜索图例…"
            className="h-7 w-full rounded-md border border-line/70 bg-app pl-8 pr-2 text-xs text-fg outline-none placeholder:text-fg-muted/50 focus:border-accent/40"
          />
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex shrink-0 items-center gap-1 rounded-md bg-accent-soft px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
        >
          <Plus className="size-3.5" /> 添加图例
        </button>
        <button
          title={deleteMode ? "退出选择删除" : "进入选择删除（点选/滑过多选后批量删除）"}
          onClick={deleteMode ? exitDeleteMode : enterDeleteMode}
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
            deleteMode
              ? "bg-danger/20 text-danger"
              : "text-fg-muted hover:bg-hover hover:text-fg",
          )}
        >
          <Trash2 className="size-3.5" /> 选择删除
        </button>
      </div>

      {/* 添加图例表单 */}
      {adding && (
        <div className="border-b border-line/50 p-2">
          <div className="flex items-center gap-2 rounded-lg border border-line/70 bg-app p-2">
            <label
              className="relative size-7 shrink-0 cursor-pointer overflow-hidden rounded-full ring-1 ring-line"
              title="选择颜色"
            >
              <span className="absolute inset-0 rounded-full" style={{ background: newColor }} />
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
            <input
              autoFocus
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") add();
                if (e.key === "Escape") setAdding(false);
              }}
              placeholder="注释名称…"
              className="h-6 min-w-0 flex-1 rounded-md border border-line/70 bg-app px-2 text-xs text-fg outline-none placeholder:text-fg-muted/50 focus:border-accent/40"
            />
            <button
              onClick={add}
              className="shrink-0 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              添加
            </button>
            <button
              onClick={() => setAdding(false)}
              className="shrink-0 rounded-md px-2 py-1 text-xs text-fg-muted transition-colors hover:bg-hover hover:text-fg"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 多列网格列表 */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {filtered.length === 0 && (
          <div className="px-2 py-6 text-center text-xs text-fg-muted">未找到匹配的图例</div>
        )}
        <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(215px, 1fr))" }}>
          {filtered.map((l) => {
            const isCurrent = l.color === currentColor;
            const inSel = sel.has(l.id);
            return (
              <div
                key={l.id}
                data-legend-row={l.id}
                onPointerDown={(e) => onRowPointerDown(e, l)}
                className={cn(
                  "group flex cursor-default items-center gap-1.5 rounded-lg border px-2 py-1.5 transition-colors",
                  deleteMode
                    ? inSel
                      ? "border-accent/40 bg-accent-soft"
                      : "border-transparent hover:bg-hover"
                    : isCurrent
                      ? "border-accent/40 bg-accent-soft"
                      : "border-transparent hover:bg-hover",
                )}
              >
                {deleteMode ? (
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                      inSel
                        ? "border-accent bg-accent text-white"
                        : "border-line-strong text-transparent",
                    )}
                  >
                    <Check className="size-3" />
                  </span>
                ) : (
                  <span
                    title={isCurrent ? "当前使用颜色" : "点选设为当前使用颜色"}
                    className={cn(
                      "size-2.5 shrink-0 rounded-full ring-1 ring-line transition-transform",
                      isCurrent && "ring-2 ring-accent",
                    )}
                    style={{ background: l.color, opacity: l.hidden ? 0.4 : 1 }}
                  />
                )}
                {renamingId === l.id ? (
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    className="h-6 min-w-0 flex-1 rounded border border-accent/40 bg-app px-1.5 text-xs text-fg outline-none"
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate px-1 text-left text-xs text-fg">
                    {l.label}
                  </span>
                )}
                {!deleteMode && (
                  <>
                    <button
                      title="编辑注释"
                      onClick={() => {
                        setDraft(l.label);
                        setRenamingId(l.id);
                      }}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-fg-muted/60 opacity-0 transition-all hover:bg-active hover:text-fg group-hover:opacity-100"
                    >
                      <Pencil className="size-3" />
                    </button>
                    <button
                      title="删除该图例"
                      onClick={() => {
                        record(instanceId);
                        deleteLegendEntry(instanceId, l.id);
                        setSel((prev) => {
                          const next = new Set(prev);
                          next.delete(l.id);
                          return next;
                        });
                      }}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-fg-muted/60 opacity-0 transition-all hover:bg-danger/15 hover:text-danger group-hover:opacity-100"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 选择删除底部操作条 */}
      {deleteMode && (
        <div className="flex items-center justify-between border-t border-line/50 px-3.5 py-2">
          <span className="flex items-center gap-2 text-xs text-fg-muted">
            <span>已选 {sel.size} 项</span>
            <button
              title={sel.size === filtered.length ? "取消全选" : "全选当前列表"}
              onClick={() =>
                sel.size === filtered.length ? setSel(new Set()) : selectAll()
              }
              className="rounded px-1.5 py-0.5 text-accent transition-colors hover:bg-accent/15"
            >
              {sel.size === filtered.length ? "取消全选" : "全选"}
            </button>
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={batchDelete}
              disabled={sel.size === 0}
              className="flex items-center gap-1 rounded-md bg-danger/15 px-2.5 py-1 text-xs text-danger transition-colors hover:bg-danger/25 disabled:pointer-events-none disabled:opacity-40"
            >
              <Trash2 className="size-3" /> 批量删除
            </button>
            <button
              onClick={exitDeleteMode}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-fg-muted transition-colors hover:bg-hover hover:text-fg"
            >
              <X className="size-3" /> 退出选择
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
