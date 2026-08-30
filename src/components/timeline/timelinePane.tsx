// 时间轴（core.timeline 主视图）：平移/缩放画布 + 水平轴体 + 透明文本标签。
// 交互：
//   - 左键单击标签 -> 仅选中（虚线高亮），不再弹出颜色卡片
//   - 左键双击标签 -> 快速就地编辑文字
//   - 左键拖标签 -> 移动标签；框选后拖动任一选中标签 -> 整体移动
//   - 左键拖空白 -> 平移画布；左键单击空白 -> 取消选中 / 清空框选
//   - 右键空白（点击）-> 在该处新建标签（用工具栏「当前使用颜色」）并就地输入标签文本
//   - 右键空白（按住拖拽）-> 框选矩形内的标签（仿设定库，不显示提示条）
//   - 右键标签 -> 在鼠标位置弹窗：编辑文字 / 替换为当前颜色 / 替换颜色… / 删除（框选多个时含批量操作）
//   - 右键标签「替换颜色…」-> 弹出颜色选择弹窗（图例色 + 自定义取色），可应用到单个或多个选中标签
//   - 滚轮 -> 以光标为中心缩放；左下角缩放控件：放大 / 缩小 / 适应全部
//   - Ctrl/⌘+Z 撤销、Ctrl/⌘+Shift+Z / Ctrl+Y 重做（标签编辑输入框内由输入框自身处理）
// 标签卡片：背景/轮廓透明，文字用所选颜色，垂线从标签顶部/底部中央连接轴体，拖过轴体自动翻转。
// 替换颜色时同时替换标签下方注释（节点 note）为对应图例注释，使“下内容”随颜色一起更新。
// 颜色图例由插件实例内共享（timelineStore 切片级），右上角图例按实例图例展示。
// 右上角图例：最多 5 行、多余另起一列；列数按可用宽度动态上限，避免盖住左上角的时间区间/刻度。

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarRange,
  Download,
  FileImage,
  FileUp,
  Maximize2,
  Minus,
  Paintbrush,
  Palette,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { normalizeDoc, useTimelineStore, DEFAULT_COLOR_LEGEND } from "@/stores/timelineStore";
import { useTimelineUiStore } from "@/stores/timelineUiStore";
import { useInstanceId, useTimelineDoc, useTimelineSlice } from "@/components/editor/editorInstanceContext";
import { registerFitHandler, registerUndoHandler, registerRedoHandler } from "@/lib/timelineBus";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile, writeBinaryFile } from "@/lib/tauri";
import { serializeTimeline, parseTimeline } from "@/lib/fileFormats/timelineFormat";
import { captureElementToPng } from "@/lib/fileFormats/pngExport";
import { notifyError, notifySuccess } from "@/lib/notify";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";
import type { ColorLegendItem, TimelineData, TimelineNodeData } from "@/types/writeproj";

/** 时间单位到世界坐标的像素比例 */
const TIME_SCALE = 100;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;
/** 相邻刻度标签的最小像素间隔（不足则自动加大步长） */
const TICK_MIN_PX = 48;
/** 点阵背景基础间距 */
const DOT_GAP = 22;
/** 图例一列的近似宽度（用于动态列数） */
const LEGEND_COL_WIDTH = 104;
/** 图例最多显示的行数（超出另起一列） */
const LEGEND_ROWS = 5;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

function formatNum(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return String(parseFloat(v.toFixed(2)));
}

/** 等两帧（React 状态 → DOM 布局 → 绘制），供截图导出前等待视图切换生效 */
function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/** 右键菜单仿 Windows：尽量贴住鼠标，超出右/下边缘时内收 */
function clampMenu(x: number, y: number, w: number, h: number) {
  return {
    left: Math.min(Math.max(x, 4), window.innerWidth - w - 4),
    top: Math.min(Math.max(y, 4), window.innerHeight - h - 4),
  };
}

// —— HSV/HEX 转换（取色面板用）——
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  if (Number.isNaN(n)) return [200, 69, 44];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.round(Math.min(Math.max(v, 0), 255)).toString(16).padStart(2, "0"))
      .join("")
  );
}
function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const [r0, g0, b0] = hexToRgb(hex);
  const r = r0 / 255;
  const g = g0 / 255;
  const b = b0 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}
function hsvToHex(h: number, s: number, v: number): string {
  h = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

export function TimelinePane() {
  const instanceId = useInstanceId();
  const slice = useTimelineSlice();
  const docRaw = useTimelineDoc();
  const addFile = useTimelineStore((s) => s.addFile);
  const fileId = slice.currentFileId;
  const doc = docRaw ? normalizeDoc(docRaw) : null;

  if (!fileId || !doc) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-fg-muted">
        <CalendarRange className="size-8 opacity-50" />
        <p className="text-sm">还没有时间轴文件</p>
        <button
          onClick={() => addFile(instanceId, "时间轴")}
          className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          新建时间轴
        </button>
      </div>
    );
  }

  return <TimelineCanvas instanceId={instanceId} fileId={fileId} doc={doc} />;
}

function TimelineCanvas({
  instanceId,
  fileId,
  doc,
}: {
  instanceId: string;
  fileId: string;
  doc: TimelineData;
}) {
  const addNode = useTimelineStore((s) => s.addNode);
  const updateNode = useTimelineStore((s) => s.updateNode);
  const deleteNode = useTimelineStore((s) => s.deleteNode);
  const moveNode = useTimelineStore((s) => s.moveNode);
  const setRange = useTimelineStore((s) => s.setRange);
  const setTickStep = useTimelineStore((s) => s.setTickStep);
  const setLegendHidden = useTimelineStore((s) => s.setLegendHidden);
  const record = useTimelineStore((s) => s.record);
  const legendVisible = useTimelineUiStore((s) => s.legendVisible);

  // 图例跨实例共享：从切片读取（而非单文件文档）
  const slice = useTimelineSlice();
  const colorLegend = slice.colorLegend ?? DEFAULT_COLOR_LEGEND;
  // 当前使用颜色：工具栏「颜色管理」面板中选取，新建标签/替换颜色时使用
  const currentColor =
    useTimelineUiStore((s) => s.currentColors[instanceId]) ??
    colorLegend[0]?.color ??
    DEFAULT_COLOR_LEGEND[0].color;

  // —— v0.7：导出（.timeline / .png）与导入（.timeline）——
  const [ioBusy, setIoBusy] = useState(false);
  const exportTimeline = async (kind: "timeline" | "png") => {
    const fileMeta = slice.files.find((f) => f.id === fileId);
    const title = fileMeta?.title ?? "时间轴";
    const path = await save({
      title: kind === "png" ? "导出时间轴 PNG" : "导出时间轴",
      defaultPath: `${title}.${kind}`,
      filters:
        kind === "png"
          ? [{ name: "PNG 图片", extensions: ["png"] }]
          : [{ name: "时间轴文件", extensions: ["timeline"] }],
    });
    if (!path) return;
    setIoBusy(true);
    try {
      if (kind === "png") {
        // 截图式导出：先「适应全部」让全局图进入视口，截取应用内实际 DOM，无论成败都还原视图
        const el = viewportRef.current;
        if (!el) {
          notifyError("导出时间轴 PNG 失败", "画布未就绪，请重试。");
          return;
        }
        const prev = viewRef.current;
        const fitView = computeFitView();
        if (fitView) setView(fitView);
        try {
          await waitForPaint();
          const target = viewportRef.current;
          if (!target) {
            notifyError("导出时间轴 PNG 失败", "画布未就绪，请重试。");
            return;
          }
          const base64 = await captureElementToPng(target);
          await writeBinaryFile(path, base64);
        } finally {
          if (fitView) setView(prev);
        }
        notifySuccess(`已导出时间轴「${title}」PNG`, path, path);
      } else {
        const data = { ...doc, colorLegend };
        await writeTextFile(path, serializeTimeline(title, data));
        notifySuccess(`已导出时间轴「${title}」`, path, path);
      }
    } catch (e) {
      console.error("导出时间轴失败", e);
      notifyError(
        "导出时间轴失败",
        e instanceof Error ? e.message : typeof e === "string" ? e : "导出失败，请重试。",
      );
    } finally {
      setIoBusy(false);
    }
  };
  const importTimeline = async () => {
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "时间轴文件", extensions: ["timeline"] }],
    });
    if (typeof path !== "string") return;
    setIoBusy(true);
    try {
      const text = await readTextFile(path);
      const parsed = parseTimeline(text);
      const st = useTimelineStore.getState();
      // 合并文件内图例到实例级（颜色去重）
      for (const l of parsed.data.colorLegend ?? []) st.addLegendEntry(instanceId, l.color, l.label);
      // 新增一条时间轴文件（导入数据写盘；addFile 自动切换到新文件）
      const file = st.addFile(instanceId, parsed.title);
      st.setFileDoc(instanceId, file.id, parsed.data);
    } catch (e) {
      console.error("导入时间轴失败", e);
    } finally {
      setIoBusy(false);
    }
  };

  const viewportRef = useRef<HTMLDivElement>(null);
  const noteElsRef = useRef<Record<string, HTMLDivElement | null>>({});
  const sizesRef = useRef<Record<string, { w: number; h: number }>>({});
  const controlRef = useRef<HTMLDivElement>(null);

  const [vw, setVw] = useState(0);
  const [vh, setVh] = useState(0);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [dragging, setDragging] = useState<null | "pan" | string>(null);
  /** 框选选中的标签集合 */
  const [boxSel, setBoxSel] = useState<Set<string>>(new Set());
  /** 框选矩形（屏幕坐标，Portal 渲染） */
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  /** 右键标签弹窗：目标标签 id 列表（框选多个时为全部选中项）+ 鼠标位置 */
  const [nodeMenu, setNodeMenu] = useState<{ ids: string[]; x: number; y: number } | null>(null);
  /** 「替换颜色」弹窗：目标标签 id 列表 + 弹出位置 */
  const [replaceColor, setReplaceColor] = useState<{ ids: string[]; x: number; y: number } | null>(null);

  // 切换文件：清空文件级瞬态状态（选中/就地编辑/框选/右键菜单/替换颜色弹窗）。
  // 否则这些状态仍持有上一个文件的节点 id：选中高亮与菜单悬空，且后续动作会以
  // 「新 fileId + 旧节点 id」执行（静默失败或写了错误目标），表现为「显示非目标文件」。
  useEffect(() => {
    setSelectedId(null);
    setEditingId(null);
    setEditingDraft("");
    setBoxSel(new Set());
    setNodeMenu(null);
    setReplaceColor(null);
    setMarquee(null);
    setDragging(null);
  }, [fileId]);

  const { rangeStart, rangeEnd, tickStep, nodes } = doc;
  const isNodeHidden = useCallback(
    (n: TimelineNodeData) => colorLegend.some((l) => l.color === n.color && l.hidden),
    [colorLegend],
  );

  const dataRef = useRef({ nodes, rangeStart, rangeEnd, hiddenColors: new Set<string>() });
  dataRef.current = {
    nodes,
    rangeStart,
    rangeEnd,
    hiddenColors: new Set(colorLegend.filter((l) => l.hidden).map((l) => l.color)),
  };
  const fileIdRef = useRef(fileId);
  fileIdRef.current = fileId;
  const currentColorRef = useRef(currentColor);
  currentColorRef.current = currentColor;
  const boxSelRef = useRef(boxSel);
  boxSelRef.current = boxSel;
  /** 标记刚完成一次框选拖拽，用于抑制紧随其后的 contextmenu 新建标签 */
  const justMarqueeRef = useRef(false);

  const dragRef = useRef<{
    mode: "pan" | "node";
    nodeId?: string;
    group: string[];
    startWorld: Map<string, { x: number; y: number }>;
    startClientX: number;
    startClientY: number;
    startViewX: number;
    startViewY: number;
    moved: boolean;
    /** 本次拖拽是否已记录撤销快照（只在真正开始移动时记录一次） */
    recorded?: boolean;
  } | null>(null);
  const marqueeRef = useRef<{ x0: number; y0: number; moved: boolean } | null>(null);

  // —— 视口尺寸 ——
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setVw(el.clientWidth);
      setVh(el.clientHeight);
    });
    ro.observe(el);
    setVw(el.clientWidth);
    setVh(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  // —— 测量标签卡片尺寸（世界坐标）——
  useLayoutEffect(() => {
    const next: Record<string, { w: number; h: number }> = {};
    for (const [id, el] of Object.entries(noteElsRef.current)) {
      if (el) next[id] = { w: el.offsetWidth, h: el.offsetHeight };
    }
    sizesRef.current = next;
  }, [doc.nodes]);

  // —— 自适应缩放：让时间区间 + 全部标签恰好进入视口（纯计算，供「适应全部」与截图导出共用） ——
  const computeFitView = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return null;
    const d = dataRef.current;
    let x0 = d.rangeStart * TIME_SCALE;
    let x1 = d.rangeEnd * TIME_SCALE;
    let y0 = 0;
    let y1 = 0;
    for (const n of d.nodes) {
      const w = sizesRef.current[n.id]?.w ?? 90;
      const h = sizesRef.current[n.id]?.h ?? 34;
      x0 = Math.min(x0, n.x - w / 2);
      x1 = Math.max(x1, n.x + w / 2);
      y0 = Math.min(y0, n.y - h / 2);
      y1 = Math.max(y1, n.y + h / 2);
    }
    const pad = 80;
    const bw = Math.max(x1 - x0, 1);
    const bh = Math.max(y1 - y0, 1);
    const zoom = clamp(
      Math.min((el.clientWidth - pad * 2) / bw, (el.clientHeight - pad * 2) / bh),
      MIN_ZOOM,
      MAX_ZOOM,
    );
    return {
      x: el.clientWidth / 2 - (zoom * (x0 + x1)) / 2,
      y: el.clientHeight / 2 - (zoom * (y0 + y1)) / 2,
      zoom,
    };
  }, []);

  const fit = useCallback(() => {
    const v = computeFitView();
    if (v) setView(v);
  }, [computeFitView]);

  useEffect(() => {
    fit();
  }, [fit, fileId]);
  useEffect(() => registerFitHandler(instanceId, fit), [instanceId, fit]);

  // —— 撤销 / 重做（实例级快照）——
  const undo = useCallback(() => useTimelineStore.getState().undo(instanceId), [instanceId]);
  const redo = useCallback(() => useTimelineStore.getState().redo(instanceId), [instanceId]);
  useEffect(() => registerUndoHandler(instanceId, undo), [instanceId, undo]);
  useEffect(() => registerRedoHandler(instanceId, redo), [instanceId, redo]);

  // —— 键盘快捷键：Ctrl/⌘+Z 撤销、Ctrl/⌘+Shift+Z / Ctrl+Y 重做（输入框内由输入框自身处理）——
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // —— 选中/编辑切换：清理误建的空白标签 ——
  const cleanupSelected = () => {
    if (selectedId && doc.nodes.some((n) => n.id === selectedId && n.label.trim() === "")) {
      deleteNode(instanceId, fileId, selectedId);
    }
  };
  const closePanel = () => {
    cleanupSelected();
    setSelectedId(null);
  };
  const selectNode = (id: string) => {
    cleanupSelected();
    setSelectedId(id);
  };
  const selectRef = useRef(selectNode);
  selectRef.current = selectNode;
  const deselectRef = useRef(closePanel);
  deselectRef.current = closePanel;

  // —— 就地编辑标签：提交 / 取消 ——
  const commitLabel = () => {
    if (editingId) {
      const n = doc.nodes.find((x) => x.id === editingId);
      if (n) {
        const label = editingDraft.trim();
        if (label) {
          if (label !== n.label) {
            record(instanceId);
            updateNode(instanceId, fileId, n.id, { label });
          }
        } else {
          record(instanceId);
          deleteNode(instanceId, fileId, n.id);
        }
      }
    }
    setEditingId(null);
  };
  const cancelEdit = () => {
    if (editingId) {
      const n = doc.nodes.find((x) => x.id === editingId);
      if (n && n.label.trim() === "") deleteNode(instanceId, fileId, editingId);
    }
    setEditingId(null);
  };
  const startEdit = (id: string, label: string) => {
    cleanupSelected();
    setSelectedId(id);
    setEditingId(id);
    setEditingDraft(label);
  };

  // —— 滚轮缩放（以光标为中心）——
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const cx = e.clientX - r.left;
      const cy = e.clientY - r.top;
      const v = viewRef.current;
      const wx = (cx - v.x) / v.zoom;
      const wy = (cy - v.y) / v.zoom;
      const zoom = clamp(v.zoom * Math.exp(-e.deltaY * 0.002), MIN_ZOOM, MAX_ZOOM);
      setView({ x: cx - wx * zoom, y: cy - wy * zoom, zoom });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // —— 左键：拖标签（含整体拖动框选组）/ 拖空白平移 / 单击选中或关闭；右键拖拽：框选 ——
  useEffect(() => {
    const clientToWorld = (clientX: number, clientY: number) => {
      const el = viewportRef.current;
      const r = el?.getBoundingClientRect();
      const v = viewRef.current;
      return {
        x: (clientX - (r?.left ?? 0) - v.x) / v.zoom,
        y: (clientY - (r?.top ?? 0) - v.y) / v.zoom,
      };
    };
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (d) {
        const dx = e.clientX - d.startClientX;
        const dy = e.clientY - d.startClientY;
        if (!d.moved && Math.hypot(dx, dy) < 4) return;
        // 节点拖拽真正开始时记录一次撤销快照（一次拖拽 = 一步撤销）
        if (!d.moved && d.mode === "node" && !d.recorded) {
          d.recorded = true;
          useTimelineStore.getState().record(instanceId);
        }
        d.moved = true;
        if (d.mode === "pan") {
          setView((v) => ({ ...v, x: d.startViewX + dx, y: d.startViewY + dy }));
        } else if (d.nodeId) {
          const z = viewRef.current.zoom;
          for (const [gid, start] of d.startWorld) {
            moveNode(instanceId, fileIdRef.current, gid, start.x + dx / z, start.y + dy / z);
          }
        }
        return;
      }
      const m = marqueeRef.current;
      if (m) {
        const dx = e.clientX - m.x0;
        const dy = e.clientY - m.y0;
        if (!m.moved && Math.hypot(dx, dy) < 4) return;
        m.moved = true;
        setMarquee({ x0: m.x0, y0: m.y0, x1: e.clientX, y1: e.clientY });
      }
    };
    const onUp = (e: PointerEvent) => {
      const d = dragRef.current;
      if (d) {
        dragRef.current = null;
        setDragging(null);
        if (!d.moved) {
          if (d.mode === "node" && d.nodeId) {
            // 单击标签：清空框选，单选打开颜色卡片
            setBoxSel(new Set());
            selectRef.current(d.nodeId);
          } else if (d.mode === "pan") {
            deselectRef.current();
            setBoxSel(new Set());
          }
        }
        return;
      }
      const m = marqueeRef.current;
      if (m) {
        marqueeRef.current = null;
        setMarquee(null);
        if (m.moved) {
          const w0 = clientToWorld(m.x0, m.y0);
          const w1 = clientToWorld(e.clientX, e.clientY);
          const minX = Math.min(w0.x, w1.x);
          const maxX = Math.max(w0.x, w1.x);
          const minY = Math.min(w0.y, w1.y);
          const maxY = Math.max(w0.y, w1.y);
          const selected = new Set<string>();
          for (const n of dataRef.current.nodes) {
            if (dataRef.current.hiddenColors.has(n.color)) continue;
            if (n.x >= minX && n.x <= maxX && n.y >= minY && n.y <= maxY) selected.add(n.id);
          }
          setBoxSel(selected);
          if (selected.size > 0) deselectRef.current(); // 进入框选状态：关闭颜色卡片
          justMarqueeRef.current = true;
        }
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [moveNode, instanceId]);

  // —— Esc 取消一切手势/菜单 ——
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setNodeMenu(null);
        setMarquee(null);
        marqueeRef.current = null;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onViewportPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const t = e.target as HTMLElement;
    if (t.closest("[data-node-editor], [data-overlay], [data-label-edit]")) return;
    const noteEl = t.closest("[data-note]") as HTMLElement | null;
    const nodeId = noteEl?.dataset?.nodeId;

    // 右键：空白处开始框选手势（点击则交给 contextmenu 新建标签）
    if (e.button === 2) {
      if (nodeId) return; // 右键标签 → 交给 contextmenu 弹菜单
      e.preventDefault();
      setNodeMenu(null);
      setSelectedId(null);
      marqueeRef.current = { x0: e.clientX, y0: e.clientY, moved: false };
      return;
    }
    if (e.button !== 0) return;

    if (nodeId) {
      const n = doc.nodes.find((x) => x.id === nodeId);
      if (!n) return;
      e.preventDefault();
      // 标签在框选组内则整体拖动，否则只拖动自身
      const inGroup = boxSelRef.current.has(nodeId);
      const group = inGroup ? [...boxSelRef.current] : [nodeId];
      const startWorld = new Map<string, { x: number; y: number }>();
      for (const gid of group) {
        const nn = doc.nodes.find((x) => x.id === gid);
        if (nn) startWorld.set(gid, { x: nn.x, y: nn.y });
      }
      dragRef.current = {
        mode: "node",
        nodeId,
        group,
        startWorld,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startViewX: viewRef.current.x,
        startViewY: viewRef.current.y,
        moved: false,
      };
      setDragging(nodeId);
      if (!inGroup) setBoxSel(new Set());
    } else {
      dragRef.current = {
        mode: "pan",
        group: [],
        startWorld: new Map(),
        startClientX: e.clientX,
        startClientY: e.clientY,
        startViewX: viewRef.current.x,
        startViewY: viewRef.current.y,
        moved: false,
      };
      setDragging("pan");
    }
  };

  // —— 右键菜单：标签弹窗 / 空白新建 / 框选后抑制 ——
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const t = e.target as HTMLElement;
    if (t.closest("[data-node-editor], [data-overlay], [data-label-edit]")) return;
    const noteEl = t.closest("[data-note]") as HTMLElement | null;
    const nodeId = noteEl?.dataset?.nodeId;
    if (nodeId) {
      // 刚完成框选时随后的 contextmenu 不弹标签菜单
      if (justMarqueeRef.current) {
        justMarqueeRef.current = false;
        return;
      }
      const n = doc.nodes.find((x) => x.id === nodeId);
      if (!n) return;
      // 仅弹菜单，不设置 selectedId（避免同时弹出颜色卡片；编辑动作里再选中）
      const ids = boxSelRef.current.has(nodeId) ? [...boxSelRef.current] : [nodeId];
      setNodeMenu({ ids, x: e.clientX, y: e.clientY });
      return;
    }
    // 空白：刚完成框选则不新建标签
    if (justMarqueeRef.current) {
      justMarqueeRef.current = false;
      return;
    }
    const r = viewportRef.current?.getBoundingClientRect();
    if (!r) return;
    const v = viewRef.current;
    const wx = (e.clientX - r.left - v.x) / v.zoom;
    const wy = (e.clientY - r.top - v.y) / v.zoom;
    // 若上一处新建仍处于编辑状态，先提交（或删除空白）再新建，避免空白标签遗留
    commitLabel();
    record(instanceId);
    const created = addNode(instanceId, fileId, wx, wy, currentColorRef.current);
    if (created) startEdit(created.id, "");
  };

  // —— 右键标签弹窗动作 ——
  const closeNodeMenu = () => setNodeMenu(null);
  const menuEditText = () => {
    const id = nodeMenu?.ids[0];
    if (id) {
      const n = doc.nodes.find((x) => x.id === id);
      if (n) {
        // 直接进入就地编辑（不经 startEdit 的 cleanupSelected，避免误删空白标签）
        setSelectedId(id);
        setEditingId(id);
        setEditingDraft(n.label);
      }
    }
    setNodeMenu(null);
  };
  const menuReplaceColor = () => {
    if (!nodeMenu) return;
    // 替换颜色时同时替换标签下方注释为对应图例注释（需求：下内容一起替换）
    const entry = colorLegend.find((l) => l.color === currentColorRef.current);
    record(instanceId);
    for (const id of nodeMenu.ids) {
      updateNode(instanceId, fileId, id, { color: currentColorRef.current, note: entry?.label });
    }
    if (entry?.hidden) setLegendHidden(instanceId, entry.id, false);
    setNodeMenu(null);
  };
  const menuReplaceColorOpen = () => {
    if (!nodeMenu) return;
    setReplaceColor({ ids: nodeMenu.ids, x: nodeMenu.x, y: nodeMenu.y });
    setNodeMenu(null);
  };
  const menuDelete = () => {
    if (!nodeMenu) return;
    record(instanceId);
    for (const id of nodeMenu.ids) deleteNode(instanceId, fileId, id);
    setSelectedId(null);
    setBoxSel(new Set());
    setNodeMenu(null);
  };
  const menuClearSel = () => {
    setBoxSel(new Set());
    setNodeMenu(null);
  };

  // —— 左下角缩放 ——
  const zoomBy = (factor: number) => {
    const el = viewportRef.current;
    const cx = (el?.clientWidth ?? 0) / 2;
    const cy = (el?.clientHeight ?? 0) / 2;
    const v = viewRef.current;
    const w = (cx - v.x) / v.zoom;
    const h = (cy - v.y) / v.zoom;
    const zoom = clamp(v.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    setView({ x: cx - w * zoom, y: cy - h * zoom, zoom });
  };

  // —— 刻度：可见范围 + 自动加大步长 ——
  const wx0 = (0 - view.x) / view.zoom;
  const wx1 = (vw - view.x) / view.zoom;
  let step = Math.max(tickStep, 1e-6);
  let guard = 0;
  while (step * TIME_SCALE * view.zoom < TICK_MIN_PX && guard++ < 64) step *= 2;
  const firstTick = Math.ceil(rangeStart / step) * step;
  const ticks: number[] = [];
  for (let t = firstTick; t <= rangeEnd + 1e-9; t += step) {
    const wx = t * TIME_SCALE;
    if (wx < wx0 - 40 || wx > wx1 + 40) continue;
    ticks.push(t);
  }

  // —— 轴体横向范围 ——
  let axisX0 = rangeStart * TIME_SCALE - 60;
  let axisX1 = rangeEnd * TIME_SCALE + 60;
  for (const n of nodes) {
    axisX0 = Math.min(axisX0, n.x - 120);
    axisX1 = Math.max(axisX1, n.x + 120);
  }

  // —— 右上角图例：动态列数（不遮左上角控制区）——
  const controlW = controlRef.current?.offsetWidth ?? 200;
  const availableW = Math.max(vw - controlW - 48, 120);
  const maxColumns = clamp(Math.floor(availableW / LEGEND_COL_WIDTH), 1, 12);
  const shownLegend = colorLegend.slice(0, maxColumns * LEGEND_ROWS);
  const hiddenLegendCount = colorLegend.length - shownLegend.length;

  // 点阵背景
  const gap = Math.max(DOT_GAP * view.zoom, 1);
  const dotStyle: React.CSSProperties = {
    backgroundImage:
      "radial-gradient(circle, color-mix(in srgb, var(--color-fg-muted) 22%, transparent) 1px, transparent 1px)",
    backgroundSize: `${gap}px ${gap}px`,
    backgroundPosition: `${view.x % gap}px ${view.y % gap}px`,
  };

  const visibleNodes = doc.nodes.filter((n) => !isNodeHidden(n));

  return (
    <>
      <div
        ref={viewportRef}
        className="relative h-full w-full select-none overflow-hidden"
        onPointerDown={onViewportPointerDown}
        onContextMenu={onContextMenu}
      >
        {/* 无界点阵背景 */}
        <div className="absolute inset-0" style={dotStyle} />

        {/* 世界层（平移 + 缩放） */}
        <div
          className="absolute inset-0 overflow-visible"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
            transformOrigin: "0 0",
          }}
        >
          {/* 轴体 */}
          <div className="pointer-events-none absolute h-[2px] bg-accent" style={{ left: axisX0, width: axisX1 - axisX0, top: -1 }} />
          <div className="pointer-events-none absolute size-2 rounded-full bg-accent" style={{ left: axisX0 - 4, top: -5 }} />
          <div
            className="pointer-events-none absolute border-y-[5px] border-l-[9px] border-y-transparent border-l-accent"
            style={{ left: axisX1 - 1, top: -5 }}
          />

          {/* 垂线 + 轴上节点 + 刻度短线 */}
          <svg className="pointer-events-none absolute left-0 top-0 h-1 w-1 overflow-visible">
            {visibleNodes.map((n) => {
              const size = sizesRef.current[n.id];
              const h = size?.h ?? 34;
              const above = n.y < 0;
              const edgeY = above ? n.y + h / 2 : n.y - h / 2;
              return (
                <g key={n.id}>
                  <line x1={n.x} y1={edgeY} x2={n.x} y2={0} stroke={n.color} strokeWidth={1.5} opacity={0.65} />
                  <circle cx={n.x} cy={0} r={2.5} fill={n.color} />
                </g>
              );
            })}
            {ticks.map((t) => (
              <line key={t} x1={t * TIME_SCALE} y1={0} x2={t * TIME_SCALE} y2={6} stroke="var(--color-fg-muted)" strokeWidth={1} opacity={0.6} />
            ))}
          </svg>

          {/* 刻度数字 */}
          {ticks.map((t) => (
            <div
              key={t}
              className="pointer-events-none absolute -translate-x-1/2 font-mono text-[11px] tabular-nums text-fg-muted"
              style={{ left: t * TIME_SCALE, top: 9 }}
            >
              {formatNum(t)}
            </div>
          ))}

          {/* 标签（透明背景/轮廓，文字用所选颜色；选中/框选/编辑时就地输入） */}
          {visibleNodes.map((n) => {
            const size = sizesRef.current[n.id];
            const w = size?.w ?? 90;
            const h = size?.h ?? 34;
            const isEditing = editingId === n.id;
            const isSel = selectedId === n.id;
            const isBox = boxSel.has(n.id);
            return (
              <div
                key={n.id}
                data-note
                data-node-id={n.id}
                ref={(el) => {
                  noteElsRef.current[n.id] = el;
                }}
                onDoubleClick={(e) => {
                  // 左键双击标签快速编辑文字（直接进入就地编辑，避免误删空白标签）
                  e.stopPropagation();
                  if (isEditing) return;
                  setSelectedId(n.id);
                  setEditingId(n.id);
                  setEditingDraft(n.label);
                }}
                style={{
                  left: n.x - w / 2,
                  top: n.y - h / 2,
                  color: n.color,
                  outline: (isSel || isBox) && !isEditing ? `1px dashed ${isSel ? n.color : "var(--color-accent)"}` : undefined,
                  outlineOffset: 2,
                  // 宽度按内容决定（上限 260），避免绝对定位按“包含块宽 − left”收缩导致换行/竖排
                  width: "max-content",
                  maxWidth: 260,
                }}
                className={cn(
                  "absolute cursor-grab px-1.5 py-0.5 text-sm font-medium leading-snug",
                  dragging === n.id && "cursor-grabbing",
                )}
              >
                {isEditing ? (
                  <input
                    autoFocus
                    data-label-edit
                    value={editingDraft}
                    onChange={(e) => setEditingDraft(e.target.value)}
                    onPointerDown={(e) => e.stopPropagation()}
                    onContextMenu={(e) => e.stopPropagation()}
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={commitLabel}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") commitLabel();
                      if (e.key === "Escape") cancelEdit();
                    }}
                    style={{ color: n.color }}
                    placeholder="输入标签…"
                    className="w-[160px] bg-transparent text-sm font-medium caret-current outline-none placeholder:text-current/40"
                  />
                ) : (
                  <>
                    <span className="block break-words">{n.label}</span>
                    {n.note?.trim() ? (
                      <span className="block text-[10px] opacity-75">{n.note}</span>
                    ) : null}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* 左上角：时间区间 + 刻度 */}
        <div
          ref={controlRef}
          data-overlay
          className="absolute left-3 top-2 z-10 flex items-center gap-1.5 text-xs text-fg-muted"
        >
          <span>时间区间</span>
          <NumEdit
            value={rangeStart}
            onCommit={(v) => {
              record(instanceId);
              setRange(instanceId, fileId, v, rangeEnd);
            }}
          />
          <span>—</span>
          <NumEdit
            value={rangeEnd}
            onCommit={(v) => {
              record(instanceId);
              setRange(instanceId, fileId, rangeStart, v);
            }}
          />
          <span className="mx-1.5 h-3 w-px bg-line" />
          <span>刻度</span>
          <NumEdit
            value={tickStep}
            onCommit={(v) => {
              record(instanceId);
              setTickStep(instanceId, fileId, v);
            }}
          />
        </div>

        {/* 左下角：缩放控件（放大 / 缩小 / 适应全部标签） */}
        <div
          data-overlay
          className="absolute bottom-3 left-3 z-10 flex flex-col overflow-hidden rounded-lg border border-line/70 bg-app/90 shadow-sm"
        >
          <button
            title="放大"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => zoomBy(1.2)}
            className="flex h-7 w-7 items-center justify-center text-fg-muted transition-colors hover:bg-hover hover:text-fg"
          >
            <Plus className="size-4" />
          </button>
          <button
            title="缩小"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => zoomBy(1 / 1.2)}
            className="flex h-7 w-7 items-center justify-center border-y border-line/60 text-fg-muted transition-colors hover:bg-hover hover:text-fg"
          >
            <Minus className="size-4" />
          </button>
          <button
            title="适应全部标签"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={fit}
            className="flex h-7 w-7 items-center justify-center text-fg-muted transition-colors hover:bg-hover hover:text-fg"
          >
            <Maximize2 className="size-4" />
          </button>
        </div>

        {/* 右上角：颜色图例（工具栏「图例开关」控制显示，最多 5 行换列，列数动态上限） */}
        {legendVisible && (
          <div data-overlay className="absolute right-3 top-3 z-10">
            <div className="rounded-xl border border-line/70 bg-app/95 p-3 text-xs shadow-pop backdrop-blur-sm">
              <div className="mb-2 flex items-center gap-2 font-semibold tracking-wide text-fg">
                <span className="size-1.5 rounded-full bg-accent" />
                颜色图例
              </div>
              <div
                className="grid gap-x-3.5 gap-y-2"
                style={{ gridAutoFlow: "column", gridTemplateRows: `repeat(${LEGEND_ROWS}, auto)` }}
              >
                {shownLegend.map((l) => (
                  <button
                    key={l.id}
                    title={l.hidden ? "点击显示该颜色" : "点击隐藏该颜色"}
                    onClick={() => {
                      record(instanceId);
                      setLegendHidden(instanceId, l.id, !l.hidden);
                    }}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-1 text-left transition-colors",
                      l.hidden ? "opacity-40" : "text-fg-muted hover:text-fg",
                    )}
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full ring-1 ring-line"
                      style={{ background: l.color, opacity: l.hidden ? 0.35 : 1 }}
                    />
                    <span className={cn("truncate", l.hidden && "line-through")}>{l.label}</span>
                  </button>
                ))}
              </div>
              {hiddenLegendCount > 0 && (
                <div className="mt-1.5 border-t border-line/50 pt-1.5 text-[10px] text-fg-muted/70">
                  另有 {hiddenLegendCount} 项未显示（见工具栏「颜色管理」）
                </div>
              )}
            </div>
          </div>
        )}

        {/* 右下角：导出 / 导入（v0.7） */}
        <div data-overlay className="absolute bottom-3 right-3 z-10 flex overflow-hidden rounded-lg border border-line/70 bg-app/90 shadow-sm">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                title="导出时间轴"
                disabled={ioBusy}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex h-7 items-center gap-1 px-2 text-xs text-fg-muted transition-colors hover:bg-hover hover:text-fg disabled:opacity-50"
              >
                <Download className="size-3.5" />
                导出
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void exportTimeline("timeline")}>
                <FileUp className="size-3.5 opacity-70" />
                <span className="flex-1">导出时间轴文件（.timeline）</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void exportTimeline("png")}>
                <FileImage className="size-3.5 opacity-70" />
                <span className="flex-1">导出 PNG 图片</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            title="导入时间轴文件"
            disabled={ioBusy}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => void importTimeline()}
            className="flex h-7 items-center gap-1 border-l border-line/60 px-2 text-xs text-fg-muted transition-colors hover:bg-hover hover:text-fg disabled:opacity-50"
          >
            <Upload className="size-3.5" />
            导入
          </button>
        </div>
      </div>

      {/* 框选矩形（屏幕坐标，Portal 到 body，规避 CSS zoom 偏移） */}
      {marquee &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[45] border border-accent/70 bg-accent/10"
            style={{
              left: Math.min(marquee.x0, marquee.x1),
              top: Math.min(marquee.y0, marquee.y1),
              width: Math.abs(marquee.x1 - marquee.x0),
              height: Math.abs(marquee.y1 - marquee.y0),
            }}
          />,
          document.body,
        )}

      {/* 右键标签弹窗（Portal 到 body） */}
      {nodeMenu &&
        createPortal(
          <TimelineNodeMenu
            ids={nodeMenu.ids}
            x={nodeMenu.x}
            y={nodeMenu.y}
            onEdit={menuEditText}
            onReplaceColor={menuReplaceColor}
            onReplaceColorOpen={menuReplaceColorOpen}
            onDelete={menuDelete}
            onClearSel={menuClearSel}
            onClose={closeNodeMenu}
          />,
          document.body,
        )}

      {/* 替换颜色弹窗（Portal 到 body）：图例色 + 自定义取色，可应用到多个标签 */}
      {replaceColor &&
        createPortal(
          <ReplaceColorPopup
            instanceId={instanceId}
            fileId={fileId}
            ids={replaceColor.ids}
            colorLegend={colorLegend}
            x={replaceColor.x}
            y={replaceColor.y}
            onClose={() => setReplaceColor(null)}
          />,
          document.body,
        )}
    </>
  );
}

/** 可点击编辑的数字（时间区间端点 / 刻度值） */
function NumEdit({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  const commit = () => {
    const v = parseFloat(draft);
    if (Number.isFinite(v)) onCommit(v);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        onClick={() => {
          setDraft(String(value));
          setEditing(true);
        }}
        className="rounded-md bg-hover px-1.5 py-0.5 font-mono tabular-nums text-fg transition-colors hover:bg-active"
      >
        {formatNum(value)}
      </button>
    );
  }
  return (
    <input
      autoFocus
      data-overlay
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
      className="h-6 w-14 rounded-md border border-accent/40 bg-app px-1 font-mono text-xs text-fg outline-none"
    />
  );
}

/** 右键标签弹窗：编辑文字 / 替换为当前颜色 / 替换颜色… / 删除（框选多个时含批量操作） */
function TimelineNodeMenu({
  ids,
  x,
  y,
  onEdit,
  onReplaceColor,
  onReplaceColorOpen,
  onDelete,
  onClearSel,
  onClose,
}: {
  ids: string[];
  x: number;
  y: number;
  onEdit: () => void;
  onReplaceColor: () => void;
  onReplaceColorOpen: () => void;
  onDelete: () => void;
  onClearSel: () => void;
  onClose: () => void;
}) {
  const multi = ids.length > 1;
  const pos = clampMenu(x, y, 180, multi ? 176 : 192);
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className="fixed z-50 w-[180px] overflow-hidden rounded-xl border border-line/70 bg-app shadow-pop"
        style={pos}
      >
        <div className="p-1">
          <div className="px-2 pb-1 pt-1.5 text-[10px] font-semibold tracking-[0.14em] text-fg-muted">
            {multi ? `已选 ${ids.length} 个标签` : "标签操作"}
          </div>
          {!multi && (
            <button
              onClick={onEdit}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-fg transition-colors hover:bg-hover"
            >
              <Pencil className="size-3.5 text-fg-muted" /> 编辑文字
            </button>
          )}
          <button
            onClick={onReplaceColor}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-fg transition-colors hover:bg-hover"
          >
            <Palette className="size-3.5 text-fg-muted" /> 替换为当前颜色
          </button>
          <button
            onClick={onReplaceColorOpen}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-fg transition-colors hover:bg-hover"
          >
            <Paintbrush className="size-3.5 text-fg-muted" /> 替换颜色…
          </button>
          {multi && (
            <button
              onClick={onClearSel}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-fg transition-colors hover:bg-hover"
            >
              <X className="size-3.5 text-fg-muted" /> 取消选择
            </button>
          )}
          <button
            onClick={onDelete}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-danger transition-colors hover:bg-danger/10"
          >
            <Trash2 className="size-3.5" /> {multi ? `删除选中标签（${ids.length}）` : "删除"}
          </button>
        </div>
      </div>
    </>
  );
}

/** 替换颜色弹窗（右键标签「替换颜色…」）：图例色 + 自定义取色，应用到单个或多个标签。
 *  替换颜色时同时替换标签下方注释（note）为对应图例注释（需求：下内容一起替换）。 */
function ReplaceColorPopup({
  instanceId,
  fileId,
  ids,
  colorLegend,
  x,
  y,
  onClose,
}: {
  instanceId: string;
  fileId: string;
  ids: string[];
  colorLegend: ColorLegendItem[];
  x: number;
  y: number;
  onClose: () => void;
}) {
  const updateNode = useTimelineStore((s) => s.updateNode);
  const setLegendHidden = useTimelineStore((s) => s.setLegendHidden);
  const addLegendEntry = useTimelineStore((s) => s.addLegendEntry);
  const updateLegendEntryLabel = useTimelineStore((s) => s.updateLegendEntryLabel);
  const record = useTimelineStore((s) => s.record);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerColor, setPickerColor] = useState(colorLegend[0]?.color ?? "#d7b25c");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");

  /** 应用颜色到全部目标标签（含注释同步），记录一步撤销 */
  const apply = (color: string, noteVal?: string) => {
    record(instanceId);
    for (const id of ids) updateNode(instanceId, fileId, id, { color, note: noteVal });
  };

  const openPicker = () => {
    setPickerColor(colorLegend[0]?.color ?? "#d7b25c");
    setNote("");
    setPickerOpen(true);
  };
  const confirmCustom = () => {
    apply(pickerColor, note.trim() || undefined);
    // 自定义颜色确认后加入实例图例（无注释时以「自定义」为名；已存在则跳过）
    addLegendEntry(instanceId, pickerColor, note);
    updateLegendEntryLabel(instanceId, pickerColor, note);
    setPickerOpen(false);
    onClose();
  };

  // 取色面板：HSV 状态 + 拖动取色
  const { h, s, v } = hexToHsv(pickerColor);
  const setFromSV = (el: HTMLElement, e: React.PointerEvent) => {
    const rect = el.getBoundingClientRect();
    const xc = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    const yc = Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1);
    setPickerColor(hsvToHex(h, xc, 1 - yc));
  };
  const setFromHue = (el: HTMLElement, e: React.PointerEvent) => {
    const rect = el.getBoundingClientRect();
    const t = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    setPickerColor(hsvToHex(t * 360, s, v));
  };

  // 图例色按注释快捷搜索
  const q = search.trim().toLowerCase();
  const filteredLegend = q ? colorLegend.filter((l) => l.label.toLowerCase().includes(q)) : colorLegend;

  const panelW = 236;
  const pos = clampMenu(x, y, panelW, 236);

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        data-overlay
        className="anim-scale fixed z-50 overflow-hidden rounded-xl border border-line/70 bg-app p-3.5 shadow-pop"
        style={{ left: pos.left, top: pos.top, width: panelW }}
      >
        {/* 头部：标题 + 关闭 */}
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold tracking-wide text-fg-muted">
            替换颜色{ids.length > 1 ? `（${ids.length} 个标签）` : ""}
          </span>
          <button
            title="关闭"
            onClick={onClose}
            className="flex h-5 w-5 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {/* 图例色快捷搜索（按注释） */}
        <div className="relative mb-1.5">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-fg-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索颜色注释…"
            className="h-6 w-full rounded-md border border-line/70 bg-app pl-6 pr-1.5 text-[11px] text-fg outline-none placeholder:text-fg-muted/50 focus:border-accent/40"
          />
        </div>

        {/* 图例色（内边距避免边缘遮挡） */}
        <div className="thin-scrollbar max-h-[112px] overflow-y-auto pr-1">
          <div className="flex flex-wrap items-center gap-2.5 px-1 py-1">
            {filteredLegend.map((l) => (
              <button
                key={l.id}
                title={`${l.label}（同时替换注释）`}
                onClick={() => {
                  apply(l.color, l.label);
                  if (l.hidden) setLegendHidden(instanceId, l.id, false);
                  onClose();
                }}
                className={cn(
                  "size-7 shrink-0 rounded-full ring-1 ring-line transition-transform hover:scale-110",
                  l.hidden && "opacity-40",
                )}
                style={{ background: l.color }}
              />
            ))}
            {filteredLegend.length === 0 && (
              <span className="py-1 text-[11px] text-fg-muted">无匹配颜色</span>
            )}
          </div>
        </div>

        {/* 自定义取色入口：点击弹出取色面板 */}
        <div className="mt-2.5 flex items-center justify-between rounded-lg border border-line/70 bg-app px-2 py-1.5 transition-colors">
          <span className="text-[11px] text-fg-muted">自定义</span>
          <button
            onClick={openPicker}
            title="点击取色"
            className="relative flex size-8 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full shadow-card transition-transform hover:scale-110"
          >
            <span
              className="absolute inset-0"
              style={{ background: "conic-gradient(#f66,#fb6,#ff6,#6f6,#6ff,#66f,#f6f,#f66)" }}
            />
            <span
              className="absolute inset-[2px] rounded-full"
              style={{ background: pickerColor, boxShadow: "inset 0 1px 2px rgba(0,0,0,.25)" }}
            />
          </button>
        </div>
      </div>

      {/* 取色面板：取色 + 注释 + 确认 在同一个卡片 */}
      {pickerOpen && (
        <div
          data-overlay
          onPointerDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.stopPropagation()}
          className="fixed inset-0 z-[70] flex items-center justify-center"
        >
          <div className="absolute inset-0 bg-scrim" onClick={() => setPickerOpen(false)} />
          <div className="anim-scale relative w-[min(340px,92vw)] rounded-xl border border-line/70 bg-app p-4 shadow-pop">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-fg-strong">自定义颜色</span>
              <button
                onClick={() => setPickerOpen(false)}
                title="关闭"
                className="flex h-6 w-6 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* 取色面板：直接显示（饱和度/明度方块 + 色相滑条） */}
            <div className="mb-4">
              <div
                className="relative h-36 w-full cursor-crosshair touch-none overflow-hidden rounded-lg border border-line/70"
                style={{
                  background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hsvToHex(h, 1, 1)})`,
                }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setFromSV(e.currentTarget, e);
                }}
                onPointerMove={(e) => {
                  if (e.buttons & 1) setFromSV(e.currentTarget, e);
                }}
              >
                <div
                  className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                  style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%`, background: pickerColor }}
                />
              </div>
              <div
                className="relative mt-2 h-3.5 w-full cursor-pointer touch-none rounded-full border border-line/70"
                style={{ background: "linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setFromHue(e.currentTarget, e);
                }}
                onPointerMove={(e) => {
                  if (e.buttons & 1) setFromHue(e.currentTarget, e);
                }}
              >
                <div
                  className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                  style={{ left: `${(h / 360) * 100}%`, background: hsvToHex(h, 1, 1) }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="font-mono text-[11px] tabular-nums text-fg-muted">{pickerColor}</span>
                <span className="text-[10px] text-fg-muted/60">直接拖动取色</span>
              </div>
            </div>

            {/* 注释（同时作为自定义图例名） */}
            <div className="mb-3">
              <label className="mb-1 block text-[11px] text-fg-muted">注释（同时作为自定义图例名）</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="为自定义颜色添加说明…"
                rows={2}
                className="h-16 w-full resize-none rounded-lg border border-line/70 bg-app px-2.5 py-1.5 text-xs text-fg outline-none transition-colors placeholder:text-fg-muted/50 focus:border-accent/50"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPickerOpen(false)}
                className="rounded-md px-3 py-1.5 text-xs text-fg-muted transition-colors hover:bg-hover hover:text-fg"
              >
                取消
              </button>
              <button
                onClick={confirmCustom}
                className="rounded-md bg-accent px-4 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
