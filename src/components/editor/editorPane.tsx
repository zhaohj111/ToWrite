// 正文编辑器（core.editor 主视图）：TipTap + StarterKit，纸张质感。
// 状态按插件实例隔离：通过 useEditorInstance / useEditorSlice 读取属于本实例的章节与内容。

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, type CSSProperties } from "react";
import { Toolbar } from "@/components/editor/toolbar";
import { EditorProvider } from "@/components/editor/editorContext";
import { useEditorInstance, useEditorSlice } from "@/components/editor/editorInstanceContext";
import { useEditorStore } from "@/stores/editorStore";
import { setActiveEditor } from "@/lib/editorBus";
import { emptyChapterDoc } from "@/types/writeproj";

export function EditorPane() {
  const instanceId = useEditorInstance();
  const slice = useEditorSlice();
  const { currentChapterId: currentId, contents, chapters } = slice;
  // 字号按实例隔离：实例未单独设置时回退程序级默认字号
  const fontSizes = useEditorStore((s) => s.fontSizes);
  const defaultFontSize = useEditorStore((s) => s.defaultFontSize);
  const fontSize = fontSizes[instanceId] ?? defaultFontSize;
  const prevIdRef = useRef<string | null>(null);

  const editor = useEditor({
    extensions: [StarterKit],
    content: currentId ? contents[currentId] ?? emptyChapterDoc() : emptyChapterDoc(),
    editable: !!currentId,
    onUpdate: ({ editor: instance }) => {
      const st = useEditorStore.getState();
      const cur = st.getSlice(instanceId);
      if (cur.currentChapterId) st.setContent(instanceId, cur.currentChapterId, instance.getJSON());
    },
    editorProps: {
      attributes: { class: "h-full" },
    },
  });

  // 挂载时把当前编辑器注册到 editorBus（按实例），供大纲等侧边栏定位跳转
  useEffect(() => {
    if (!editor) return;
    setActiveEditor(instanceId, editor);
    return () => setActiveEditor(instanceId, null);
  }, [editor, instanceId]);

  // 切换章节时载入对应内容（用 prevIdRef 防止每次输入触发重载）
  useEffect(() => {
    if (!editor || prevIdRef.current === currentId) return;
    prevIdRef.current = currentId;
    const doc = currentId ? contents[currentId] ?? emptyChapterDoc() : emptyChapterDoc();
    editor.commands.setContent(doc, false);
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

  if (!editor) {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-fg-muted">
        <span className="size-4 animate-spin rounded-full border-2 border-line border-t-accent" />
        正在研墨…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <EditorProvider value={editor}>
        <Toolbar />
        <div
          className="editor-page min-h-0 flex-1 overflow-y-auto"
          style={{ "--editor-font-size": `${fontSize}px` } as CSSProperties}
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
    </div>
  );
}
