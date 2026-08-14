// 编辑器扩展集（core.editor 0.7）：StarterKit + 字体颜色 + 图片 + 表格。
// 编辑器的 useEditor 与文件导入导出（Markdown 解析 schema）共用同一份扩展集，
// 保证「编辑器里能表达的内容」在导入/导出时 schema 一致。

import StarterKit from "@tiptap/starter-kit";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { tableEditing } from "@tiptap/pm/tables";
import { ResizableImage } from "@/components/editor/resizableImage";
import { columnResizeFix } from "@/components/editor/tableResize";

// 表格扩展：用自研列宽拖拽插件替换内置 columnResizing。
//   - 内置插件的列判定走 posAtCoords（坐标→文档位置），在空 cell 边框命中区域可能被浏览器
//     归一化到行首，表现为「拖哪条竖线都在改第一格」。自研插件改为元素身份判定，见 tableResize.ts。
//   - tiptap 用 editor.isEditable 一次性决定是否注册 columnResizing；编辑器先只读后可编辑时
//     插件缺失导致完全无法拖列宽。这里忽略该判定、始终注册（插件内部按 view.editable 自停用）。
const ResizableTable = Table.extend({
  addProseMirrorPlugins() {
    const o = this.options as {
      resizable: boolean;
      cellMinWidth?: number;
      lastColumnResizable?: boolean;
      allowTableNodeSelection?: boolean;
    };
    const plugins = [];
    if (o.resizable) {
      plugins.push(
        columnResizeFix({
          cellMinWidth: o.cellMinWidth ?? 25,
          lastColumnResizable: o.lastColumnResizable ?? true,
        }),
      );
    }
    plugins.push(tableEditing({ allowTableNodeSelection: o.allowTableNodeSelection ?? false }));
    return plugins;
  },
});

export const editorExtensions = [
  StarterKit,
  TextStyle,
  Color,
  ResizableImage,
  ResizableTable.configure({ resizable: true }),
  TableRow,
  TableCell,
  TableHeader,
];
