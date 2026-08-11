// 关于 > 关于项目：当前工程的名称/备注/时间与 .writeproj 位置，以及内容统计。
// 仅在有工程打开时可达（scope: project，无工程时灰置不可导航）。

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useProjectStore } from "@/stores/projectStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useEditorStore } from "@/stores/editorStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { useLoreStore } from "@/stores/loreStore";

function formatFull(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" });
}

/** 递归统计 TipTap JSON 文本：CJK 按字、西文按词 */
function countText(s: string): number {
  const cjk = s.match(/[一-鿿㐀-䶿]/g)?.length ?? 0;
  const latin = s
    .replace(/[一-鿿㐀-䶿]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return cjk + latin;
}

function countWords(doc: unknown): number {
  let n = 0;
  const walk = (node: unknown): void => {
    if (!node) return;
    if (typeof node === "string") {
      n += countText(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node === "object") {
      const obj = node as { type?: string; text?: unknown; content?: unknown };
      if (obj.type === "text" && typeof obj.text === "string") n += countText(obj.text);
      if (Array.isArray(obj.content)) obj.content.forEach(walk);
    }
  };
  walk(doc);
  return n;
}

/** 工程名称（本地编辑，失焦/回车提交到工程文件） */
export function ProjectNameField() {
  const project = useWorkspaceStore((s) => s.project);
  const renameProject = useProjectStore((s) => s.renameProject);
  const [name, setName] = useState(project?.meta.name ?? "");
  useEffect(() => setName(project?.meta.name ?? ""), [project?.meta.name]);
  if (!project) return null;
  return (
    <Input
      value={name}
      onChange={(e) => setName(e.target.value)}
      onBlur={() => {
        const next = name.trim();
        if (next && next !== project.meta.name) void renameProject(project.meta.id, next);
        else setName(project.meta.name);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className="max-w-md"
    />
  );
}

/** 工程备注（本地编辑，失焦提交） */
export function ProjectNoteField() {
  const project = useWorkspaceStore((s) => s.project);
  const setProjectNote = useProjectStore((s) => s.setProjectNote);
  const [note, setNote] = useState(project?.meta.note ?? "");
  useEffect(() => setNote(project?.meta.note ?? ""), [project?.meta.note]);
  if (!project) return null;
  return (
    <Textarea
      rows={3}
      value={note}
      onChange={(e) => setNote(e.target.value)}
      onBlur={() => {
        if (note !== project.meta.note) void setProjectNote(project.meta.id, note.trim());
        else setNote(project.meta.note);
      }}
      placeholder="记录这个工程的目标、灵感或写作计划…"
      className="w-full"
    />
  );
}

/** 工程元数据 + .writeproj 位置 */
export function ProjectMetaInfo() {
  const project = useWorkspaceStore((s) => s.project);
  const projectsDir = useProjectStore((s) => s.projectsDir);
  if (!project) return null;
  const meta = project.meta;
  const path = projectsDir ? `${projectsDir}/${meta.id}.writeproj` : `${meta.id}.writeproj`;
  return (
    <div className="flex w-full flex-col gap-3">
      <dl className="grid w-full grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-[13px]">
        <dt className="text-fg-muted">创建时间</dt>
        <dd className="font-mono text-fg">{formatFull(meta.createdAt)}</dd>
        <dt className="text-fg-muted">更新时间</dt>
        <dd className="font-mono text-fg">{formatFull(meta.updatedAt)}</dd>
        <dt className="text-fg-muted">格式版本</dt>
        <dd className="font-mono text-fg">v{meta.formatVersion}</dd>
      </dl>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-fg-muted">工程文件位置（.writeproj）</span>
        <code className="w-full truncate rounded-lg border border-line bg-panel-3/40 px-3 py-2 font-mono text-xs text-fg-muted">
          {path}
        </code>
      </div>
    </div>
  );
}

/** 内容统计：章节 / 字数 / 时间轴节点 / 设定卡片 */
export function ProjectStats() {
  const editorSlices = useEditorStore((s) => s.slices);
  const timelineSlices = useTimelineStore((s) => s.slices);
  const loreSlices = useLoreStore((s) => s.slices);

  let chapters = 0;
  let words = 0;
  for (const slice of Object.values(editorSlices)) {
    chapters += slice.chapters.length;
    for (const doc of Object.values(slice.contents)) words += countWords(doc);
  }
  let nodes = 0;
  for (const slice of Object.values(timelineSlices)) {
    for (const data of Object.values(slice.docs)) nodes += data.nodes.length;
  }
  let cards = 0;
  for (const slice of Object.values(loreSlices)) {
    for (const data of Object.values(slice.docs)) cards += data.cards.length;
  }

  return (
    <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat label="章节" value={chapters} />
      <Stat label="全文字数" value={words} />
      <Stat label="时间轴节点" value={nodes} />
      <Stat label="设定卡片" value={cards} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-line/60 bg-panel-3/40 px-3 py-3">
      <span className="font-mono text-xl font-semibold text-fg-strong tabular-nums">
        {value.toLocaleString("zh-CN")}
      </span>
      <span className="text-xs text-fg-muted">{label}</span>
    </div>
  );
}
