// 表格列宽拖拽（替代 prosemirror-tables 内置 columnResizing）。
//
// 动机：内置 columnResizing 通过 posAtCoords → caretRangeFromPoint 把鼠标坐标映射回文档位置，
// 在空 cell 靠近边框的命中区域（不同 WebView2 / DPI 下）可能被浏览器归一化到行首，
// 导致「拖哪条竖线都在改第一格右侧的线」。这里改为基于元素判定：
//   - hover 用 domCellAround(event.target)（浏览器自身的命中测试，可靠）；
//   - 列索引用 view.posAtDOM(cellEl) + TableMap（元素身份映射，确定性），不依赖坐标；
//   - 拖拽时仅用 clientX 增量计算宽度。
//
// 与内置 columnResizing 的另一关键区别：内置只写「被拖拽那一列」的宽度，其余列保持未设宽。
// 在 table-layout:fixed + width:100% 下，未设宽的列会平分剩余空间——于是拖 A/B 分界线时 C 列
// 也跟着变（刚插入、尚无 colwidth 时最明显）。本实现改为「相邻列吸收」模型：
//   - mousedown 时快照所有列宽；
//   - 拖动中只改目标列与其右邻列（其余列像素不变），总宽恒定；
//   - 落定时把整张表所有列宽写回 colwidth（一次性物化），此后表格布局稳定、导出也一致。
//
// 同时解决 tiptap 的已知问题：Table.addProseMirrorPlugins 用 editor.isEditable 一次性判定是否注册
// columnResizing，编辑器先以只读态创建、后续再可编辑时插件缺失导致完全无法拖列宽。
// 本插件始终注册，仅在 view.editable 为 true 时响应事件，只读态自然停用。

import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Node } from "@tiptap/pm/model";
import {
  TableMap,
  TableView,
  cellAround,
  tableNodeTypes,
} from "@tiptap/pm/tables";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

export interface ColumnResizeFixOptions {
  /** 边框命中阈值（px），与内置 handleWidth 一致 */
  handleWidth?: number;
  /** 列宽下限（px），与内置 cellMinWidth 一致 */
  cellMinWidth?: number;
  /** 最后一列右侧是否允许拖拽（内置 lastColumnResizable） */
  lastColumnResizable?: boolean;
}

interface DraggingState {
  startX: number;
  startWidth: number; // 被拖列在拖拽起点的宽度
  col: number; // 被拖列（其右边界为拖动线）
  colWidths: number[]; // 拖拽起点的整表列宽快照
  absorbCol: number; // 吸收宽度变化的那一列（右邻）；最后一列右边线为 -1
}

interface ResizeFixState {
  activeCol: number; // 当前悬停将改宽的列（右侧边框所在列）；-1 = 无
  activeCell: number; // activeCol 所在行的 cell 文档位置（读宽度用）
  start: number; // 表格内容起点（表格节点位置 + 1）
  dragging: DraggingState | null;
}

const EMPTY: ResizeFixState = { activeCol: -1, activeCell: -1, start: -1, dragging: null };

const resizeKey = new PluginKey<ResizeFixState>("tableColumnResizeFix");

/** 从事件目标向上找到 cell 元素（td/th），找不到返回 null */
function domCellAround(target: EventTarget | null): HTMLElement | null {
  let cur = target as HTMLElement | null;
  while (cur && cur.nodeName !== "TD" && cur.nodeName !== "TH") {
    if (cur.classList?.contains("ProseMirror")) return null;
    cur = cur.parentElement;
  }
  return cur;
}

/**
 * 由 cell 元素求其列信息：元素身份 → 文档位置（view.posAtDOM，确定性）→ TableMap 列号。
 * 返回 { col, cellPos, start, map }；start 为表格内容起点。
 */
function cellInfo(view: EditorView, cellEl: HTMLElement) {
  try {
    const pos = view.posAtDOM(cellEl, 0);
    if (pos < 0) return null;
    const $cell = cellAround(view.state.doc.resolve(pos));
    if (!$cell) return null;
    const table = $cell.node(-1);
    const map = TableMap.get(table);
    const start = $cell.start(-1);
    return { col: map.colCount($cell.pos - start), cellPos: $cell.pos, start, map };
  } catch {
    return null;
  }
}

/** 悬停检测：返回本次应激活的列（无则返回 null）。 */
function detect(view: EditorView, event: MouseEvent, handleWidth: number, lastColumnResizable: boolean): ResizeFixState | null {
  const cellEl = domCellAround(event.target);
  if (!cellEl) return null;
  const rect = cellEl.getBoundingClientRect();
  const nearLeft = event.clientX - rect.left <= handleWidth;
  const nearRight = rect.right - event.clientX <= handleWidth;
  if (!nearLeft && !nearRight) return null;
  const info = cellInfo(view, cellEl);
  if (!info) return null;
  try {
    const cell = view.state.doc.nodeAt(info.cellPos);
    if (!cell) return null;
    const colspan = cell.attrs.colspan ?? 1;
    const rowEl = cellEl.parentElement;
    if (!rowEl?.parentElement) return null;
    const row = Array.from(rowEl.parentElement.children).indexOf(rowEl);
    if (row < 0) return null;

    // 左侧边框：改宽的是左边一列；列首（col 0）左边缘无边框可拖
    const targetCol = nearLeft ? info.col - 1 : info.col + colspan - 1;
    if (targetCol < 0) return null;
    if (!lastColumnResizable && targetCol === info.map.width - 1) return null;
    const cellOffset = info.map.map[row * info.map.width + targetCol];
    if (cellOffset == null) return null;
    return { activeCol: targetCol, activeCell: info.start + cellOffset, start: info.start, dragging: null };
  } catch (e) {
    console.error("[tblfix] detect error:", e);
    return null;
  }
}

/** 快照整表当前列宽（读 colgroup 的 <col> 实测宽度；WebView2 下可靠）。 */
function snapshotColumnWidths(view: EditorView, start: number, colCount: number): number[] | null {
  let dom = view.domAtPos(start).node as Element | null;
  while (dom && dom.nodeName !== "TABLE") dom = dom.parentElement;
  if (!dom) return null;
  const table = dom as HTMLTableElement;
  const colgroup = table.firstChild as HTMLTableColElement | null;
  const widths: number[] = [];
  if (colgroup) {
    for (let i = 0; i < colCount; i++) {
      const col = colgroup.childNodes[i] as HTMLElement | undefined;
      widths.push(col ? Math.round(col.getBoundingClientRect().width) : 0);
    }
  }
  // 兜底：colgroup 缺失或某列宽为 0 时，用首行单元格实测（仅 colspan=1 时可靠，非常规路径）
  if (widths.some((w) => w <= 0)) {
    const tr = table.querySelector("tbody tr");
    if (tr) {
      for (let i = 0; i < colCount; i++) {
        const td = tr.children[i] as HTMLElement | undefined;
        if (td && widths[i] <= 0) widths[i] = td.offsetWidth || 0;
      }
    }
  }
  return widths.some((w) => w > 0) ? widths : null;
}

/** 由拖拽状态与横向位移算出新的整表列宽：目标列改宽、右邻列吸收差值，其余列不变。 */
function applyDrag(d: DraggingState, delta: number, cellMinWidth: number): number[] {
  const widths = d.colWidths.slice();
  // 目标列上限：确保右邻列不低于 cellMinWidth
  const max = d.absorbCol >= 0 ? d.startWidth + d.colWidths[d.absorbCol] - cellMinWidth : Infinity;
  const w = Math.min(max, Math.max(cellMinWidth, d.startWidth + delta));
  widths[d.col] = w;
  if (d.absorbCol >= 0) {
    widths[d.absorbCol] = Math.max(cellMinWidth, d.colWidths[d.absorbCol] + (d.startWidth - w));
  }
  return widths;
}

/** 拖拽过程中实时写全部 <col> 宽度（物化所有列，避免浏览器平分未设宽列）。 */
function displayColumnWidths(view: EditorView, start: number, widths: number[]) {
  let dom = view.domAtPos(start).node as Element | null;
  while (dom && dom.nodeName !== "TABLE") dom = dom.parentElement;
  if (!dom) return;
  const table = dom as HTMLTableElement;
  const colgroup = table.firstChild as HTMLTableColElement | null;
  if (!colgroup) return;
  while (colgroup.childNodes.length < widths.length) colgroup.appendChild(document.createElement("col"));
  while (colgroup.childNodes.length > widths.length) colgroup.removeChild(colgroup.lastChild!);
  let total = 0;
  for (let i = 0; i < widths.length; i++) {
    (colgroup.childNodes[i] as HTMLElement).style.width = `${widths[i]}px`;
    total += widths[i];
  }
  table.style.width = `${total}px`;
  table.style.minWidth = "";
}

/** 把整表列宽写回每个 cell 的 colwidth（物化布局，含 rowspan/colspan 展开）。 */
function setColumnWidths(view: EditorView, start: number, widths: number[]) {
  const table = view.state.doc.nodeAt(start - 1);
  if (!table) return false;
  const map = TableMap.get(table);
  const tr = view.state.tr;
  for (let row = 0; row < map.height; row++) {
    for (let col = 0; col < map.width; col++) {
      const mapIndex = row * map.width + col;
      const pos = map.map[mapIndex];
      if (col > 0 && pos === map.map[mapIndex - 1]) continue; // colspan 同格
      if (row > 0 && pos === map.map[mapIndex - map.width]) continue; // rowspan 同格
      const cell = table.nodeAt(pos);
      if (!cell) continue;
      const attrs = cell.attrs;
      const colspan: number = attrs.colspan ?? 1;
      const colwidth: number[] = [];
      for (let j = 0; j < colspan; j++) colwidth.push(Math.round(widths[col + j]) || 0);
      const prev = attrs.colwidth as number[] | null;
      const same = !!prev && prev.length === colwidth.length && prev.every((v, k) => v === colwidth[k]);
      if (same) continue;
      tr.setNodeMarkup(start + pos, null, { ...attrs, colwidth });
    }
  }
  if (!tr.docChanged) return false;
  view.dispatch(tr);
  return true;
}

/** 在 activeCol 右侧边框（每行不参与合并的 cell）渲染拖拽手柄 */
function resizeFixDecorations(doc: Node, state: ResizeFixState) {
  if (state.activeCol < 0 || state.start < 0) return DecorationSet.empty;
  const table = doc.nodeAt(state.start - 1);
  if (!table) return DecorationSet.empty;
  const map = TableMap.get(table);
  const { activeCol: col, start, dragging } = state;
  const decorations = [];
  for (let row = 0; row < map.height; row++) {
    const index = col + row * map.width;
    if ((col == map.width - 1 || map.map[index] != map.map[index + 1]) && (row == 0 || map.map[index] != map.map[index - map.width])) {
      const cellPos = map.map[index];
      const cell = table.nodeAt(cellPos);
      if (!cell) continue;
      const cellSize = cell.nodeSize;
      const pos = start + cellPos + cellSize - 1;
      const dom = document.createElement("div");
      dom.className = "column-resize-handle";
      if (dragging) {
        decorations.push(Decoration.node(start + cellPos, start + cellPos + cellSize, { class: "column-resize-dragging" }));
      }
      decorations.push(Decoration.widget(pos, dom));
    }
  }
  return DecorationSet.create(doc, decorations);
}

/** 注册列宽拖拽插件；与内置 columnResizing 同职责，但列判定基于元素、与是否可编辑无关 */
export function columnResizeFix(options: ColumnResizeFixOptions = {}) {
  const handleWidth = options.handleWidth ?? 5;
  const cellMinWidth = options.cellMinWidth ?? 25;
  const lastColumnResizable = options.lastColumnResizable ?? true;

  const plugin = new Plugin<ResizeFixState>({
    key: resizeKey,
    state: {
      init: (_, state) => {
        // 与内置 columnResizing 相同：把 TableView 注入 nodeViews。
        // TableView 负责渲染 <colgroup> 且 ignoreMutation 会忽略 table/colgroup 的样式变更，
        // 否则拖拽中实时改列宽会被 prosemirror 的 MutationObserver 当作内容变更回滚
        // （表现为「很僵硬、松手才生效」）。
        const nodeViews = plugin.spec.props?.nodeViews as Record<string, Function> | undefined;
        if (nodeViews) {
          const tableName = tableNodeTypes(state.schema).table.name;
          nodeViews[tableName] = (node: Node) => new TableView(node, cellMinWidth);
        }
        return { ...EMPTY };
      },
      apply: (tr, prev) => {
        const meta = tr.getMeta(resizeKey);
        if (meta) return meta;
        if (prev.dragging && tr.docChanged) return { ...EMPTY };
        return prev;
      },
    },
    props: {
      nodeViews: {},
      attributes: (state) => {
        const s = resizeKey.getState(state);
        const attrs: Record<string, string> = {};
        if (s && s.activeCol > -1) attrs.class = "resize-cursor";
        return attrs;
      },
      decorations: (state) => {
        const s = resizeKey.getState(state);
        if (!s || s.activeCol < 0) return DecorationSet.empty;
        return resizeFixDecorations(state.doc, s);
      },
      handleDOMEvents: {
        mousemove: (view, event) => {
          try {
            if (!view.editable) return false;
            const prev = resizeKey.getState(view.state);
            if (prev?.dragging) return false;
            const next = detect(view, event, handleWidth, lastColumnResizable);
            if (next) {
              if (!prev || prev.activeCol !== next.activeCol || prev.activeCell !== next.activeCell) {
                view.dispatch(view.state.tr.setMeta(resizeKey, next));
              }
            } else if (prev && prev.activeCol > -1) {
              view.dispatch(view.state.tr.setMeta(resizeKey, { ...EMPTY }));
            }
          } catch (e) {
            console.error("[tblfix] mousemove error:", e);
          }
          return false;
        },
        mouseleave: (view) => {
          if (!view.editable) return false;
          const prev = resizeKey.getState(view.state);
          if (prev && prev.activeCol > -1 && !prev.dragging) view.dispatch(view.state.tr.setMeta(resizeKey, { ...EMPTY }));
          return false;
        },
        mousedown: (view, event) => {
          if (!view.editable) return false;
          const s = resizeKey.getState(view.state);
          if (!s || s.activeCol < 0 || s.dragging) return false;
          const table = view.state.doc.nodeAt(s.start - 1);
          if (!table) return false;
          const map = TableMap.get(table);
          const colWidths = snapshotColumnWidths(view, s.start, map.width);
          if (!colWidths || colWidths[s.activeCol] <= 0) return false;
          view.dispatch(
            view.state.tr.setMeta(resizeKey, {
              ...s,
              dragging: {
                startX: event.clientX,
                startWidth: colWidths[s.activeCol],
                col: s.activeCol,
                colWidths,
                absorbCol: s.activeCol < map.width - 1 ? s.activeCol + 1 : -1,
              },
            }),
          );

          const finish = (ev: MouseEvent) => {
            window.removeEventListener("mouseup", finish);
            window.removeEventListener("mousemove", move);
            const cur = resizeKey.getState(view.state);
            if (cur?.dragging) {
              const widths = applyDrag(cur.dragging, ev.clientX - cur.dragging.startX, cellMinWidth);
              setColumnWidths(view, cur.start, widths);
              view.dispatch(view.state.tr.setMeta(resizeKey, { ...cur, dragging: null }));
            }
          };
          const move = (ev: MouseEvent) => {
            if (!ev.which) return finish(ev);
            const cur = resizeKey.getState(view.state);
            if (!cur?.dragging) return;
            const widths = applyDrag(cur.dragging, ev.clientX - cur.dragging.startX, cellMinWidth);
            displayColumnWidths(view, cur.start, widths);
          };
          window.addEventListener("mouseup", finish);
          window.addEventListener("mousemove", move);
          event.preventDefault();
          return true;
        },
      },
    },
  });

  return plugin;
}
