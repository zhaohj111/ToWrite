# 正文编辑器

官方重型模块：章节正文编辑能力，冻结 `chapters/` 目录的 TipTap JSON 文档格式。

## 能力

- **章节正文**：全文编辑、撤销 / 重做、格式工具栏
- **大纲视图**：由标题层级自动生成章节大纲
- **贡献点**：`editor.toolbar` / `editor.commands` / `editor.hoverActions` / `editor.blockTypes` / `i18n.resources` / `theme`

## 兼容性

- 文档格式与 `formatVersion` 绑定，跨版本稳定
- 编辑器快捷键作用域：`plugin:core.editor`（改绑见本插件「配置」tab）
