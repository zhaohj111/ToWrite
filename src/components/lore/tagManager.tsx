// 标签管理悬浮面板（工具栏「标签管理」打开，居中显示在设定库主区上方）：
// 按名称搜索、添加标签（名称+颜色）、修改名称、删除与批量删除。
// 多列网格展示；左键按住滑过选择器可快速多选（点按可单个切换）。
// 标签为实例级共享：删除标签会从全部卡片的 tags 中移除该引用。

import { useEffect, useRef, useState } from "react";
import { Check, Plus, Search, Trash2, X } from "lucide-react";
import { EMPTY_LORE_SLICE, useLoreStore } from "@/stores/loreStore";
import { ColorSwatchPicker } from "@/components/ui/colorPicker";
import { cn } from "@/lib/cn";

export function TagManager({
  instanceId,
  onClose,
}: {
  instanceId: string;
  onClose: () => void;
}) {
  const tags = useLoreStore((s) => s.slices[instanceId]?.tags ?? EMPTY_LORE_SLICE.tags);
  const addTag = useLoreStore((s) => s.addTag);
  const renameTag = useLoreStore((s) => s.renameTag);
  const deleteTag = useLoreStore((s) => s.deleteTag);

  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [newColor, setNewColor] = useState("#d7b25c");
  const [newName, setNewName] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  // —— 左键按住滑过选择器：滑过的条目逐一切换（可选中也可取消选中）——
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

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragSelectRef.current) return;
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const id = el?.closest?.("[data-tag-row]")?.getAttribute("data-tag-row");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const query = q.trim().toLowerCase();
  const filtered = tags.filter((t) => t.name.toLowerCase().includes(query));

  const onRowPointerDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0 || e.pointerType !== "mouse") return;
    if ((e.target as HTMLElement).closest("button, input")) return;
    dragSelectRef.current = true;
    lastToggleRef.current = id;
    toggleRow(id);
  };

  const commitRename = () => {
    if (renamingId && draft.trim()) renameTag(instanceId, renamingId, draft);
    setRenamingId(null);
  };

  const add = () => {
    if (!newName.trim()) return;
    addTag(instanceId, newName, newColor);
    setNewName("");
    setAdding(false);
  };

  const batchDelete = () => {
    if (sel.size === 0) return;
    sel.forEach((id) => deleteTag(instanceId, id));
    setSel(new Set());
  };

  return (
    <div
      data-overlay
      className="absolute left-1/2 top-0 z-40 -translate-x-1/2 flex max-h-[min(540px,82vh)] w-[min(680px,94vw)] select-none flex-col overflow-hidden rounded-xl border border-line/70 bg-app shadow-pop"
    >
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-line/50 px-3.5 py-2">
        <span className="text-xs font-semibold tracking-wide text-fg">标签管理</span>
        <button
          onClick={onClose}
          title="关闭"
          className="flex h-6 w-6 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* 搜索 + 添加入口 */}
      <div className="flex items-center gap-2 border-b border-line/50 p-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="按名称搜索标签…"
            className="h-7 w-full rounded-md border border-line/70 bg-app pl-8 pr-2 text-xs text-fg outline-none placeholder:text-fg-muted/50 focus:border-accent/40"
          />
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex shrink-0 items-center gap-1 rounded-md bg-accent-soft px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
        >
          <Plus className="size-3.5" /> 添加标签
        </button>
      </div>

      {/* 添加标签表单：色块点击弹出取色面板 */}
      {adding && (
        <div className="border-b border-line/50 p-2">
          <div className="flex items-center gap-2 rounded-lg border border-line/70 bg-app p-2">
            <ColorSwatchPicker value={newColor} onChange={setNewColor} title="选择颜色" />
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") add();
                if (e.key === "Escape") setAdding(false);
              }}
              placeholder="标签名称…"
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
          <div className="px-2 py-6 text-center text-xs text-fg-muted">未找到匹配的标签</div>
        )}
        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(215px, 1fr))" }}
        >
          {filtered.map((t) => (
            <div
              key={t.id}
              data-tag-row={t.id}
              onPointerDown={(e) => onRowPointerDown(e, t.id)}
              className={cn(
                "group flex cursor-default items-center gap-1.5 rounded-lg border px-2 py-1.5 transition-colors",
                sel.has(t.id)
                  ? "border-accent/40 bg-accent-soft"
                  : "border-transparent hover:bg-hover",
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                  sel.has(t.id)
                    ? "border-accent bg-accent text-white"
                    : "border-line-strong text-transparent",
                )}
              >
                <Check className="size-3" />
              </span>
              <span
                className="size-3 shrink-0 rounded-full ring-1 ring-line"
                style={{ background: t.color }}
              />
              {renamingId === t.id ? (
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
                <button
                  title="点击修改名称"
                  onClick={() => {
                    setDraft(t.name);
                    setRenamingId(t.id);
                  }}
                  className="min-w-0 flex-1 truncate rounded px-1 text-left text-xs text-fg transition-colors hover:bg-active"
                >
                  {t.name}
                </button>
              )}
              <button
                title="删除该标签（从全部设定移除引用）"
                onClick={() => {
                  deleteTag(instanceId, t.id);
                  setSel((prev) => {
                    const next = new Set(prev);
                    next.delete(t.id);
                    return next;
                  });
                }}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-fg-muted/60 opacity-0 transition-all hover:bg-danger/15 hover:text-danger group-hover:opacity-100"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 批量删除 */}
      {sel.size > 0 && (
        <div className="flex items-center justify-between border-t border-line/50 px-3.5 py-2">
          <span className="text-xs text-fg-muted">已选 {sel.size} 项 · 按住滑过可选中/取消</span>
          <button
            onClick={batchDelete}
            className="flex items-center gap-1 rounded-md bg-danger/15 px-2.5 py-1 text-xs text-danger transition-colors hover:bg-danger/25"
          >
            <Trash2 className="size-3" /> 批量删除
          </button>
        </div>
      )}
    </div>
  );
}
