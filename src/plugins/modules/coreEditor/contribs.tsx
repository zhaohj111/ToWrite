// core.editor —— 贡献点注册（editor.toolbar / commands / hoverActions / blockTypes / i18n / theme）。
// 与模块声明（index.tsx）与导入导出业务（io.ts）解耦；改进程/版本契约只改本文件与 index.tsx。

import {
  Bold,
  Code,
  Download,
  FileDown,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Table2,
  CircleHelp,
  Undo2,
  Upload,
} from "lucide-react";
import type { PluginContext } from "@/types/plugin";
import {
  exportAllChapters,
  exportCurrentChapter,
  importAsNewChapter,
  importToCurrentChapter,
  insertImage,
} from "./io";
import { ToolbarGuideButton } from "@/components/ui/quickGuide";
import { editorGuide } from "./guideData";

/** 注册编辑器全部贡献点（工具栏/命令/悬停操作/块类型/i18n/主题） */
export function registerEditorContribs(ctx: PluginContext): void {
    // ---- editor.toolbar 贡献点（v0.7：撤销/重做置左） ----
    // 操作指引置于最左（与撤销/重做以分隔线隔开）
    ctx.registerContribution("editor.toolbar", {
      id: "guide",
      title: "操作指引（新用户上手）",
      icon: CircleHelp,
      groupId: "toolbarGuide",
      action: () => {},
      render: () => <ToolbarGuideButton data={editorGuide} />,
    });
    ctx.registerContribution("editor.toolbar", {
      id: "divider-guide",
      title: "",
      icon: CircleHelp,
      divider: true,
      action: () => {},
    });
    ctx.registerContribution("editor.toolbar", {
      id: "undo",
      title: "撤销",
      icon: Undo2,
      groupId: "toolbarHistory",
      action: ({ editor }) => editor.chain().focus().undo().run(),
    });
    ctx.registerContribution("editor.toolbar", {
      id: "redo",
      title: "重做",
      icon: Redo2,
      groupId: "toolbarHistory",
      action: ({ editor }) => editor.chain().focus().redo().run(),
    });
    ctx.registerContribution("editor.toolbar", {
      id: "divider-0",
      title: "",
      icon: Bold,
      divider: true,
      action: () => {},
    });
    ctx.registerContribution("editor.toolbar", {
      id: "bold",
      title: "加粗",
      icon: Bold,
      groupId: "toolbarText",
      isActive: ({ editor }) => editor.isActive("bold"),
      action: ({ editor }) => editor.chain().focus().toggleBold().run(),
    });
    ctx.registerContribution("editor.toolbar", {
      id: "italic",
      title: "斜体",
      icon: Italic,
      groupId: "toolbarText",
      isActive: ({ editor }) => editor.isActive("italic"),
      action: ({ editor }) => editor.chain().focus().toggleItalic().run(),
    });
    ctx.registerContribution("editor.toolbar", {
      id: "strike",
      title: "删除线",
      icon: Strikethrough,
      groupId: "toolbarText",
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
      groupId: "toolbarHeading",
      isActive: ({ editor }) => editor.isActive("heading", { level: 1 }),
      action: ({ editor }) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    });
    ctx.registerContribution("editor.toolbar", {
      id: "heading2",
      title: "标题 2",
      icon: Heading2,
      groupId: "toolbarHeading",
      isActive: ({ editor }) => editor.isActive("heading", { level: 2 }),
      action: ({ editor }) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    });
    // v0.8：三级标题
    ctx.registerContribution("editor.toolbar", {
      id: "heading3",
      title: "标题 3",
      icon: Heading3,
      groupId: "toolbarHeading",
      isActive: ({ editor }) => editor.isActive("heading", { level: 3 }),
      action: ({ editor }) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
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
      groupId: "toolbarList",
      isActive: ({ editor }) => editor.isActive("bulletList"),
      action: ({ editor }) => editor.chain().focus().toggleBulletList().run(),
    });
    ctx.registerContribution("editor.toolbar", {
      id: "ordered-list",
      title: "有序列表",
      icon: ListOrdered,
      groupId: "toolbarList",
      isActive: ({ editor }) => editor.isActive("orderedList"),
      action: ({ editor }) => editor.chain().focus().toggleOrderedList().run(),
    });
    ctx.registerContribution("editor.toolbar", {
      id: "blockquote",
      title: "引用",
      icon: Quote,
      groupId: "toolbarQuote",
      isActive: ({ editor }) => editor.isActive("blockquote"),
      action: ({ editor }) => editor.chain().focus().toggleBlockquote().run(),
    });
    ctx.registerContribution("editor.toolbar", {
      id: "code-block",
      title: "代码块",
      icon: Code,
      groupId: "toolbarCode",
      isActive: ({ editor }) => editor.isActive("codeBlock"),
      action: ({ editor }) => editor.chain().focus().toggleCodeBlock().run(),
    });
    // ---- v0.7：图片 / 表格 / 导入导出（颜色入口改右键选中文本，见 editorPane） ----
    ctx.registerContribution("editor.toolbar", {
      id: "image",
      title: "插入图片",
      icon: ImagePlus,
      groupId: "toolbarImage",
      action: ({ editor }) => void insertImage(editor),
    });
    ctx.registerContribution("editor.toolbar", {
      id: "table",
      title: "插入表格",
      icon: Table2,
      groupId: "toolbarTable",
      action: ({ editor }) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      // 仅保留两个插入项；行列增删等操作移至右键菜单（见 editorPane 表格/单元格菜单）
      menu: [
        { title: "插入表格 3×3", icon: Table2, run: ({ editor }) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
        { title: "插入表格 5×3", icon: Table2, run: ({ editor }) => editor.chain().focus().insertTable({ rows: 5, cols: 3, withHeaderRow: true }).run() },
      ],
    });
    ctx.registerContribution("editor.toolbar", {
      id: "divider-5",
      title: "",
      icon: Bold,
      divider: true,
      action: () => {},
    });
    ctx.registerContribution("editor.toolbar", {
      id: "io",
      title: "导入 / 导出",
      icon: Download,
      groupId: "toolbarIO",
      action: ({ editor, instanceId }) => void exportCurrentChapter(instanceId, "txt", editor),
      // 导入导出合并为一个下拉：导出（当前/全部章节 → 格式）+ 导入（当前/新章节）
      menu: [
        {
          title: "导出当前章节",
          icon: FileText,
          children: [
            { title: "TXT", icon: FileText, run: ({ editor, instanceId }) => void exportCurrentChapter(instanceId, "txt", editor) },
            { title: "Markdown", icon: FileText, run: ({ editor, instanceId }) => void exportCurrentChapter(instanceId, "md", editor) },
            { title: "PDF", icon: FileText, run: ({ editor, instanceId }) => void exportCurrentChapter(instanceId, "pdf-image", editor) },
          ],
        },
        {
          title: "导出全部章节",
          icon: FileDown,
          children: [
            { title: "TXT", icon: FileDown, run: ({ editor, instanceId }) => void exportAllChapters(instanceId, "txt", editor) },
            { title: "Markdown", icon: FileDown, run: ({ editor, instanceId }) => void exportAllChapters(instanceId, "md", editor) },
            { title: "PDF", icon: FileDown, run: ({ editor, instanceId }) => void exportAllChapters(instanceId, "pdf-image", editor) },
          ],
        },
        {
          title: "导入到当前章节…",
          icon: FileText,
          run: ({ editor, instanceId }) => void importToCurrentChapter(instanceId, editor),
        },
        {
          title: "导入为新章节…",
          icon: FileDown,
          run: ({ instanceId }) => void importAsNewChapter(instanceId),
        },
      ],
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
    ctx.registerContribution("editor.blockTypes", { name: "heading3", title: "标题 3" });
    ctx.registerContribution("editor.blockTypes", { name: "blockquote", title: "引用" });
    ctx.registerContribution("editor.blockTypes", { name: "codeBlock", title: "代码块" });

    // ---- i18n.resources / theme 贡献点（骨架）----
    ctx.registerContribution("i18n.resources", {
      locale: "zh-CN",
      resources: { "app.name": "拓文 / ToWrite" },
    });
    ctx.registerContribution("theme", {
      id: "ink",
      name: "墨色（默认）",
      colors: { background: "#0a0c11", foreground: "#e4e2da", accent: "#d7b25c" },
    });
}
