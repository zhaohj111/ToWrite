// core.editor —— 重型模块插件：TipTap 章节正文编辑器（模块契约声明）。
// 内容分层：
//   - index.tsx        模块契约/元数据/视图声明（仅声明，不写业务）
//   - contribs.tsx     editor.toolbar / commands / hoverActions / blockTypes / i18n / theme 贡献点
//   - io.ts            导入导出、图片/表格业务
//   - README.md / CHANGELOG.md / settings.json  详情、日志、设置字段（级联默认）
// 冻结 .writeproj 的 chapters/ 文档数据格式（TipTap JSON）。

import { FileText } from "lucide-react";
import type { ModuleContract, SettingFieldDef } from "@/types/plugin";
import editorReadme from "./README.md?raw";
import editorGuide from "./GUIDE.md?raw";
import editorChangelog from "./CHANGELOG.md?raw";
import editorSettings from "./settings.json";
import { EditorPane } from "@/components/editor/editorPane";
import { ChapterSidebar } from "@/components/editor/chapterSidebar";
import { registerEditorContribs } from "./contribs";
import { setEditorPluginCtx } from "./io";

export const coreEditorModule: ModuleContract = {
  id: "core.editor",
  name: "编辑器",
  description: "官方重型模块：章节正文编辑，冻结 chapters/ 的 TipTap JSON 格式。",
  readme: editorReadme,
  guideMd: editorGuide,
  changelogMd: editorChangelog,
  kind: "heavy",
  enabled: true,
  author: "拓文官方",
  version: "0.6.2",
  // 设置字段声明与出厂默认（级联第 ③ 层）在 settings.json
  settings: editorSettings as unknown as Record<string, SettingFieldDef>,
  views: {
    activityBar: { id: "editor", label: "正文", icon: FileText },
    sidebars: [{ id: "chapters", title: "章节", component: ChapterSidebar }],
    mainView: { id: "editor", title: "正文", component: EditorPane },
  },
  activate: (ctx) => {
    // 宿主服务（结果提示等）交给 io 层；全部贡献点注册在 contribs.tsx
    setEditorPluginCtx(ctx);
    registerEditorContribs(ctx);
  },
};