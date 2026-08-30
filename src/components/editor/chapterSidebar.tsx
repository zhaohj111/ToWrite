// 章节侧边栏（core.editor）：分卷（文件夹）+ 章节树、切换、新建/重命名/删除。
// - 新建章节/分卷不再自动命名：列表原位插入输入框（光标闪烁），Enter 提交、Esc 取消、失焦提交，空名取消。
// - 拖拽用 pointer 事件手写实现（WebView2 下原生 HTML5 DnD 不可靠），VSCode 风格：
//   拖动章节/分卷时只显示目标位置的朱砂插入细线（行间 = 插到该处，卷行高亮 = 拖入该卷，卷内空白 = 追加卷末）。
// - 删除章节/分卷均弹确认框；分卷可选择「只删分卷（内容移至顶层）」或「连同全部内容删除」。

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEditorStore } from "@/stores/editorStore";
import { useEditorInstance, useEditorSlice, useSidebarLabel } from "@/components/editor/editorInstanceContext";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { cn } from "@/lib/cn";
import type { ChapterMeta } from "@/types/writeproj";

type Creating = { type: "chapter"; volumeId?: string } | { type: "volume" } | null;
type Editing = { kind: "chapter" | "volume"; id: string; title: string } | null;
type Confirm = { kind: "chapter"; id: string; title: string } | { kind: "volume"; id: string; title: string } | null;
/** group：分卷 id 或 ""（顶层）；beforeId 为 null 表示追加到该组末尾 */
type DropTarget = { kind: "chapter"; group: string; beforeId: string | null } | { kind: "volume"; beforeId: string | null } | null;

export function ChapterSidebar() {
  const instanceId = useEditorInstance();
  const { chapters, volumes, currentChapterId: currentId } = useEditorSlice();
  const setCurrentChapter = useEditorStore((s) => s.setCurrentChapter);
  const addChapter = useEditorStore((s) => s.addChapter);
  const renameChapter = useEditorStore((s) => s.renameChapter);
  const deleteChapter = useEditorStore((s) => s.deleteChapter);
  const addVolume = useEditorStore((s) => s.addVolume);
  const renameVolume = useEditorStore((s) => s.renameVolume);
  const deleteVolume = useEditorStore((s) => s.deleteVolume);
  const deleteVolumeWithContents = useEditorStore((s) => s.deleteVolumeWithContents);
  const moveVolume = useEditorStore((s) => s.moveVolume);
  const moveChapter = useEditorStore((s) => s.moveChapter);
  const project = useWorkspaceStore((s) => s.project);

  // 侧栏命名配置：文件名 / 文件夹名（可逐实例覆盖，级联生效）
  const fileLabel = useSidebarLabel("core.editor", "fileLabel");
  const folderLabel = useSidebarLabel("core.editor", "folderLabel");

  const [creating, setCreating] = useState<Creating>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<Editing>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [drag, setDrag] = useState<{ kind: "chapter" | "volume"; id: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const [query, setQuery] = useState("");

  // 章节按分卷分组；找不到所属分卷（或未分卷）的进顶层。
  const { byVolume, top } = useMemo(() => {
    const byVolume = new Map<string, ChapterMeta[]>();
    const top: ChapterMeta[] = [];
    for (const c of chapters) {
      const target = c.volumeId && volumes.some((v) => v.id === c.volumeId) ? byVolume : null;
      if (target) {
        const arr = target.get(c.volumeId!) ?? [];
        arr.push(c);
        target.set(c.volumeId!, arr);
      } else {
        top.push(c);
      }
    }
    const sortByOrder = (a: ChapterMeta, b: ChapterMeta) => a.order - b.order;
    for (const arr of byVolume.values()) arr.sort(sortByOrder);
    top.sort(sortByOrder);
    return { byVolume, top };
  }, [chapters, volumes]);

  // 搜索过滤：命中「未分卷」章节或某分卷内的章节；搜索时强制展开、只显示有命中的卷
  const q = query.trim().toLowerCase();
  const filtering = q.length > 0;
  const { byVolume: shownByVolume, top: shownTop } = useMemo(() => {
    if (!filtering) return { byVolume, top };
    const fbv = new Map<string, ChapterMeta[]>();
    const ftop: ChapterMeta[] = [];
    for (const c of chapters) {
      if (!c.title.toLowerCase().includes(q)) continue;
      const inVolume = !!c.volumeId && volumes.some((v) => v.id === c.volumeId);
      if (inVolume) {
        const arr = fbv.get(c.volumeId!) ?? [];
        arr.push(c);
        fbv.set(c.volumeId!, arr);
      } else {
        ftop.push(c);
      }
    }
    return { byVolume: fbv, top: ftop };
  }, [chapters, volumes, byVolume, top, filtering, q]);
  const displayVolumes = filtering ? volumes.filter((v) => shownByVolume.has(v.id)) : volumes;

  // —— 指针拖拽（不依赖 HTML5 DnD，WebView2 下稳定）——
  const pendingRef = useRef<{ kind: "chapter" | "volume"; id: string; x: number; y: number } | null>(null);
  const dragRef = useRef<{ kind: "chapter" | "volume"; id: string } | null>(null);
  const dropRef = useRef<DropTarget>(null);
  const suppressClickRef = useRef(false);
  // 拖拽期间数据保持不变，这里用 ref 让 window 监听器始终拿到最新分组数据
  const dataRef = useRef({ byVolume, top, volumes });
  dataRef.current = { byVolume, top, volumes };

  const startPointerDrag = (e: React.PointerEvent, kind: "chapter" | "volume", id: string) => {
    if (e.button !== 0 || e.pointerType !== "mouse") return;
    if (filtering) return; // 搜索过滤时禁用拖动，避免落点与完整树不一致
    if ((e.target as HTMLElement).closest("button, input, a")) return; // 按钮/输入框上不启动拖动
    suppressClickRef.current = false;
    pendingRef.current = { kind, id, x: e.clientX, y: e.clientY };
  };

  useEffect(() => {
    // 由指针位置换算插入目标：命中最靠近的 data-drop 元素。
    // 落点落在列表底部/行间距空白（无 data-drop）时，回退到「最近上方分组的末尾」：
    // 保证拖到最底部也有正确的追加指示线（此前该空白区无命中，指示线不显示）。
    const nearestGroupEndAbove = (y: number): HTMLElement | null => {
      let best: HTMLElement | null = null;
      let bestDist = Infinity;
      for (const n of document.querySelectorAll<HTMLElement>('[data-drop="group-end"]')) {
        const r = n.getBoundingClientRect();
        const dist = y - r.bottom;
        if (dist >= -1 && dist < bestDist) {
          bestDist = dist;
          best = n;
        }
      }
      return best;
    };

    const computeDrop = (x: number, y: number, d: { kind: string; id: string }): DropTarget => {
      const el = document.elementFromPoint(x, y);
      const target =
        (el?.closest?.("[data-drop]") as HTMLElement | null) ?? nearestGroupEndAbove(y);
      if (!target) return null;
      const { byVolume: bv, top: t, volumes: vs } = dataRef.current;
      const drop = target.dataset.drop;

      if (drop === "chapter") {
        const group = target.dataset.dropGroup ?? "";
        const id = target.dataset.dropId ?? "";
        const rect = target.getBoundingClientRect();
        if (y < rect.top + rect.height / 2) return { kind: "chapter", group, beforeId: id };
        const arr = group === "" ? t : bv.get(group) ?? [];
        const idx = arr.findIndex((c) => c.id === id);
        return { kind: "chapter", group, beforeId: idx >= 0 ? (arr[idx + 1]?.id ?? null) : null };
      }

      if (drop === "volume") {
        const id = target.dataset.dropId ?? "";
        if (d.kind === "chapter") return { kind: "chapter", group: id, beforeId: null }; // 追加到该分卷
        const rect = target.getBoundingClientRect();
        if (y < rect.top + rect.height / 2) return { kind: "volume", beforeId: id };
        const idx = vs.findIndex((v) => v.id === id);
        return { kind: "volume", beforeId: idx >= 0 ? (vs[idx + 1]?.id ?? null) : null };
      }

      if (drop === "group-end") {
        if (d.kind !== "chapter") return null;
        const group = target.dataset.dropGroup ?? "";
        // 光标不在任何行上（行间距/组末空白）：按 y 相对该组各行的上下半定边界——
        // 光标在某行上半 → 插到该行前；下半 → 插到其后；低于最后一行 → 追加组末。
        // 指示线落在光标附近，而不是跳到列表最底部（长列表下会被卷出视口、像被遮挡）。
        const rows = Array.from(
          target.querySelectorAll<HTMLElement>('[data-drop="chapter"]'),
        ).filter((r) => (r.dataset.dropGroup ?? "") === group);
        let before: string | null = null;
        for (const r of rows) {
          const rect = r.getBoundingClientRect();
          if (y < rect.top + rect.height / 2) {
            before = r.dataset.dropId ?? null;
            break;
          }
        }
        return { kind: "chapter", group, beforeId: before };
      }

      return null;
    };

    const onMove = (e: PointerEvent) => {
      const p = pendingRef.current;
      if (!p) return;
      if (!dragRef.current) {
        if ((e.clientX - p.x) ** 2 + (e.clientY - p.y) ** 2 < 16) return; // 4px 判定为点击
        dragRef.current = { kind: p.kind, id: p.id };
        setDrag(dragRef.current);
      }
      const d = dragRef.current;
      if (d) {
        const t = computeDrop(e.clientX, e.clientY, d);
        dropRef.current = t;
        setDropTarget(t);
      }
    };

    const onUp = () => {
      suppressClickRef.current = false;
      const d = dragRef.current;
      if (d) {
        const t = dropRef.current;
        if (t) {
          if (d.kind === "volume") {
            if (t.kind === "volume" && t.beforeId !== d.id) moveVolume(instanceId, d.id, t.beforeId);
          } else if (t.kind === "chapter" && t.beforeId !== d.id) {
            moveChapter(instanceId, d.id, {
              volumeId: t.group === "" ? undefined : t.group,
              beforeId: t.beforeId ?? undefined,
            });
          }
        }
        suppressClickRef.current = true; // 拖拽释放后吞掉这次 click，避免误选中/误折叠
        // 兜底：释放后没有紧跟 click（拖出列表释放）时不能滞留，否则下一次点击会被误吞（表现为「点了没切换」）
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 150);
      }
      pendingRef.current = null;
      dragRef.current = null;
      dropRef.current = null;
      setDrag(null);
      setDropTarget(null);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (dragRef.current || pendingRef.current)) {
        pendingRef.current = null;
        dragRef.current = null;
        dropRef.current = null;
        setDrag(null);
        setDropTarget(null);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [moveChapter, moveVolume, instanceId]);

  const isCollapsed = (id: string) => collapsed.has(id);
  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onSelectChapter = (id: string) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setCurrentChapter(instanceId, id);
  };

  const onToggleVolume = (id: string) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    toggleCollapse(id);
  };

  const startCreate = (c: NonNullable<Creating>) => {
    setEditing(null);
    setDraft("");
    setCreating(c);
  };

  const commitCreate = () => {
    if (!creating) return;
    const title = draft.trim();
    if (title) {
      if (creating.type === "volume") addVolume(instanceId, title);
      else addChapter(instanceId, title, creating.volumeId);
    }
    setCreating(null);
    setDraft("");
  };

  const startEdit = (kind: "chapter" | "volume", id: string, title: string) => {
    setCreating(null);
    setEditing({ kind, id, title });
  };

  const commitEdit = () => {
    if (!editing) return;
    const title = editing.title.trim();
    if (title) {
      if (editing.kind === "volume") renameVolume(instanceId, editing.id, title);
      else renameChapter(instanceId, editing.id, title);
    }
    setEditing(null);
  };

  // 章节行（分卷内与顶层共用）
  const renderChapter = (c: ChapterMeta) => {
    if (editing?.kind === "chapter" && editing.id === c.id) {
      return (
        <Input
          autoFocus
          value={editing.title}
          onChange={(e) => setEditing({ ...editing, title: e.target.value })}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit();
            if (e.key === "Escape") setEditing(null);
          }}
          className="h-7 text-xs"
        />
      );
    }
    const isBeforeHere =
      dropTarget?.kind === "chapter" &&
      dropTarget.group === (c.volumeId ?? "") &&
      dropTarget.beforeId === c.id;
    return (
      <>
        {isBeforeHere && <div className="absolute inset-x-1 -top-0.5 h-0.5 rounded-full bg-accent" />}
        <div
          data-drop="chapter"
          data-drop-id={c.id}
          data-drop-group={c.volumeId ?? ""}
          onPointerDown={(e) => startPointerDrag(e, "chapter", c.id)}
          onClick={() => onSelectChapter(c.id)}
          className={cn(
            "group flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-sm transition-all duration-150",
            c.id === currentId
              ? "border border-accent/25 border-l-[3px] border-l-accent bg-accent-soft text-fg-strong"
              : "border border-transparent text-fg hover:bg-hover",
            drag?.id === c.id && "opacity-40",
          )}
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            <FileText
              className={cn(
                "size-3.5 shrink-0",
                c.id === currentId ? "text-accent" : "text-fg-muted",
              )}
            />
            <span className="truncate">{c.title}</span>
          </span>
          <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              title={`重命名${fileLabel}`}
              onClick={(e) => {
                e.stopPropagation();
                startEdit("chapter", c.id, c.title);
              }}
              className="flex h-5 w-5 items-center justify-center rounded-md text-fg-muted hover:bg-active hover:text-fg"
            >
              <Pencil className="size-3" />
            </button>
            <button
              title={`删除${fileLabel}`}
              onClick={(e) => {
                e.stopPropagation();
                setConfirm({ kind: "chapter", id: c.id, title: c.title });
              }}
              className="flex h-5 w-5 items-center justify-center rounded-md text-fg-muted hover:bg-danger/15 hover:text-danger"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        </div>
      </>
    );
  };

  // 新建输入行（分卷/章节共用）：失焦提交、Enter 提交、Esc 取消
  const renderCreateInput = (placeholder: string) => (
    <Input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commitCreate}
      onKeyDown={(e) => {
        if (e.key === "Enter") commitCreate();
        if (e.key === "Escape") {
          setCreating(null);
          setDraft("");
        }
      }}
      placeholder={placeholder}
      className="h-7 text-xs"
    />
  );

  // 追加到某组末尾的插入细线（画在该组 ul 底部）
  const groupEndLine = (group: string) =>
    dropTarget?.kind === "chapter" && dropTarget.group === group && dropTarget.beforeId === null ? (
      <div className="absolute inset-x-1 -bottom-0.5 z-10 h-0.5 rounded-full bg-accent" />
    ) : null;

  return (
    <div className="p-2.5">
      {/* ===== 标题行：工程名 + 新建分卷 / 新建章节 ===== */}
      <div className="mb-2.5 flex items-center gap-1 px-1.5">
        <span className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-fg-strong">
          {project?.meta.name ?? "工程"}
        </span>
        <Button
          size="icon"
          variant="ghost"
          title={`新建${folderLabel}`}
          onClick={() => startCreate({ type: "volume" })}
        >
          <FolderPlus className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          title={`新建${fileLabel}`}
          onClick={() => startCreate({ type: "chapter" })}
        >
          <FilePlus2 className="size-4" />
        </Button>
      </div>

      {/* ===== 章节搜索栏（按章节名过滤） ===== */}
      <div className="mb-2.5 px-1.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`搜索${fileLabel}…`}
            className="h-7 pl-8 pr-8 text-xs !bg-app focus:!bg-app focus:border-accent/40 focus:outline-none focus:ring-0"
          />
          {query && (
            <button
              title="清空搜索"
              onClick={() => setQuery("")}
              className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <ul className="relative space-y-1" data-drop="group-end" data-drop-group="">
        {groupEndLine("")}

        {/* ===== 分卷（搜索时只显示有命中的卷，并强制展开） ===== */}
        {displayVolumes.map((v) => {
          const expanded = filtering || !isCollapsed(v.id);
          const children = shownByVolume.get(v.id) ?? [];
          return (
            <li key={v.id} className="relative">
              {dropTarget?.kind === "volume" && dropTarget.beforeId === v.id && (
                <div className="absolute inset-x-1 -top-0.5 z-10 h-0.5 rounded-full bg-accent" />
              )}
              {editing?.kind === "volume" && editing.id === v.id ? (
                <Input
                  autoFocus
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit();
                    if (e.key === "Escape") setEditing(null);
                  }}
                  className="h-7 text-xs"
                />
              ) : (
                <div
                  data-drop="volume"
                  data-drop-id={v.id}
                  onPointerDown={(e) => startPointerDrag(e, "volume", v.id)}
                  onClick={() => onToggleVolume(v.id)}
                  className={cn(
                    "group flex cursor-pointer items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-sm text-fg transition-all duration-150 hover:bg-hover",
                    drag?.id === v.id && "opacity-40",
                    dropTarget?.kind === "chapter" &&
                      dropTarget.group === v.id &&
                      dropTarget.beforeId === null &&
                      "bg-accent-soft ring-2 ring-accent/60",
                  )}
                >
                  {expanded ? (
                    <ChevronDown className="size-3.5 shrink-0 text-fg-muted" />
                  ) : (
                    <ChevronRight className="size-3.5 shrink-0 text-fg-muted" />
                  )}
                  {expanded ? (
                    <FolderOpen className="size-3.5 shrink-0 text-accent" />
                  ) : (
                    <Folder className="size-3.5 shrink-0 text-accent/70" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{v.title}</span>
                  <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      title={`在该${folderLabel}新建${fileLabel}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        startCreate({ type: "chapter", volumeId: v.id });
                      }}
                      className="flex h-5 w-5 items-center justify-center rounded-md text-fg-muted hover:bg-active hover:text-fg"
                    >
                      <Plus className="size-3" />
                    </button>
                    <button
                      title={`重命名${folderLabel}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit("volume", v.id, v.title);
                      }}
                      className="flex h-5 w-5 items-center justify-center rounded-md text-fg-muted hover:bg-active hover:text-fg"
                    >
                      <Pencil className="size-3" />
                    </button>
                    <button
                      title={`删除${folderLabel}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirm({ kind: "volume", id: v.id, title: v.title });
                      }}
                      className="flex h-5 w-5 items-center justify-center rounded-md text-fg-muted hover:bg-danger/15 hover:text-danger"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </div>
              )}

              {/* 卷内章节（折叠时隐藏；空白处拖入 = 追加卷末） */}
              {expanded && (
                <ul
                  className="relative ml-3.5 space-y-1 border-l border-line/60 pl-2 pt-0.5"
                  data-drop="group-end"
                  data-drop-group={v.id}
                >
                  {groupEndLine(v.id)}
                  {children.map((c) => (
                    <li key={c.id} className="relative">
                      {renderChapter(c)}
                    </li>
                  ))}
                  {creating?.type === "chapter" && creating.volumeId === v.id && (
                    <li>{renderCreateInput(`输入${fileLabel}名`)}</li>
                  )}
                </ul>
              )}
            </li>
          );
        })}

        {/* ===== 新建分卷输入（新卷追加在分卷组末尾，位于顶层章节之前） ===== */}
        {creating?.type === "volume" && (
          <li className="pt-0.5">{renderCreateInput(`输入${folderLabel}名`)}</li>
        )}

        {/* ===== 顶层未分卷章节 ===== */}
        {shownTop.length > 0 && displayVolumes.length > 0 && (
          <li className="px-2.5 pb-0.5 pt-2 text-[11px] font-semibold tracking-[0.14em] text-fg-muted">
            未{folderLabel}
          </li>
        )}
        {shownTop.map((c) => (
          <li key={c.id} className="relative">
            {renderChapter(c)}
          </li>
        ))}

        {/* ===== 新建章节输入（顶层） ===== */}
        {creating?.type === "chapter" && !creating.volumeId && (
          <li className="pt-0.5">{renderCreateInput(`输入${fileLabel}名`)}</li>
        )}

        {/* ===== 搜索无结果 ===== */}
        {filtering && shownTop.length === 0 && shownByVolume.size === 0 && (
          <li className="px-2.5 py-8 text-center text-xs text-fg-muted">
            未找到匹配「{query.trim()}」的{fileLabel}
          </li>
        )}
      </ul>

      {/* ===== 删除确认弹窗 ===== */}
      <Dialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          {confirm?.kind === "chapter" && (
            <>
              <DialogHeader>
                <DialogTitle>删除{fileLabel}</DialogTitle>
                <DialogDescription>
                  确定删除「{confirm.title}」？该{fileLabel}的正文将一并删除，且无法撤销。
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setConfirm(null)}>
                  取消
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    deleteChapter(instanceId, confirm.id);
                    setConfirm(null);
                  }}
                >
                  <Trash2 className="size-4" /> 删除
                </Button>
              </DialogFooter>
            </>
          )}
          {confirm?.kind === "volume" && (
            <>
              <DialogHeader>
                <DialogTitle>删除{folderLabel}</DialogTitle>
                <DialogDescription>
                  「{confirm.title}」共 {byVolume.get(confirm.id)?.length ?? 0} 个{fileLabel}。请选择删除方式：
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <button
                  className="flex w-full items-center gap-3 rounded-xl border border-line bg-panel-2 px-4 py-3 text-left transition-colors hover:border-accent/40 hover:bg-hover"
                  onClick={() => {
                    deleteVolume(instanceId, confirm.id);
                    setConfirm(null);
                  }}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-panel-3">
                    <Folder className="size-4 text-fg-muted" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-fg-strong">只删除{folderLabel}</span>
                    <span className="block text-xs text-fg-muted">
                      该{folderLabel}内{fileLabel}移到顶层（未{folderLabel}），正文保留
                    </span>
                  </span>
                </button>
                <button
                  className="flex w-full items-center gap-3 rounded-xl border border-danger/25 bg-danger/5 px-4 py-3 text-left transition-colors hover:border-danger/50 hover:bg-danger/10"
                  onClick={() => {
                    deleteVolumeWithContents(instanceId, confirm.id);
                    setConfirm(null);
                  }}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-danger/10">
                    <Trash2 className="size-4 text-danger" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-danger">同时删除所有内容</span>
                    <span className="block text-xs text-fg-muted">
                      删除{folderLabel}及其中的{fileLabel}正文，无法撤销
                    </span>
                  </span>
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
