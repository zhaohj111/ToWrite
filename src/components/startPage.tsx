// 开始页（Welcome/Start Page）：轮转品牌标题、工程管理与近期打开。

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronsDown,
  ChevronsUp,
  BookOpenText,
  FilePlus2,
  FileText,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Plus,
  Settings,
  StickyNote,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { useProjectStore } from "@/stores/projectStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { UpdateBadge } from "@/components/updateBadge";
import { cn } from "@/lib/cn";
import { LineFlowBackground } from "@/components/lineFlowBackground";
import { PoemFlowBackground } from "@/components/poemFlowBackground";
import type { ProjectMeta } from "@/types/writeproj";

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `今天 ${d.getHours().toString().padStart(2, "0")}:${d
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
  }
  return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

type DialogState =
  | { type: "create" }
  | { type: "rename"; id: string }
  | { type: "note"; id: string }
  | { type: "delete"; id: string }
  | { type: "created"; id: string; name: string };

/** 操作栏固定高度（px），参与头部高度与补偿计算 */
const OPS_H = 52;
/** 标题收缩完成所需的滚动距离：即头部从 66vh−52 缩到 20vh 的差值 */
const PAGE_SCROLL_RANGE = "calc(46vh - 52px)";

export function StartPage() {
  const projects = useProjectStore((s) => s.projects);
  const recent = useProjectStore((s) => s.recent);
  const loading = useProjectStore((s) => s.loading);
  const projectsDir = useProjectStore((s) => s.projectsDir);
  const createProject = useProjectStore((s) => s.createProject);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const renameProject = useProjectStore((s) => s.renameProject);
  const setProjectNote = useProjectStore((s) => s.setProjectNote);
  const importProjectFile = useProjectStore((s) => s.importProjectFile);
  const importFileAsProject = useProjectStore((s) => s.importFileAsProject);
  const importFolderAsProject = useProjectStore((s) => s.importFolderAsProject);
  const openProjectById = useProjectStore((s) => s.openProjectById);

  const [dlg, setDlg] = useState<DialogState | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");

  // 外层页是标题收缩的驱动滚动容器（非工程区域）；工程区内部滚动独立，不影响缩放。
  const pageRef = useRef<HTMLDivElement>(null);
  const [shrink, setShrink] = useState(0);
  // 标题区域展开/锁定：展开到窗口高度后不再随滚动收缩
  const [titleExpanded, setTitleExpanded] = useState(false);
  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const range = 0.46 * window.innerHeight - OPS_H;
        setShrink(Math.min(el.scrollTop / Math.max(range, 1), 1));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);


  // 展开锁定时字体大小一并锁定（不随滚动收缩）；默认高度时随滚动收缩（48 → 34）
  const titleSize = titleExpanded ? 48 : 48 - 14 * shrink;
  const subSize = titleExpanded ? 18 : 18 - 4 * shrink; // 18 → 14
  // 头部整体高度：未滚动时项目管理顶部约在窗口 2/3，滚动后收缩到最小 1/5 窗口高度
  const headerHeight = `calc((${66}vh - ${OPS_H}px) * ${1 - shrink} + ${20}vh * ${shrink})`;

  const recentProjects = useMemo(
    () =>
      recent
        .map((r) => projects.find((p) => p.id === r.id))
        .filter((p): p is ProjectMeta => !!p),
    [recent, projects],
  );

  const openDialog = (d: DialogState) => {
    if (d.type === "create") {
      setName("");
      setNote("");
    } else {
      const p = projects.find((x) => x.id === d.id);
      setName(p?.name ?? "");
      setNote(p?.note ?? "");
    }
    setDlg(d);
  };

  const submit = async () => {
    if (!dlg) return;
    switch (dlg.type) {
      case "create": {
        const meta = await createProject(name);
        // 新建成功：弹窗询问是否直接打开（不走顶部通知）
        if (meta) {
          setDlg({ type: "created", id: meta.id, name });
          return;
        }
        break;
      }
      case "rename":
        await renameProject(dlg.id, name);
        break;
      case "note":
        await setProjectNote(dlg.id, note);
        break;
      case "delete":
        await deleteProject(dlg.id);
        break;
    }
    setDlg(null);
  };

  const target = dlg && dlg.type !== "create" && dlg.type !== "created" ? projects.find((p) => p.id === dlg.id) : null;

  return (
    <div ref={pageRef} className="hidden-scrollbar h-full overflow-y-auto">
      {/* 开始页背景（线条束流动；设置-外观与界面 可选，默认无） */}
      <LineFlowBackground />
      <PoemFlowBackground />
      {/* ===== 固定可视区（sticky 钉在窗口顶部）：标题 + 操作栏 + 工程区。
           外层页（非工程区域）滚动驱动标题收缩；工程区内部独立滚动，不影响缩放。 ===== */}
      <div className="sticky top-0 flex h-full flex-col">
      {/* ===== 页头：轮转品牌标题（布局顶部固定、非悬浮，随外层页滚动收缩） ===== */}
      <header
        className="anim-rise flex shrink-0 flex-col items-center justify-center"
        style={{ height: titleExpanded ? "100%" : headerHeight, transition: "height 0.5s var(--ease-out-expo)" }}
      >
        <h1
          className="w-full text-center font-display font-bold tracking-[0.16em] text-fg-strong"
          style={{ fontSize: titleSize }}
        >
          <Rotator items={["拓文", "ToWrite"]} intervalMs={6000} />
        </h1>
        <p className="mt-2.5 w-full text-center text-fg-muted" style={{ fontSize: subSize }}>
          <Rotator
            items={["一个灵感到一个故事", "写点什么？", "写出心中的故事，从此刻开始","迈出第一步，踏上取经路",
              
            ]}
            intervalMs={7000}
            initialDelayMs={2200}
          />
        </p>
        {/* 标题区展开/锁定：展开为窗口高度并锁定，图标切换为向上闪烁；再次点击恢复默认 */}
        <button
          type="button"
          onClick={() => setTitleExpanded((v) => !v)}
          title={titleExpanded ? "收起标题（恢复默认高度）" : "展开标题（占满窗口并锁定）"}
          className={cn(
            "anim-blink mt-4 flex size-9 items-center justify-center rounded-full text-fg-muted transition-colors",
            // 仅默认高度（未展开、未滚动收缩）显示向下键；展开锁定显示向上键；其余状态隐藏
            titleExpanded || shrink === 0
              ? "hover:bg-hover hover:text-fg"
              : "pointer-events-none !opacity-0 [animation:none]",
          )}
        >
          {titleExpanded ? <ChevronsUp className="size-4" /> : <ChevronsDown className="size-4" />}
        </button>
      </header>

      {/* ===== 操作栏（固定高度，始终可见） ===== */}
      <div className="shrink-0 px-12">
        <div className="mx-auto flex h-[52px] max-w-3xl items-center gap-2.5">
          <Button onClick={() => openDialog({ type: "create" })}>
            <Plus className="size-4" /> 新建工程
          </Button>
          <Button variant="secondary" onClick={() => void importProjectFile()}>
            <FolderOpen className="size-4" /> 打开工程文件
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary">
                <FilePlus2 className="size-4" /> 导入
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="bottom">
              <DropdownMenuItem onSelect={() => void importFileAsProject()}>
                <FileText className="size-3.5 opacity-70" />
                <span className="flex-1">导入文件为工程…</span>
                <span className="text-[10px] text-fg-muted/60">PDF · Markdown · TXT · Word · EPUB</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void importFolderAsProject()}>
                <FolderOpen className="size-3.5 opacity-70" />
                <span className="flex-1">导入文件夹为工程…</span>
                <span className="text-[10px] text-fg-muted/60">每个文档生成一章</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon"
            title="设置"
            onClick={() => useWorkspaceStore.getState().openSettings()}
          >
            <span className="relative inline-flex">
              <Settings className="size-4" />
              <UpdateBadge />
            </span>
          </Button>
          <div className="min-w-4 flex-1" />
          {projectsDir && (
            <span
              className="min-w-[120px] max-w-[300px] truncate font-mono text-[11px] text-fg-muted"
              title={projectsDir}
            >
              {projectsDir}
            </span>
          )}
        </div>
      </div>

      {/* ===== 工程区（固定区域 + 隐藏滚动条，内部独立滚动，不驱动标题收缩） ===== */}
      <div className="hidden-scrollbar min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto min-h-full max-w-3xl px-12 pb-12">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-3 text-fg-muted">
            <span className="size-4 animate-spin rounded-full border-2 border-line border-t-accent" />
            正在展开墨卷…
          </div>
        ) : projects.length === 0 ? (
          /* ===== 空状态 ===== */
          <div className="anim-rise delay-2 flex flex-1 flex-col items-center justify-center gap-5 rounded-2xl border border-dashed border-line px-10 py-20 text-center">
            <div>
              <p className="font-display text-lg font-semibold text-fg-strong">书卷待展</p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-fg-muted">
                新建一个工程，从灵感、大纲到正文，在这里一步一步完成你的创作。
              </p>
            </div>
            <Button onClick={() => openDialog({ type: "create" })}>
              <FilePlus2 className="size-4" /> 开始创作
            </Button>
          </div>
        ) : (
          /* ===== 工程面板：近期打开 + 所有工程（宽度一致、居中、浅轮廓标识宽度） ===== */
          <div className="anim-rise delay-2 rounded-2xl border border-line/40 px-3 py-3">
            {recentProjects.length > 0 && (
              <section className="mb-1">
                <h2 className="mb-3.5 mt-2 flex items-center gap-2 px-2 text-[11px] font-semibold tracking-[0.16em] text-fg-muted">
                  <span className="size-1.5 rounded-full bg-accent" />
                  近期打开的工程
                </h2>
                <div className="space-y-2">
                  {recentProjects.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      onOpen={() => void openProjectById(p.id)}
                      onManage={openDialog}
                    />
                  ))}
                </div>
              </section>
            )}

            {recentProjects.length > 0 && (
              <div className="mx-2 my-4 h-px bg-line/60" />
            )}

            {/* ===== 所有工程 ===== */}
            <section className="mb-1">
              <h2 className="mb-3.5 mt-2 flex items-center gap-2 px-2 text-[11px] font-semibold tracking-[0.16em] text-fg-muted">
                <span className="size-1.5 rounded-full bg-accent" />
                所有工程 · {projects.length}
              </h2>
              <div className="space-y-2">
                {projects.map((p) => (
                  <ProjectRow
                    key={p.id}
                    project={p}
                    onOpen={() => void openProjectById(p.id)}
                    onManage={openDialog}
                  />
                ))}
              </div>
            </section>
          </div>
        )}

        </div>
      </div>
      </div>

      {/* 外层页滚动范围垫片：提供标题收缩的驱动距离（在非工程区域滚动时） */}
      <div style={{ height: PAGE_SCROLL_RANGE }} aria-hidden />

      {/* ===== 弹窗 ===== */}
      <Dialog open={!!dlg} onOpenChange={(open) => !open && setDlg(null)}>
          <DialogContent>
            {dlg?.type === "create" && (
              <>
                <DialogHeader>
                  <DialogTitle>新建工程</DialogTitle>
                  <DialogDescription>
                    输入工程名称，将创建一个空工程（.writeproj）。
                  </DialogDescription>
                </DialogHeader>
                <Input
                  autoFocus
                  placeholder="例如：王朝的余烬"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void submit()}
                />
              </>
            )}
            {dlg?.type === "created" && (
              <>
                <DialogHeader>
                  <DialogTitle>工程已创建</DialogTitle>
                  <DialogDescription>
                    「{dlg.name}」已就绪，是否立即打开？
                  </DialogDescription>
                </DialogHeader>
              </>
            )}
            {dlg?.type === "rename" && (
              <>
                <DialogHeader>
                  <DialogTitle>重命名工程</DialogTitle>
                  <DialogDescription>修改「{target?.name}」的名称。</DialogDescription>
                </DialogHeader>
                <Input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void submit()}
                />
              </>
            )}
            {dlg?.type === "note" && (
              <>
                <DialogHeader>
                  <DialogTitle>工程备注</DialogTitle>
                  <DialogDescription>为「{target?.name}」添加或修改备注。</DialogDescription>
                </DialogHeader>
                <Textarea
                  autoFocus
                  rows={5}
                  placeholder="记录这个工程的目标、灵感或写作计划…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </>
            )}
            {dlg?.type === "delete" && (
              <>
                <DialogHeader>
                  <DialogTitle>删除工程</DialogTitle>
                  <DialogDescription>
                    确定要删除「{target?.name}」吗？该操作将删除对应的 .writeproj
                    文件，且无法撤销。
                  </DialogDescription>
                </DialogHeader>
              </>
            )}
            <DialogFooter>
              {dlg?.type !== "created" && (
                <Button variant="ghost" onClick={() => setDlg(null)}>
                  取消
                </Button>
              )}
              {dlg?.type === "created" ? (
                <>
                  <Button variant="ghost" onClick={() => setDlg(null)}>
                    稍后再说
                  </Button>
                  <Button
                    onClick={() => {
                      const id = dlg.id;
                      setDlg(null);
                      void openProjectById(id);
                    }}
                  >
                    打开
                  </Button>
                </>
              ) : dlg?.type === "delete" ? (
                <Button variant="destructive" onClick={() => void submit()}>
                  <Trash2 className="size-4" /> 删除
                </Button>
              ) : (
                <Button onClick={() => void submit()}>
                  {dlg?.type === "create" ? "创建" : "保存"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  );
}

// 上下轮转组件：两阶段驱动——先滑出旧项（完全消失），再滑入新项，杜绝重叠。
function Rotator({
  items,
  intervalMs,
  transitionMs = 400,
  initialDelayMs = 0,
}: {
  items: string[];
  intervalMs: number;
  transitionMs?: number;
  initialDelayMs?: number;
}) {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"in" | "out">("in");

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let disposed = false;
    const schedule = (delay: number) => {
      if (disposed) return;
      timers.push(
        setTimeout(() => {
          setPhase("out");
          timers.push(
            setTimeout(() => {
              setIdx((p) => (p + 1) % items.length);
              setPhase("in");
              schedule(intervalMs + transitionMs);
            }, transitionMs),
          );
        }, delay),
      );
    };
    schedule(initialDelayMs + intervalMs + transitionMs);
    return () => {
      disposed = true;
      timers.forEach(clearTimeout);
    };
  }, [items.length, intervalMs, transitionMs, initialDelayMs]);

  return (
    <span className="rotator" style={{ height: "1.6em" }}>
      <span key={idx} className={phase === "out" ? "rot-out" : "rot-in"}>
        {items[idx]}
      </span>
    </span>
  );
}

function ProjectCard({
  project,
  onOpen,
  onManage,
}: {
  project: ProjectMeta;
  onOpen: () => void;
  onManage: (d: DialogState) => void;
}) {
  return (
    <div
      className="card group flex cursor-pointer items-center gap-3.5 p-4"
      onClick={onOpen}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-transparent transition-colors group-hover:bg-accent-soft">
        <FileText className="size-4.5 text-accent" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-fg-strong">{project.name}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-muted">
          <span className="truncate">{project.note || "暂无备注"}</span>
          <span className="shrink-0 font-mono tabular-nums text-[10px] text-fg-muted/60">
            · {formatTime(project.updatedAt)}
          </span>
        </div>
      </div>
      <ProjectMenu project={project} onManage={onManage} />
    </div>
  );
}

function ProjectRow({
  project,
  onOpen,
  onManage,
}: {
  project: ProjectMeta;
  onOpen: () => void;
  onManage: (d: DialogState) => void;
}) {
  return (
    <div
      className="group flex cursor-pointer items-center gap-3.5 rounded-xl border border-transparent px-3 py-2.5 transition-all duration-200 hover:border-line hover:bg-panel"
      onClick={onOpen}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-panel-2">
        <FileText className="size-4 text-fg-muted transition-colors group-hover:text-accent" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-fg transition-colors group-hover:text-fg-strong">
          {project.name}
        </div>
        <div className="truncate text-xs text-fg-muted">
          {project.note || "暂无备注"} · 更新于{" "}
          <span className="font-mono tabular-nums">{formatTime(project.updatedAt)}</span>
        </div>
      </div>
      <ProjectMenu project={project} onManage={onManage} />
    </div>
  );
}

function ProjectMenu({
  project,
  onManage,
}: {
  project: ProjectMeta;
  onManage: (d: DialogState) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          title="更多操作"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-current bg-transparent text-fg-muted transition-all hover:bg-hover hover:text-fg data-[state=open]:bg-hover"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {/* 注意：菜单内容渲染在 Portal 中，但 React 合成事件沿组件树冒泡，
            必须 stopPropagation，否则会冒泡到行的 onClick 误打开工程。 */}
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onManage({ type: "rename", id: project.id });
          }}
        >
          <Pencil className="size-4" /> 重命名
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onManage({ type: "note", id: project.id });
          }}
        >
          <StickyNote className="size-4" /> 编辑备注
        </DropdownMenuItem>
        <Separator className="my-1" />
        <DropdownMenuItem
          className="text-danger focus:bg-danger/15 focus:text-danger"
          onClick={(e) => {
            e.stopPropagation();
            onManage({ type: "delete", id: project.id });
          }}
        >
          <Trash2 className="size-4" /> 删除工程
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
