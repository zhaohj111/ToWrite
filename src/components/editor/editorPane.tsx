// 正文编辑器（core.editor 主视图）：TipTap + 官方扩展集（StarterKit/颜色/图片/表格），纸张质感。
// v0.7：
//   - 空格全/半角自适应（紧邻中文插全角空格）
//   - 字体颜色入口改为「右键选中文本弹出更换颜色面板」（工具栏不再占位）
// v0.8 右键菜单（按右键位置 + 选区类型判定四种形态）：
//   - 图片节点 → 删除图片 / 顺时针旋转 90° / 逆时针旋转 90°
//   - 文本选区 → 图标行（加粗/斜体/删除线/清空格式）+ 更换字体颜色子面板
//   - 光标在表格内（无选区）→ 最上方/最下方添加行、最左/最右添加列、删除表格
//   - 单元格选区（蓝框选格）→ 加粗/斜体/删除线/清空所选内容 + 合并/拆分/行列增删
// 状态按插件实例隔离：通过 useEditorInstance / useEditorSlice 读取属于本实例的章节与内容。

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { TextSelection, type EditorState, type Selection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  Bold,
  ChevronRight,
  Combine,
  Eraser,
  Italic,
  RemoveFormatting,
  RotateCcw,
  RotateCw,
  Split,
  Strikethrough,
  Trash2,
} from "lucide-react";
import { Toolbar } from "@/components/editor/toolbar";
import { EditorProvider } from "@/components/editor/editorContext";
import { editorExtensions } from "@/components/editor/extensions";
import { useEditorInstance, useEditorSlice } from "@/components/editor/editorInstanceContext";
import { useEditorStore, DEFAULT_FONT_SIZE } from "@/stores/editorStore";
import { EDITOR_PROTOTYPE } from "@/stores/pluginStore";
import { useSettingsStore, resolveSetting } from "@/stores/settingsStore";
import { ColorPickerPanel } from "@/components/ui/colorPicker";
import { setActiveEditor, setImageContextMenuListener, type ImageContextMenuActions } from "@/lib/editorBus";
import { emptyChapterDoc } from "@/types/writeproj";
import { cn } from "@/lib/cn";

/** CJK 判定（含全角空格）：空格插入时用于「全角/半角自适应」 */
const CJK_RE = /[㐀-鿿぀-ヿ가-힯　]/;

/** 右键取色面板默认色（无历史记忆时的初始值） */
const DEFAULT_TEXT_COLOR = "#c14a35";

/** 右键菜单形态（按右键位置与选区类型判定） */
type CtxMenu =
  | { kind: "text"; x: number; y: number; stage: "menu" | "picker"; value: string }
  | { kind: "table"; x: number; y: number }
  | { kind: "cell"; x: number; y: number }
  | { kind: "image"; x: number; y: number; actions: ImageContextMenuActions };

// ===================== 菜单基础组件 =====================

/** 图标小按钮：工具栏同款样式（加粗/斜体/删除线/清空格式/清空所选内容） */
function MenuIconButton({
  title,
  active,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      // 阻止编辑器失焦：点击时保持选区/焦点，命令才能作用于原选区
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md transition-all duration-150 active:scale-95",
        active ? "bg-accent/20 text-accent" : "text-fg-muted hover:bg-hover hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

/** 菜单行（垂直列表项；danger = 删除类，active = 标记激活态，disabled = 灰置） */
function MenuRow({
  icon: Icon,
  label,
  onClick,
  danger,
  disabled,
  active,
}: {
  icon?: LucideIcon;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors",
        danger
          ? "text-danger hover:bg-danger/10"
          : active
            ? "text-accent hover:bg-accent/10"
            : "text-fg hover:bg-hover",
        disabled && "pointer-events-none opacity-40",
      )}
    >
      {Icon ? <Icon className="size-3.5 shrink-0 opacity-70" /> : null}
      <span className="flex-1">{label}</span>
    </button>
  );
}

/** 菜单分组分隔线 */
function MenuSeparator() {
  return <div className="mx-2 my-1 h-px bg-line" />;
}

// ===================== 表格菜单辅助（「最上/最下加行、最左/最右加列」） =====================

/** 定位表格内第 rowIdx 行第 colIdx 列单元格的内容位置（用于把光标移过去再执行相对行列命令） */
function locateCellContentPos(
  state: EditorState,
  tablePos: number,
  rowIdx: number,
  colIdx: number,
): number | null {
  const table = state.doc.nodeAt(tablePos);
  if (!table || rowIdx >= table.childCount) return null;
  let rowPos = tablePos + 1; // 表格内容起点
  for (let r = 0; r < rowIdx; r++) rowPos += table.child(r).nodeSize;
  const row = table.child(rowIdx);
  if (colIdx >= row.childCount) return null;
  let cellPos = rowPos + 1; // 行内容起点
  for (let c = 0; c < colIdx; c++) cellPos += row.child(c).nodeSize;
  return cellPos + 1; // 单元格内容起点
}

/** 找到所在表格节点的起点位置；不在表格内返回 null */
function findTablePos(state: EditorState): number | null {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === "table") return $from.before(d);
  }
  return null;
}

/** 表格菜单：在表格最上方/最下方添加行（先把光标定位到目标行首格，再走官方命令） */
function addRowAtTableEdge(editor: Editor, where: "top" | "bottom"): boolean {
  const { state, view } = editor;
  const tablePos = findTablePos(state);
  if (tablePos == null) return false;
  const table = state.doc.nodeAt(tablePos);
  if (!table) return false;
  const rowIdx = where === "top" ? 0 : table.childCount - 1;
  const contentPos = locateCellContentPos(state, tablePos, rowIdx, 0);
  if (contentPos == null) return false;
  const $pos = state.doc.resolve(contentPos);
  view.dispatch(state.tr.setSelection(TextSelection.near($pos)));
  const chain = editor.chain().focus();
  (where === "top" ? chain.addRowBefore() : chain.addRowAfter()).run();
  return true;
}

/** 表格菜单：在最左侧/最右侧添加列（取单元格数最多的行定位首/末格，兼容合并差异） */
function addColumnAtTableEdge(editor: Editor, where: "left" | "right"): boolean {
  const { state, view } = editor;
  const tablePos = findTablePos(state);
  if (tablePos == null) return false;
  const table = state.doc.nodeAt(tablePos);
  if (!table) return false;
  let bestRow = 0;
  let bestCount = 0;
  table.forEach((row, _offset, index) => {
    if (row.childCount > bestCount) {
      bestCount = row.childCount;
      bestRow = index;
    }
  });
  const colIdx = where === "left" ? 0 : bestCount - 1;
  const contentPos = locateCellContentPos(state, tablePos, bestRow, colIdx);
  if (contentPos == null) return false;
  const $pos = state.doc.resolve(contentPos);
  view.dispatch(state.tr.setSelection(TextSelection.near($pos)));
  const chain = editor.chain().focus();
  (where === "left" ? chain.addColumnBefore() : chain.addColumnAfter()).run();
  return true;
}

/** 单元格菜单：清空所选单元格内容（保留单元格结构，各格替换为单个空段落） */
function clearCellSelectionContent(editor: Editor) {
  const { state, view } = editor;
  const sel = state.selection;
  if (!(sel instanceof CellSelection)) return;
  const tr = state.tr;
  sel.forEachCell((cell, pos) => {
    tr.replaceWith(pos + 1, pos + cell.nodeSize - 1, state.schema.nodes.paragraph.create());
  });
  view.dispatch(tr);
}

export function EditorPane() {
  const instanceId = useEditorInstance();
  const slice = useEditorSlice();
  const { currentChapterId: currentId, contents, chapters } = slice;
  // 字号按实例隔离（级联：实例覆盖 > 应用级 > manifest 默认）；订阅 settingsStore 以响应设置页改动
  useSettingsStore();
  const fontSize = (resolveSetting(EDITOR_PROTOTYPE, instanceId, "fontSize") as number) ?? DEFAULT_FONT_SIZE;
  const prevIdRef = useRef<string | null>(null);
  // 编辑器「实际加载的章节」：由载入 effect 维护。onUpdate 写回必须以它为写入目标——
  // 切换章节的瞬间 store 的 currentChapterId 已是新章，而编辑器主体仍是旧章内容；
  // 若用实时 currentChapterId 写回，会把旧章内容写进新章（切回后显示串章 bug）。
  const loadedIdRef = useRef<string | null>(null);
  // 右键菜单（null = 未打开）
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    // v0.7：StarterKit + 字体颜色 + 图片 + 表格（与导入导出共用同一份扩展集）
    extensions: editorExtensions,
    content: currentId ? contents[currentId] ?? emptyChapterDoc() : emptyChapterDoc(),
    editable: !!currentId,
    onUpdate: ({ editor: instance }) => {
      const st = useEditorStore.getState();
      const target = loadedIdRef.current ?? st.getSlice(instanceId).currentChapterId;
      if (target) st.setContent(instanceId, target, instance.getJSON());
    },
    editorProps: {
      attributes: { class: "h-full" },
      // 空格全/半角自适应：光标紧邻中文字符时插入全角空格 U+3000，否则默认半角 U+0020
      handleKeyDown: (view, event) => {
        if (event.key !== " ") return false;
        if (event.isComposing || event.keyCode === 229) return false; // 输入法组合态不拦截
        const { from } = view.state.selection;
        if (from === 0) return false;
        const prev = view.state.doc.textBetween(from - 1, from, "\n", "￼");
        const next = view.state.doc.textBetween(from, from + 1, "\n", "￼");
        if (CJK_RE.test(prev) || CJK_RE.test(next)) {
          view.dispatch(view.state.tr.insertText("　"));
          return true;
        }
        return false;
      },
    },
  });

  // 挂载时把当前编辑器注册到 editorBus（按实例），供大纲等侧边栏定位跳转
  useEffect(() => {
    if (!editor) return;
    setActiveEditor(instanceId, editor);
    return () => setActiveEditor(instanceId, null);
  }, [editor, instanceId]);

  // 图片节点右键：节点视图经总线把操作回调送过来，弹出图片菜单（不改变当前选区）
  useEffect(() => {
    return setImageContextMenuListener((e, actions) => {
      if (!currentId) return;
      setCtxMenu({ kind: "image", x: e.clientX, y: e.clientY, actions });
    });
  }, [currentId]);

  // 只读/可编辑随当前章节切换：tiptap 的 useEditor（空依赖）不会跟随 options.editable 变更，
  // 需显式调用 setEditable。否则「先无章节后选中章节」时编辑器一直只读（也无法拖表格列宽）。
  // 第二参 emitUpdate 必须为 false：setEditable 会无条件 emit('update')，若在载入 effect 之前触发
  // onUpdate 写回，会把旧章节内容写进新章节的 store（切换章节后显示非目标文件的根因之一）。
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!!currentId, false);
  }, [editor, currentId]);

  // 切换章节时载入对应内容（用 prevIdRef 防止每次输入触发重载）。
  // 内容直接从 store 取最新值（而非本帧闭包）：切换瞬间若有并发的写回，
  // 保证加载到的是目标章节当前存储的内容，绝不加载被上一帧闭包截留的旧文档。
  useEffect(() => {
    if (!editor || prevIdRef.current === currentId) return;
    prevIdRef.current = currentId;
    loadedIdRef.current = currentId;
    const st = useEditorStore.getState();
    const storedContents = st.getSlice(instanceId).contents;
    const doc = currentId ? storedContents[currentId] ?? emptyChapterDoc() : emptyChapterDoc();
    editor.commands.setContent(doc, false);
    // 新章/空章（正文除章节名 H1 外无内容）：切换后直接聚焦正文、光标落在文末，无需点击即可输入
    const bodyText = editor.state.doc.content.content
      .slice(1)
      .map((n) => n.textContent ?? "")
      .join("");
    if (currentId && bodyText.trim() === "") editor.commands.focus("end");
  }, [editor, currentId, contents]);

  // 重命名当前章节后，实时同步正文首部 H1 为章节名；切换章节时不动正文
  const lastRef = useRef<{ id: string | null; title: string | null }>({ id: null, title: null });
  const currentTitle = chapters.find((c) => c.id === currentId)?.title ?? null;
  useEffect(() => {
    if (!editor || !currentId || !currentTitle) return;
    const last = lastRef.current;
    if (last.id !== currentId) {
      lastRef.current = { id: currentId, title: currentTitle };
      return; // 章节切换：正文由 store 内容决定，不做自动改动
    }
    if (last.title === currentTitle) return;
    lastRef.current = { id: currentId, title: currentTitle };
    const first = editor.state.doc.firstChild;
    const isH1 = !!first && first.type.name === "heading" && first.attrs.level === 1;
    if (isH1 && first.textContent === currentTitle) return;
    const { tr } = editor.state;
    if (isH1) {
      // 替换首行 H1 的文本
      tr.replaceWith(1, first.content.size + 1, editor.schema.text(currentTitle));
    } else {
      // 文档开头没有 H1 时插入一个
      tr.insert(
        0,
        editor.schema.nodes.heading.create({ level: 1 }, editor.schema.text(currentTitle)),
      );
    }
    editor.view.dispatch(tr);
  }, [editor, currentId, currentTitle]);

  // 右键按下（捕获阶段，先于编辑器/浏览器处理）快照选区：
  // 右键 mousedown 会清掉单元格/文本选区，contextmenu 时需据此恢复，否则菜单形态与操作目标都错。
  const ctxSnapshotRef = useRef<{ sel: Selection } | null>(null);
  const editorPageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = editorPageRef.current;
    if (!el) return;
    const onDown = (e: MouseEvent) => {
      if (e.button !== 2) return;
      if (!editor) return;
      const sel = editor.state.selection;
      ctxSnapshotRef.current = sel.empty ? null : { sel };
    };
    el.addEventListener("mousedown", onDown, true);
    return () => el.removeEventListener("mousedown", onDown, true);
  }, [editor]);

  // 右键判定：单元格选区 > 文本选区 > 表格内光标（图片由节点视图总线处理）
  const handleContextMenu = (e: React.MouseEvent) => {
    if (!editor || !currentId) return;
    e.preventDefault();
    // 恢复右键按下前的选区（右键 mousedown 会清掉单元格/文本选区）
    const snap = ctxSnapshotRef.current;
    if (snap?.sel) {
      const cur = editor.state.selection;
      if (!cur.eq(snap.sel)) {
        editor.view.dispatch(editor.state.tr.setSelection(snap.sel));
      }
    }
    const { state } = editor;
    const sel = state.selection;
    // ① 单元格选区（蓝框选中整格）→ 单元格菜单
    if (sel instanceof CellSelection) {
      setCtxMenu({ kind: "cell", x: e.clientX, y: e.clientY });
      return;
    }
    // ② 文本选区 → 文本菜单（图标行 + 更换字体颜色）
    if (sel instanceof TextSelection && !sel.empty) {
      const selColor = editor.getAttributes("textStyle").color as string | undefined;
      const memory = resolveSetting(EDITOR_PROTOTYPE, instanceId, "textColor") as string | undefined;
      setCtxMenu({
        kind: "text",
        x: e.clientX,
        y: e.clientY,
        stage: "menu",
        value: selColor ?? memory ?? DEFAULT_TEXT_COLOR,
      });
      return;
    }
    // ③ 光标在表格内（无选区）→ 表格菜单
    const tablePos = findTablePos(state);
    if (tablePos != null) {
      setCtxMenu({ kind: "table", x: e.clientX, y: e.clientY });
      return;
    }
    // ④ 空白处：不弹菜单
  };

  // 打开期间：点面板外关闭、Esc 关闭
  useEffect(() => {
    if (!ctxMenu) return;
    const onDown = (e: PointerEvent) => {
      if (popupRef.current?.contains(e.target as Node)) return;
      setCtxMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCtxMenu(null);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [ctxMenu]);

  // —— 图片菜单操作（走节点视图自身回调，与拖拽缩放同机制） ——
  const rotateImage = (delta: number) => {
    if (!ctxMenu || ctxMenu.kind !== "image") return;
    ctxMenu.actions.rotate(delta);
    setCtxMenu(null);
  };

  const deleteImage = () => {
    if (!ctxMenu || ctxMenu.kind !== "image") return;
    ctxMenu.actions.remove();
    setCtxMenu(null);
  };

  if (!editor) {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-fg-muted">
        <span className="size-4 animate-spin rounded-full border-2 border-line border-t-accent" />
        正在研墨…
      </div>
    );
  }

  // 弹窗尺寸（视口钳位用）：按菜单形态估算
  const popupSize = ctxMenu
    ? ctxMenu.kind === "text"
      ? ctxMenu.stage === "picker"
        ? { w: 268, h: 336 }
        : { w: 216, h: 120 }
      : ctxMenu.kind === "cell"
        ? { w: 216, h: 400 }
        : ctxMenu.kind === "table"
          ? { w: 200, h: 252 }
          : { w: 184, h: 136 }
    : null;

  return (
    <div className="flex h-full flex-col">
      <EditorProvider value={editor}>
        <Toolbar />
        <div
          ref={editorPageRef}
          className="editor-page min-h-0 flex-1 overflow-y-auto"
          style={{ "--editor-font-size": `${fontSize}px` } as CSSProperties}
          onContextMenu={handleContextMenu}
        >
          {currentId ? (
            <EditorContent editor={editor} />
          ) : (
            <div className="flex h-full items-center justify-center text-fg-muted">
              请在左侧章节列表选择一章
            </div>
          )}
        </div>
      </EditorProvider>

      {/* 右键菜单（文本/表格/单元格/图片四种形态） */}
      {ctxMenu &&
        popupSize &&
        createPortal(
          <div
            ref={popupRef}
            className="fixed z-50 overflow-hidden rounded-xl border border-line/70 bg-app shadow-pop"
            style={{
              left: Math.min(ctxMenu.x, window.innerWidth - popupSize.w),
              top: Math.min(ctxMenu.y, window.innerHeight - popupSize.h),
            }}
          >
            {/* —— 文本选区菜单：图标行 + 更换字体颜色 —— */}
            {ctxMenu.kind === "text" &&
              (ctxMenu.stage === "menu" ? (
                <>
                  <div className="flex items-center gap-0.5 border-b border-line/60 p-1">
                    <MenuIconButton
                      title="加粗"
                      active={editor.isActive("bold")}
                      onClick={() => {
                        editor.chain().focus().toggleBold().run();
                        setCtxMenu(null);
                      }}
                    >
                      <Bold className="size-4" />
                    </MenuIconButton>
                    <MenuIconButton
                      title="斜体"
                      active={editor.isActive("italic")}
                      onClick={() => {
                        editor.chain().focus().toggleItalic().run();
                        setCtxMenu(null);
                      }}
                    >
                      <Italic className="size-4" />
                    </MenuIconButton>
                    <MenuIconButton
                      title="删除线"
                      active={editor.isActive("strike")}
                      onClick={() => {
                        editor.chain().focus().toggleStrike().run();
                        setCtxMenu(null);
                      }}
                    >
                      <Strikethrough className="size-4" />
                    </MenuIconButton>
                    <MenuIconButton
                      title="清空格式"
                      onClick={() => {
                        editor.chain().focus().unsetAllMarks().run();
                        setCtxMenu(null);
                      }}
                    >
                      <RemoveFormatting className="size-4" />
                    </MenuIconButton>
                  </div>
                  <div className="p-1.5">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setCtxMenu((m) => (m && m.kind === "text" ? { ...m, stage: "picker" } : m))}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-fg transition-colors hover:bg-accent/10 hover:text-accent"
                    >
                      <span className="flex-1">更换字体颜色</span>
                      <ChevronRight className="size-3.5 shrink-0 opacity-60" />
                    </button>
                  </div>
                </>
              ) : (
                // 取色阶段（两阶段面板沿用：拖动实时预览不写文档，提交才写一步撤销）
                <>
                  <div className="flex items-center justify-between border-b border-line/60 px-3 py-2">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setCtxMenu((m) => (m && m.kind === "text" ? { ...m, stage: "menu" } : m))}
                      className="flex items-center gap-1 rounded px-1 py-0.5 text-xs font-medium text-fg transition-colors hover:bg-hover"
                    >
                      <ChevronRight className="size-3 rotate-180" />
                      更换字体颜色
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        editor.chain().focus().unsetColor().run();
                        setCtxMenu(null);
                      }}
                      className="rounded px-1.5 py-0.5 text-xs text-fg-muted transition-colors hover:bg-hover hover:text-fg"
                    >
                      清除颜色
                    </button>
                  </div>
                  <ColorPickerPanel
                    value={ctxMenu.value}
                    onChange={(c) => {
                      // 拖动中只更新弹窗内实时预览，不写入文档 → 不产生撤销步
                      setCtxMenu((m) => (m && m.kind === "text" ? { ...m, value: c } : m));
                    }}
                    onCommit={(c) => {
                      // 松手/点选预设才写一次文档：撤销栈里只留「开始」与「结果」
                      editor.chain().focus().setColor(c).run();
                      useSettingsStore.getState().setInstanceSetting(instanceId, "textColor", c);
                      setCtxMenu((m) => (m && m.kind === "text" ? { ...m, value: c } : m));
                    }}
                  />
                </>
              ))}

            {/* —— 表格菜单（光标在表格内、无选区） —— */}
            {ctxMenu.kind === "table" && (
              <div className="p-1.5">
                <MenuRow
                  icon={ArrowUpToLine}
                  label="最上方添加行"
                  onClick={() => {
                    addRowAtTableEdge(editor, "top");
                    setCtxMenu(null);
                  }}
                />
                <MenuRow
                  icon={ArrowDownToLine}
                  label="最下方添加行"
                  onClick={() => {
                    addRowAtTableEdge(editor, "bottom");
                    setCtxMenu(null);
                  }}
                />
                <MenuSeparator />
                <MenuRow
                  icon={ArrowLeftToLine}
                  label="最左侧添加列"
                  onClick={() => {
                    addColumnAtTableEdge(editor, "left");
                    setCtxMenu(null);
                  }}
                />
                <MenuRow
                  icon={ArrowRightToLine}
                  label="最右侧添加列"
                  onClick={() => {
                    addColumnAtTableEdge(editor, "right");
                    setCtxMenu(null);
                  }}
                />
                <MenuSeparator />
                <MenuRow
                  icon={Trash2}
                  label="删除表格"
                  danger
                  onClick={() => {
                    editor.chain().focus().deleteTable().run();
                    setCtxMenu(null);
                  }}
                />
              </div>
            )}

            {/* —— 单元格菜单（CellSelection 蓝框选格） —— */}
            {ctxMenu.kind === "cell" && (
              <div className="p-1.5">
                <div className="mb-1.5 flex items-center gap-0.5 border-b border-line/60 pb-1.5">
                  <MenuIconButton
                    title="加粗"
                    active={editor.isActive("bold")}
                    onClick={() => {
                      editor.chain().focus().toggleBold().run();
                      setCtxMenu(null);
                    }}
                  >
                    <Bold className="size-4" />
                  </MenuIconButton>
                  <MenuIconButton
                    title="斜体"
                    active={editor.isActive("italic")}
                    onClick={() => {
                      editor.chain().focus().toggleItalic().run();
                      setCtxMenu(null);
                    }}
                  >
                    <Italic className="size-4" />
                  </MenuIconButton>
                  <MenuIconButton
                    title="删除线"
                    active={editor.isActive("strike")}
                    onClick={() => {
                      editor.chain().focus().toggleStrike().run();
                      setCtxMenu(null);
                    }}
                  >
                    <Strikethrough className="size-4" />
                  </MenuIconButton>
                  <MenuIconButton
                    title="清空所选内容"
                    onClick={() => {
                      clearCellSelectionContent(editor);
                      setCtxMenu(null);
                    }}
                  >
                    <Eraser className="size-4" />
                  </MenuIconButton>
                </div>
                <MenuRow
                  icon={Combine}
                  label="合并单元格"
                  disabled={!editor.can().mergeCells()}
                  onClick={() => {
                    editor.chain().focus().mergeCells().run();
                    setCtxMenu(null);
                  }}
                />
                <MenuRow
                  icon={Split}
                  label="拆分单元格"
                  disabled={!editor.can().splitCell()}
                  onClick={() => {
                    editor.chain().focus().splitCell().run();
                    setCtxMenu(null);
                  }}
                />
                <MenuSeparator />
                <MenuRow
                  icon={Trash2}
                  label="删除所选行"
                  danger
                  onClick={() => {
                    editor.chain().focus().deleteRow().run();
                    setCtxMenu(null);
                  }}
                />
                <MenuRow
                  icon={Trash2}
                  label="删除所选列"
                  danger
                  onClick={() => {
                    editor.chain().focus().deleteColumn().run();
                    setCtxMenu(null);
                  }}
                />
                <MenuSeparator />
                <MenuRow
                  icon={ArrowLeftToLine}
                  label="左侧添加列"
                  onClick={() => {
                    editor.chain().focus().addColumnBefore().run();
                    setCtxMenu(null);
                  }}
                />
                <MenuRow
                  icon={ArrowRightToLine}
                  label="右侧添加列"
                  onClick={() => {
                    editor.chain().focus().addColumnAfter().run();
                    setCtxMenu(null);
                  }}
                />
                <MenuRow
                  icon={ArrowDownToLine}
                  label="下方添加行"
                  onClick={() => {
                    editor.chain().focus().addRowAfter().run();
                    setCtxMenu(null);
                  }}
                />
                <MenuRow
                  icon={ArrowUpToLine}
                  label="上方添加行"
                  onClick={() => {
                    editor.chain().focus().addRowBefore().run();
                    setCtxMenu(null);
                  }}
                />
              </div>
            )}

            {/* —— 图片菜单 —— */}
            {ctxMenu.kind === "image" && (
              <div className="p-1.5">
                <MenuRow icon={Trash2} label="删除图片" danger onClick={deleteImage} />
                <MenuRow icon={RotateCw} label="顺时针旋转 90°" onClick={() => rotateImage(90)} />
                <MenuRow icon={RotateCcw} label="逆时针旋转 90°" onClick={() => rotateImage(-90)} />
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
