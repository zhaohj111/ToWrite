// 编辑器上下文：把当前 Editor 实例提供给贡献点渲染的工具栏/命令等。

import { createContext, useContext } from "react";
import type { Editor } from "@tiptap/react";

const EditorContext = createContext<Editor | null>(null);

export const EditorProvider = EditorContext.Provider;

export function useEditorCtx(): Editor {
  const editor = useContext(EditorContext);
  if (!editor) throw new Error("useEditorCtx 必须在 EditorProvider 内使用");
  return editor;
}
