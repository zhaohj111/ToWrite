// core.editor —— 重型模块插件：TipTap 章节正文编辑器。
// 冻结 .writeproj 的 chapters/ 文档数据格式（TipTap JSON），并注册首批贡献点。

import {
  Bold,
  Code,
  FileText,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
} from "lucide-react";
import type { ModuleContract } from "@/types/plugin";
import { EditorPane } from "@/components/editor/editorPane";
import { ChapterSidebar } from "@/components/editor/chapterSidebar";
import { OutlineSidebar } from "@/components/editor/outlineSidebar";

export const coreEditorModule: ModuleContract = {
  id: "core.editor",
  name: "正文编辑器",
  description: "官方重型模块：章节正文编辑，冻结 chapters/ 的 TipTap JSON 格式。",
  kind: "heavy",
  enabled: true,
  views: {
    activityBar: { id: "editor", label: "正文", icon: FileText },
    // 两个侧边栏变体：正文实例选 chapters（章节树），大纲实例选 outline（标题大纲）
    sidebars: [
      { id: "chapters", title: "章节", component: ChapterSidebar },
      { id: "outline", title: "大纲", component: OutlineSidebar },
    ],
    mainView: { id: "editor", title: "正文", component: EditorPane },
  },
  activate: (ctx) => {
    // ---- editor.toolbar 贡献点 ----
    ctx.registerContribution("editor.toolbar", {
      id: "bold",
      title: "加粗",
      icon: Bold,
      isActive: ({ editor }) => editor.isActive("bold"),
      action: ({ editor }) => editor.chain().focus().toggleBold().run(),
    });
    ctx.registerContribution("editor.toolbar", {
      id: "italic",
      title: "斜体",
      icon: Italic,
      isActive: ({ editor }) => editor.isActive("italic"),
      action: ({ editor }) => editor.chain().focus().toggleItalic().run(),
    });
    ctx.registerContribution("editor.toolbar", {
      id: "strike",
      title: "删除线",
      icon: Strikethrough,
      isActive: ({ editor }) => editor.isActive("strike"),
      action: ({ editor }) => editor.chain().focus().toggleStrike().run(),
    });
    ctx.registerContribution("editor.toolbar", {
      id: "divider-1",
      title: "",
      icon: Bold,
      divider: true,
      action: () => {},
    });
    ctx.registerContribution("editor.toolbar", {
      id: "heading1",
      title: "标题 1",
      icon: Heading1,
      isActive: ({ editor }) => editor.isActive("heading", { level: 1 }),
      action: ({ editor }) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    });
    ctx.registerContribution("editor.toolbar", {
      id: "heading2",
      title: "标题 2",
      icon: Heading2,
      isActive: ({ editor }) => editor.isActive("heading", { level: 2 }),
      action: ({ editor }) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    });
    ctx.registerContribution("editor.toolbar", {
      id: "divider-2",
      title: "",
      icon: Bold,
      divider: true,
      action: () => {},
    });
    ctx.registerContribution("editor.toolbar", {
      id: "bullet-list",
      title: "无序列表",
      icon: List,
      isActive: ({ editor }) => editor.isActive("bulletList"),
      action: ({ editor }) => editor.chain().focus().toggleBulletList().run(),
    });
    ctx.registerContribution("editor.toolbar", {
      id: "ordered-list",
      title: "有序列表",
      icon: ListOrdered,
      isActive: ({ editor }) => editor.isActive("orderedList"),
      action: ({ editor }) => editor.chain().focus().toggleOrderedList().run(),
    });
    ctx.registerContribution("editor.toolbar", {
      id: "blockquote",
      title: "引用",
      icon: Quote,
      isActive: ({ editor }) => editor.isActive("blockquote"),
      action: ({ editor }) => editor.chain().focus().toggleBlockquote().run(),
    });
    ctx.registerContribution("editor.toolbar", {
      id: "code-block",
      title: "代码块",
      icon: Code,
      isActive: ({ editor }) => editor.isActive("codeBlock"),
      action: ({ editor }) => editor.chain().focus().toggleCodeBlock().run(),
    });
    ctx.registerContribution("editor.toolbar", {
      id: "divider-3",
      title: "",
      icon: Bold,
      divider: true,
      action: () => {},
    });
    ctx.registerContribution("editor.toolbar", {
      id: "undo",
      title: "撤销",
      icon: Undo2,
      action: ({ editor }) => editor.chain().focus().undo().run(),
    });
    ctx.registerContribution("editor.toolbar", {
      id: "redo",
      title: "重做",
      icon: Redo2,
      action: ({ editor }) => editor.chain().focus().redo().run(),
    });

    // ---- editor.commands 贡献点 ----
    ctx.registerContribution("editor.commands", {
      id: "clear-format",
      title: "清空格式",
      keywords: ["clear", "格式", "清除"],
      run: ({ editor }) => editor.chain().focus().unsetAllMarks().clearNodes().run(),
    });
    ctx.registerContribution("editor.commands", {
      id: "insert-hr",
      title: "插入分隔线",
      keywords: ["hr", "分割线", "分隔"],
      run: ({ editor }) => editor.chain().focus().setHorizontalRule().run(),
    });

    // ---- editor.hoverActions 贡献点（v0.9 将挂载 AI 润色/扩写等）----
    ctx.registerContribution("editor.hoverActions", {
      id: "quote-selection",
      title: "引用选中",
      icon: Quote,
      run: ({ editor }) => editor.chain().focus().toggleBlockquote().run(),
    });

    // ---- editor.blockTypes 贡献点 ----
    ctx.registerContribution("editor.blockTypes", { name: "paragraph", title: "正文段落" });
    ctx.registerContribution("editor.blockTypes", { name: "heading1", title: "标题 1" });
    ctx.registerContribution("editor.blockTypes", { name: "heading2", title: "标题 2" });
    ctx.registerContribution("editor.blockTypes", { name: "blockquote", title: "引用" });
    ctx.registerContribution("editor.blockTypes", { name: "codeBlock", title: "代码块" });

    // ---- i18n.resources / theme 贡献点（骨架）----
    ctx.registerContribution("i18n.resources", {
      locale: "zh-CN",
      resources: { "app.name": "拓文 / ToWrite", "app.version": "0.5.0" },
    });
    ctx.registerContribution("theme", {
      id: "ink",
      name: "墨色（默认）",
      colors: { background: "#0a0c11", foreground: "#e4e2da", accent: "#d7b25c" },
    });
  },
};
