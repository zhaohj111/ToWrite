// 设定卡片编辑器（core.lore）：标题 / 分类 / TipTap 富文本内容 / 标签 / 备注。
// 字段实时写回 store；内容撤销/重做注册到 loreBus（工具栏撤销优先驱动内容历史）。
// 标签入口集中在设定名右侧「添加标签」弹窗（搜索/勾选/新建），主界面只保留单行已添加标签。

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Plus,
  Link2,
  Redo2,
  Search,
  Strikethrough,
  TextQuote,
  Undo2,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ColorSwatchPicker } from "@/components/ui/colorPicker";
import { useLoreStore } from "@/stores/loreStore";
import { LoreTimelineAssociationDialog } from "@/components/lore/LoreTimelineAssociationDialog";
import { useAssociationStore } from "@/stores/associationStore";
import { useInstanceId, useLoreSlice } from "@/components/editor/editorInstanceContext";
import { registerLoreEditor } from "@/lib/loreBus";
import { getFileRefsForCard } from "@/lib/associationUtils";
import { emptyChapterDoc } from "@/types/writeproj";
import { cn } from "@/lib/cn";

const TAG_COLORS = ["#d08a76", "#7ba6a0", "#d7b25c", "#9a7bbd", "#7f9a6a", "#c47a8f"];

export function LoreCardEditor({
  fileId,
  cardId,
  onClose,
}: {
  fileId: string;
  cardId: string;
  onClose: () => void;
}) {
  const instanceId = useInstanceId();
  const slice = useLoreSlice();
  const card = slice.docs[fileId]?.cards.find((c) => c.id === cardId);
  const tags = slice.tags;
  const updateCard = useLoreStore((s) => s.updateCard);
  const addTag = useLoreStore((s) => s.addTag);

  const [title, setTitle] = useState(card?.title ?? "");
  const [note, setNote] = useState(card?.note ?? "");
  const [cardTags, setCardTags] = useState<string[]>(card?.tags ?? []);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [newTagColor, setNewTagColor] = useState(
    TAG_COLORS[tags.length % TAG_COLORS.length],
  );
  const [candidateSearch, setCandidateSearch] = useState("");
    const [manageAssocOpen, setManageAssocOpen] = useState(false);

    useAssociationStore((s) => s.timelineToLore);
    const associatedFiles = getFileRefsForCard(cardId);
  // —— 已添加标签横向拖动浏览（隐藏滚动条，多标签时可左键拖动）——
  const tagsScrollRef = useRef<HTMLDivElement>(null);
  const tagsDragRef = useRef<{ startClientX: number; startLeft: number } | null>(null);

  const startTagsDrag = (e: React.PointerEvent) => {
    if (e.button !== 0 || e.pointerType !== "mouse") return;
    const el = tagsScrollRef.current;
    tagsDragRef.current = { startClientX: e.clientX, startLeft: el?.scrollLeft ?? 0 };
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = tagsDragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startClientX;
      if (Math.abs(dx) < 4) return;
      const el = tagsScrollRef.current;
      if (el) el.scrollLeft = d.startLeft - dx;
    };
    const onUp = () => {
      tagsDragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);


    // —— 关联文件行横向拖动浏览 ——
    const assocScrollRef = useRef<HTMLDivElement>(null);
    const assocDragRef = useRef<{ startClientX: number; startLeft: number; moved: boolean } | null>(null);
    const startAssocDrag = (e: React.PointerEvent) => {
      if (e.button !== 0 || e.pointerType !== "mouse") return;
      if ((e.target as HTMLElement).closest("button, input")) return;
      const el = assocScrollRef.current;
      assocDragRef.current = { startClientX: e.clientX, startLeft: el?.scrollLeft ?? 0, moved: false };
    };

    useEffect(() => {
      const onMove = (e: PointerEvent) => {
        const d = assocDragRef.current;
        if (!d) return;
        const dx = e.clientX - d.startClientX;
        if (!d.moved && Math.abs(dx) < 4) return;
        d.moved = true;
        const el = assocScrollRef.current;
        if (el) el.scrollLeft = d.startLeft - dx;
      };
      const onUp = () => { assocDragRef.current = null; };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      return () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
    }, []);
  const editor = useEditor({
    extensions: [StarterKit],
    content: card?.content ?? emptyChapterDoc(),
    onUpdate: ({ editor: inst }) => {
      if (card) updateCard(instanceId, fileId, cardId, { content: inst.getJSON() });
    },
  });

  // 注册内容撤销/重做到 loreBus：工具栏撤销/重做优先驱动富文本历史
  useEffect(() => {
    if (!editor) return;
    registerLoreEditor(instanceId, {
      undo: () => editor.chain().focus().undo().run(),
      redo: () => editor.chain().focus().redo().run(),
    });
    return () => registerLoreEditor(instanceId, null);
  }, [editor, instanceId]);

  if (!card) return null;

  const toggleTag = (tagId: string) => {
    const next = cardTags.includes(tagId)
      ? cardTags.filter((t) => t !== tagId)
      : [...cardTags, tagId];
    setCardTags(next);
    updateCard(instanceId, fileId, cardId, { tags: next });
  };

  const createTag = (name: string) => {
    const tag = addTag(instanceId, name, newTagColor);
    const next = cardTags.includes(tag.id) ? cardTags : [...cardTags, tag.id];
    setCardTags(next);
    updateCard(instanceId, fileId, cardId, { tags: next });
    setTagInput("");
  };

  // 可选标签：未选中项，按名称搜索过滤（仅用于「添加标签」弹窗）
  const qTag = candidateSearch.trim().toLowerCase();
  const candidates = tags.filter(
    (t) => !cardTags.includes(t.id) && t.name.toLowerCase().includes(qTag),
  );

  const toolBtn = (active: boolean) =>
    cn(
      "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
      active ? "bg-accent-soft text-accent" : "text-fg-muted hover:bg-hover hover:text-fg",
    );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(640px,94vw)] !bg-app">
        <DialogHeader>
          <DialogTitle>编辑设定</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* 标题 + 添加标签入口（右侧独占区域以 border-l 分隔，样式参考筛选栏） */}
          <div className="flex items-stretch overflow-hidden rounded-lg border border-line/70 bg-app focus-within:border-accent/40">
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                updateCard(instanceId, fileId, cardId, { title: e.target.value });
              }}
              placeholder="设定名…"
              className="h-9 min-w-0 flex-1 bg-transparent px-2.5 font-display text-base font-semibold text-fg outline-none placeholder:text-fg-muted/50"
            />
          </div>
            {/* 标签行：chips + 右侧固定「添加标签」入口 */}
            <div className="flex items-center gap-1.5 px-2 py-1.5">
              <div
                ref={tagsScrollRef}
                onPointerDown={startTagsDrag}
                className="hidden-scrollbar flex min-w-0 flex-1 cursor-grab items-center gap-1.5 overflow-x-auto active:cursor-grabbing"
              >
                {cardTags.length === 0 ? (
                  <span className="text-[11px] text-fg-muted/60">暂无标签</span>
                ) : (
                  cardTags.map((tid) => {
                    const t = tags.find((x) => x.id === tid);
                    if (!t) return null;
                    return (
                      <span
                        key={tid}
                        title={t.name}
                        className="shrink-0 whitespace-nowrap rounded px-2 py-1 text-[11px] font-medium"
                        style={{ background: t.color + "26", color: t.color }}
                      >
                        {t.name}
                      </span>
                    );
                  })
                )}
              </div>
              <button
                onClick={() => setTagDialogOpen(true)}
                className="flex shrink-0 items-center gap-1 rounded-md bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent transition-colors hover:bg-accent/20"
              >
                <Plus className="size-3" /> 添加标签
              </button>
            </div>

            {/* 关联文件行：chips 样式同标签行；无关联时整行隐藏 */}
            {associatedFiles.length > 0 && (
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <div ref={assocScrollRef} onPointerDown={startAssocDrag} className="hidden-scrollbar flex min-w-0 flex-1 cursor-grab items-center gap-1.5 overflow-x-auto active:cursor-grabbing">
                  {associatedFiles.map((f) => (
                    <span
                      key={f.fileId}
                        className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded px-2 py-1 text-[11px] font-medium text-accent"
                      style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
                    >
                      <Link2 className="size-3" />
                      {f.instanceName} / {f.title}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => setManageAssocOpen(true)}
                  className="flex shrink-0 items-center gap-1 rounded-md bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent transition-colors hover:bg-accent/20"
                >
                  管理关联文件
                </button>
              </div>
            )}

          {/* 内容：TipTap */}
          <div className="rounded-xl border border-line bg-app">
            <div className="flex items-center gap-0.5 border-b border-line/60 px-1.5 py-1">
              {editor && (
                <>
                  <button
                    className={toolBtn(editor.isActive("bold"))}
                    title="加粗"
                    onClick={() => editor.chain().focus().toggleBold().run()}
                  >
                    <Bold className="size-3.5" />
                  </button>
                  <button
                    className={toolBtn(editor.isActive("italic"))}
                    title="斜体"
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                  >
                    <Italic className="size-3.5" />
                  </button>
                  <button
                    className={toolBtn(editor.isActive("strike"))}
                    title="删除线"
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                  >
                    <Strikethrough className="size-3.5" />
                  </button>
                  <button
                    className={toolBtn(editor.isActive("heading", { level: 2 }))}
                    title="二级标题"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                  >
                    <Heading2 className="size-3.5" />
                  </button>
                  <button
                    className={toolBtn(editor.isActive("bulletList"))}
                    title="无序列表"
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                  >
                    <List className="size-3.5" />
                  </button>
                  <button
                    className={toolBtn(editor.isActive("orderedList"))}
                    title="有序列表"
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                  >
                    <ListOrdered className="size-3.5" />
                  </button>
                  <button
                    className={toolBtn(editor.isActive("blockquote"))}
                    title="引用"
                    onClick={() => editor.chain().focus().toggleBlockquote().run()}
                  >
                    <TextQuote className="size-3.5" />
                  </button>
                  <span className="mx-1 h-4 w-px bg-line/70" />
                  <button
                    className={toolBtn(false)}
                    title="撤销内容"
                    onClick={() => editor.chain().focus().undo().run()}
                  >
                    <Undo2 className="size-3.5" />
                  </button>
                  <button
                    className={toolBtn(false)}
                    title="重做内容"
                    onClick={() => editor.chain().focus().redo().run()}
                  >
                    <Redo2 className="size-3.5" />
                  </button>
                </>
              )}
            </div>
            {/* 内容编辑区：上下边缘收窄为固定小值（见 styles.css .lore-card-editor） */}
            <div className="lore-card-editor max-h-56 min-h-32 overflow-y-auto px-3">
              {editor ? (
                <EditorContent editor={editor} />
              ) : (
                <div className="text-xs text-fg-muted">加载中…</div>
              )}
            </div>
          </div>

          {/* 备注 */}
          <Textarea
            rows={3}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              updateCard(instanceId, fileId, cardId, { note: e.target.value });
            }}
            placeholder="备注（内部标注，不参与设定正文）…"
            className="!bg-app focus:!bg-app"
          />
        </div>
      </DialogContent>

      {/* —— 添加标签弹窗：搜索/勾选可选标签 + 新建标签 —— */}
      <Dialog open={tagDialogOpen} onOpenChange={(open) => !open && setTagDialogOpen(false)}>
        <DialogContent className="w-[min(460px,94vw)] !bg-app">
          <DialogHeader>
            <DialogTitle>添加标签</DialogTitle>
          </DialogHeader>

          <div className="space-y-2.5">
            {/* 已添加标签（可点击移除） */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-[0.14em] text-fg-muted">
                已添加 {cardTags.length}
              </span>
              {(
                <span className="text-[10px] text-fg-muted/60">点击标签可移除</span>
              )}
            </div>
            {(
              <div className="flex max-h-14 flex-wrap gap-1.5 overflow-y-auto">
                {cardTags.map((tid) => {
                  const t = tags.find((x) => x.id === tid);
                  if (!t) return null;
                  return (
                    <button
                      key={tid}
                      onClick={() => toggleTag(tid)}
                      title={`移除「${t.name}」`}
                      className="flex items-center gap-0.5 rounded px-2 py-1 text-[11px] font-medium transition-opacity hover:opacity-80"
                      style={{ background: t.color + "26", color: t.color }}
                    >
                      {t.name}
                      <X className="size-2.5" />
                    </button>
                  );
                })}
              </div>
            )}

            {/* 搜索可选标签 */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-fg-muted" />
              <input
                autoFocus
                value={candidateSearch}
                onChange={(e) => setCandidateSearch(e.target.value)}
                placeholder="搜索标签…"
                className="h-7 w-full rounded-md border border-line/70 !bg-app pl-6 pr-1.5 text-[11px] text-fg outline-none placeholder:text-fg-muted/50 focus:!bg-app focus:border-accent/40"
              />
            </div>

            {/* 可选标签（未添加项）：行数放宽，最多约 7 行 */}
            <div className="max-h-[176px] overflow-y-auto rounded-lg border border-line/70 p-1.5">
              <div className="flex flex-wrap gap-1.5">
                {candidates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => toggleTag(t.id)}
                    title={`添加「${t.name}」`}
                    className="rounded px-2 py-1 text-[11px] font-medium transition-opacity hover:opacity-80"
                    style={{ background: t.color + "26", color: t.color }}
                  >
                    {t.name}
                  </button>
                ))}
                {candidates.length === 0 && (
                  <span className="text-[11px] text-fg-muted/60">
                    {qTag ? "未找到匹配标签" : "暂无更多标签"}
                  </span>
                )}
              </div>
            </div>

            {/* 新建标签：色块点击弹出取色面板 */}
            <div className="flex items-center gap-1.5 border-t border-line/50 pt-2">
              <ColorSwatchPicker value={newTagColor} onChange={setNewTagColor} title="选择颜色" size="sm" />
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (tagInput.trim()) createTag(tagInput.trim());
                  }
                  if (e.key === "Escape") setTagInput("");
                }}
                placeholder="新建标签名称…"
                className="h-7 min-w-0 flex-1 rounded-md border border-line !bg-app px-3 text-[11px] text-fg outline-none placeholder:text-fg-muted/50 focus:!bg-app focus:border-accent/40"
              />
              <button
                onClick={() => createTag(tagInput.trim())}
                disabled={!tagInput.trim()}
                className="flex shrink-0 items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
              >
                <Plus className="size-3" /> 新建标签
              </button>
            </div>
          </div>
        </DialogContent>
        {/* 关联时间轴弹窗（管理关联文件复用右键卡片弹窗） */}
        </Dialog>
        {manageAssocOpen && (
          <LoreTimelineAssociationDialog
            loreInstanceId={instanceId}
            fileId={fileId}
            cardId={cardId}
            onClose={() => setManageAssocOpen(false)}
          />
        )}

    </Dialog>
  );
}
