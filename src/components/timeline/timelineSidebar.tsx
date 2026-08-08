// 时间轴侧边栏（core.timeline）：分卷（文件夹）+ 时间轴文件树、切换、新建/重命名/删除。
// 交互与章节侧边栏一致：原位输入命名、指针拖拽（VSCode 插入细线）、删除确认弹窗。

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarRange,
  ChevronDown,
  ChevronRight,
  FilePlus2,
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
import { useTimelineStore } from "@/stores/timelineStore";
import { useInstanceId, useTimelineSlice } from "@/components/editor/editorInstanceContext";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { cn } from "@/lib/cn";
import type { TimelineFileMeta } from "@/types/writeproj";

type Creating = { type: "file"; folderId?: string } | { type: "folder" } | null;
type Editing = { kind: "file" | "folder"; id: string; title: string } | null;
type Confirm =
  | { kind: "file"; id: string; title: string }
  | { kind: "folder"; id: string; title: string }
  | null;
type DropTarget =
  | { kind: "file"; group: string; beforeId: string | null }
  | { kind: "folder"; beforeId: string | null }
  | null;

export function TimelineSidebar() {
  const instanceId = useInstanceId();
  const { folders, files, currentFileId: currentId } = useTimelineSlice();
  const setCurrentFile = useTimelineStore((s) => s.setCurrentFile);
  const addFile = useTimelineStore((s) => s.addFile);
  const renameFile = useTimelineStore((s) => s.renameFile);
  const deleteFile = useTimelineStore((s) => s.deleteFile);
  const addFolder = useTimelineStore((s) => s.addFolder);
  const renameFolder = useTimelineStore((s) => s.renameFolder);
  const deleteFolder = useTimelineStore((s) => s.deleteFolder);
  const deleteFolderWithContents = useTimelineStore((s) => s.deleteFolderWithContents);
  const moveFolder = useTimelineStore((s) => s.moveFolder);
  const moveFile = useTimelineStore((s) => s.moveFile);
  const project = useWorkspaceStore((s) => s.project);

  const [creating, setCreating] = useState<Creating>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<Editing>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [drag, setDrag] = useState<{ kind: "file" | "folder"; id: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const [query, setQuery] = useState("");

  // 文件按分卷分组；找不到所属分卷（或未分卷）的进顶层。
  const { byFolder, top } = useMemo(() => {
    const byFolder = new Map<string, TimelineFileMeta[]>();
    const top: TimelineFileMeta[] = [];
    for (const f of files) {
      const target = f.folderId && folders.some((v) => v.id === f.folderId) ? byFolder : null;
      if (target) {
        const arr = target.get(f.folderId!) ?? [];
        arr.push(f);
        target.set(f.folderId!, arr);
      } else {
        top.push(f);
      }
    }
    const sortByOrder = (a: TimelineFileMeta, b: TimelineFileMeta) => a.order - b.order;
    for (const arr of byFolder.values()) arr.sort(sortByOrder);
    top.sort(sortByOrder);
    return { byFolder, top };
  }, [files, folders]);

  // 搜索过滤
  const q = query.trim().toLowerCase();
  const filtering = q.length > 0;
  const { byFolder: shownByFolder, top: shownTop } = useMemo(() => {
    if (!filtering) return { byFolder, top };
    const fbf = new Map<string, TimelineFileMeta[]>();
    const ftop: TimelineFileMeta[] = [];
    for (const f of files) {
      if (!f.title.toLowerCase().includes(q)) continue;
      const inFolder = !!f.folderId && folders.some((v) => v.id === f.folderId);
      if (inFolder) {
        const arr = fbf.get(f.folderId!) ?? [];
        arr.push(f);
        fbf.set(f.folderId!, arr);
      } else {
        ftop.push(f);
      }
    }
    return { byFolder: fbf, top: ftop };
  }, [files, folders, byFolder, top, filtering, q]);
  const displayFolders = filtering ? folders.filter((v) => shownByFolder.has(v.id)) : folders;

  // —— 指针拖拽（不依赖 HTML5 DnD）——
  const pendingRef = useRef<{ kind: "file" | "folder"; id: string; x: number; y: number } | null>(null);
  const dragRef = useRef<{ kind: "file" | "folder"; id: string } | null>(null);
  const dropRef = useRef<DropTarget>(null);
  const suppressClickRef = useRef(false);
  const dataRef = useRef({ byFolder, top, folders });
  dataRef.current = { byFolder, top, folders };

  const startPointerDrag = (e: React.PointerEvent, kind: "file" | "folder", id: string) => {
    if (e.button !== 0 || e.pointerType !== "mouse") return;
    if (filtering) return;
    if ((e.target as HTMLElement).closest("button, input, a")) return;
    suppressClickRef.current = false;
    pendingRef.current = { kind, id, x: e.clientX, y: e.clientY };
  };

  useEffect(() => {
    const computeDrop = (x: number, y: number, d: { kind: string; id: string }): DropTarget => {
      const el = document.elementFromPoint(x, y);
      const target = el?.closest?.("[data-drop]") as HTMLElement | null;
      if (!target) return null;
      const { byFolder: bf, top: t, folders: fs } = dataRef.current;
      const drop = target.dataset.drop;

      if (drop === "file") {
        const group = target.dataset.dropGroup ?? "";
        const id = target.dataset.dropId ?? "";
        const rect = target.getBoundingClientRect();
        if (y < rect.top + rect.height / 2) return { kind: "file", group, beforeId: id };
        const arr = group === "" ? t : bf.get(group) ?? [];
        const idx = arr.findIndex((c) => c.id === id);
        return { kind: "file", group, beforeId: idx >= 0 ? (arr[idx + 1]?.id ?? null) : null };
      }

      if (drop === "folder") {
        const id = target.dataset.dropId ?? "";
        if (d.kind === "file") return { kind: "file", group: id, beforeId: null }; // 追加到该分卷
        const rect = target.getBoundingClientRect();
        if (y < rect.top + rect.height / 2) return { kind: "folder", beforeId: id };
        const idx = fs.findIndex((v) => v.id === id);
        return { kind: "folder", beforeId: idx >= 0 ? (fs[idx + 1]?.id ?? null) : null };
      }

      if (drop === "group-end") {
        if (d.kind !== "file") return null;
        return { kind: "file", group: target.dataset.dropGroup ?? "", beforeId: null };
      }

      return null;
    };

    const onMove = (e: PointerEvent) => {
      const p = pendingRef.current;
      if (!p) return;
      if (!dragRef.current) {
        if ((e.clientX - p.x) ** 2 + (e.clientY - p.y) ** 2 < 16) return;
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
          if (d.kind === "folder") {
            if (t.kind === "folder" && t.beforeId !== d.id) moveFolder(instanceId, d.id, t.beforeId);
          } else if (t.kind === "file" && t.beforeId !== d.id) {
            moveFile(instanceId, d.id, {
              folderId: t.group === "" ? undefined : t.group,
              beforeId: t.beforeId ?? undefined,
            });
          }
        }
        suppressClickRef.current = true;
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
  }, [moveFile, moveFolder, instanceId]);

  const isCollapsed = (id: string) => collapsed.has(id);
  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onSelectFile = (id: string) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setCurrentFile(instanceId, id);
  };

  const onToggleFolder = (id: string) => {
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
      if (creating.type === "folder") addFolder(instanceId, title);
      else addFile(instanceId, title, creating.folderId);
    }
    setCreating(null);
    setDraft("");
  };

  const startEdit = (kind: "file" | "folder", id: string, title: string) => {
    setCreating(null);
    setEditing({ kind, id, title });
  };

  const commitEdit = () => {
    if (!editing) return;
    const title = editing.title.trim();
    if (title) {
      if (editing.kind === "folder") renameFolder(instanceId, editing.id, title);
      else renameFile(instanceId, editing.id, title);
    }
    setEditing(null);
  };

  const renderFile = (f: TimelineFileMeta) => {
    if (editing?.kind === "file" && editing.id === f.id) {
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
      dropTarget?.kind === "file" &&
      dropTarget.group === (f.folderId ?? "") &&
      dropTarget.beforeId === f.id;
    return (
      <>
        {isBeforeHere && <div className="absolute inset-x-1 -top-0.5 h-0.5 rounded-full bg-accent" />}
        <div
          data-drop="file"
          data-drop-id={f.id}
          data-drop-group={f.folderId ?? ""}
          onPointerDown={(e) => startPointerDrag(e, "file", f.id)}
          onClick={() => onSelectFile(f.id)}
          className={cn(
            "group flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-sm transition-all duration-150",
            f.id === currentId
              ? "border border-accent/25 border-l-[3px] border-l-accent bg-accent-soft text-fg-strong"
              : "border border-transparent text-fg hover:bg-hover",
            drag?.id === f.id && "opacity-40",
          )}
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            <CalendarRange
              className={cn(
                "size-3.5 shrink-0",
                f.id === currentId ? "text-accent" : "text-fg-muted",
              )}
            />
            <span className="truncate">{f.title}</span>
          </span>
          <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              title="重命名时间轴"
              onClick={(e) => {
                e.stopPropagation();
                startEdit("file", f.id, f.title);
              }}
              className="flex h-5 w-5 items-center justify-center rounded-md text-fg-muted hover:bg-active hover:text-fg"
            >
              <Pencil className="size-3" />
            </button>
            <button
              title="删除时间轴"
              onClick={(e) => {
                e.stopPropagation();
                setConfirm({ kind: "file", id: f.id, title: f.title });
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

  const groupEndLine = (group: string) =>
    dropTarget?.kind === "file" && dropTarget.group === group && dropTarget.beforeId === null ? (
      <div className="absolute inset-x-1 -bottom-0.5 h-0.5 rounded-full bg-accent" />
    ) : null;

  return (
    <div className="p-2.5">
      {/* ===== 标题行：工程名 + 新建分卷 / 新建时间轴 ===== */}
      <div className="mb-2.5 flex items-center gap-1 px-1.5">
        <span className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-fg-strong">
          {project?.meta.name ?? "工程"}
        </span>
        <Button
          size="icon"
          variant="ghost"
          title="新建分卷"
          onClick={() => startCreate({ type: "folder" })}
        >
          <FolderPlus className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          title="新建时间轴"
          onClick={() => startCreate({ type: "file" })}
        >
          <FilePlus2 className="size-4" />
        </Button>
      </div>

      {/* ===== 时间轴搜索栏 ===== */}
      <div className="mb-2.5 px-1.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索时间轴…"
            className="h-7 pl-8 pr-8 text-xs !bg-app focus:!bg-app focus:border-accent/40 focus:ring-0"
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

        {/* ===== 分卷 ===== */}
        {displayFolders.map((v) => {
          const expanded = filtering || !isCollapsed(v.id);
          const children = shownByFolder.get(v.id) ?? [];
          return (
            <li key={v.id} className="relative">
              {dropTarget?.kind === "folder" && dropTarget.beforeId === v.id && (
                <div className="absolute inset-x-1 -top-0.5 h-0.5 rounded-full bg-accent" />
              )}
              {editing?.kind === "folder" && editing.id === v.id ? (
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
                  data-drop="folder"
                  data-drop-id={v.id}
                  onPointerDown={(e) => startPointerDrag(e, "folder", v.id)}
                  onClick={() => onToggleFolder(v.id)}
                  className={cn(
                    "group flex cursor-pointer items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-sm text-fg transition-all duration-150 hover:bg-hover",
                    drag?.id === v.id && "opacity-40",
                    dropTarget?.kind === "file" &&
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
                      title="在该分卷新建时间轴"
                      onClick={(e) => {
                        e.stopPropagation();
                        startCreate({ type: "file", folderId: v.id });
                      }}
                      className="flex h-5 w-5 items-center justify-center rounded-md text-fg-muted hover:bg-active hover:text-fg"
                    >
                      <Plus className="size-3" />
                    </button>
                    <button
                      title="重命名分卷"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit("folder", v.id, v.title);
                      }}
                      className="flex h-5 w-5 items-center justify-center rounded-md text-fg-muted hover:bg-active hover:text-fg"
                    >
                      <Pencil className="size-3" />
                    </button>
                    <button
                      title="删除分卷"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirm({ kind: "folder", id: v.id, title: v.title });
                      }}
                      className="flex h-5 w-5 items-center justify-center rounded-md text-fg-muted hover:bg-danger/15 hover:text-danger"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </div>
              )}

              {expanded && (
                <ul
                  className="relative ml-3.5 space-y-1 border-l border-line/60 pl-2 pt-0.5"
                  data-drop="group-end"
                  data-drop-group={v.id}
                >
                  {groupEndLine(v.id)}
                  {children.map((f) => (
                    <li key={f.id} className="relative">
                      {renderFile(f)}
                    </li>
                  ))}
                  {creating?.type === "file" && creating.folderId === v.id && (
                    <li>{renderCreateInput("输入时间轴名")}</li>
                  )}
                </ul>
              )}
            </li>
          );
        })}

        {creating?.type === "folder" && <li className="pt-0.5">{renderCreateInput("输入分卷名")}</li>}

        {shownTop.length > 0 && displayFolders.length > 0 && (
          <li className="px-2.5 pb-0.5 pt-2 text-[11px] font-semibold tracking-[0.14em] text-fg-muted">
            未分卷
          </li>
        )}
        {shownTop.map((f) => (
          <li key={f.id} className="relative">
            {renderFile(f)}
          </li>
        ))}

        {creating?.type === "file" && !creating.folderId && (
          <li className="pt-0.5">{renderCreateInput("输入时间轴名")}</li>
        )}

        {filtering && shownTop.length === 0 && shownByFolder.size === 0 && (
          <li className="px-2.5 py-8 text-center text-xs text-fg-muted">
            未找到匹配「{query.trim()}」的时间轴
          </li>
        )}
      </ul>

      {/* ===== 删除确认弹窗 ===== */}
      <Dialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          {confirm?.kind === "file" && (
            <>
              <DialogHeader>
                <DialogTitle>删除时间轴</DialogTitle>
                <DialogDescription>
                  确定删除「{confirm.title}」？该时间轴上的全部标签将一并删除，且无法撤销。
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setConfirm(null)}>
                  取消
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    deleteFile(instanceId, confirm.id);
                    setConfirm(null);
                  }}
                >
                  <Trash2 className="size-4" /> 删除
                </Button>
              </DialogFooter>
            </>
          )}
          {confirm?.kind === "folder" && (
            <>
              <DialogHeader>
                <DialogTitle>删除分卷</DialogTitle>
                <DialogDescription>
                  「{confirm.title}」共 {byFolder.get(confirm.id)?.length ?? 0} 条时间轴。请选择删除方式：
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <button
                  className="flex w-full items-center gap-3 rounded-xl border border-line bg-panel-2 px-4 py-3 text-left transition-colors hover:border-accent/40 hover:bg-hover"
                  onClick={() => {
                    deleteFolder(instanceId, confirm.id);
                    setConfirm(null);
                  }}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-panel-3">
                    <Folder className="size-4 text-fg-muted" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-fg-strong">只删除分卷</span>
                    <span className="block text-xs text-fg-muted">
                      分卷内的时间轴移到顶层，内容保留
                    </span>
                  </span>
                </button>
                <button
                  className="flex w-full items-center gap-3 rounded-xl border border-danger/25 bg-danger/5 px-4 py-3 text-left transition-colors hover:border-danger/50 hover:bg-danger/10"
                  onClick={() => {
                    deleteFolderWithContents(instanceId, confirm.id);
                    setConfirm(null);
                  }}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-danger/10">
                    <Trash2 className="size-4 text-danger" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-danger">同时删除所有内容</span>
                    <span className="block text-xs text-fg-muted">
                      删除分卷及其中的时间轴，无法撤销
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
