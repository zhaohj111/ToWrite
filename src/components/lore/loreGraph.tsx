// 设定库力导向图（core.lore 图布局）：手写画布，完全复刻时间轴的渲染/拖动方案。
// 为什么不用 reactflow：本机 WebView2 + 宿主 CSS zoom 环境下，reactflow 用 transform 定位节点
// 拖动会持续滞后（节点追鼠标、边实时）；时间轴用 left/top 绝对定位 + 每帧写 store 则顺滑。
// 这里与时间轴同构：世界层 translate+scale，节点绝对定位，边为 SVG 直线，拖动直接写 store。
//
// 交互：
//   - 左键按住卡片 -> 拖动（每帧写 store），组内可整体移动
//   - 左键单击卡片 -> 高亮选中；左键拖空白 -> 平移；滚轮 -> 以光标为中心缩放
//   - 双击节点 -> 打开设定编辑器
//   - 右键卡片 -> 上下文菜单：编辑 / 连接… / 快速连接 / 删除；多选时含整体连接… / 整体快速连接 / 删除选中
//   - 右键空白（按住拖拽）-> 框选矩形区域内卡片（不显示提示条）；单击空白 -> 新建设定
//   - 线段：直线段连接两张卡片中心；标签位于中部上方、普通文本；连线颜色/关系文本颜色取工具栏设置
//   - 双击线段 -> 弹窗编辑关系名；右键线段 -> 删除 / 编辑选项
// 屏幕坐标弹层经 Portal 挂到 document.body，规避宿主 CSS zoom 造成的偏移。

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookMarked,
  Link2,
  Maximize2,
  Minus,
  MousePointer2,
  Palette,
  Pencil,
  Plus,
  Search,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLoreStore } from "@/stores/loreStore";
import { useLoreUiStore } from "@/stores/loreUiStore";
import { useInstanceId, useLoreSlice } from "@/components/editor/editorInstanceContext";
import { registerLoreCapture } from "@/lib/loreBus";
import { captureElementToPng } from "@/lib/fileFormats/pngExport";
import { ColorPickerPanel } from "@/components/ui/colorPicker";
import { cn } from "@/lib/cn";
import { runForceLayout } from "@/lib/loreLayout";
import type { LoreEdge, LoreEntry, LoreTag } from "@/types/writeproj";

/** 节点卡片近似宽高（未实测时的兜底） */
const NODE_W = 190;
const NODE_H = 84;
/** 线段标签相对线段中点的垂直偏移（世界坐标） */
const EDGE_LABEL_OFFSET = 18;
/** 缩放范围 */
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;
/** 点阵背景间距 */
const DOT_GAP = 22;
/** 连线 / 关系文本缺省颜色 */
const DEFAULT_EDGE_COLOR = "#8a8f98";
const DEFAULT_LABEL_COLOR = "#8a8f98";

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
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

export function LoreGraph({
  onDeleteCard,
  onDeleteCards,
}: {
  onDeleteCard?: (card: LoreEntry) => void;
  onDeleteCards?: (cards: LoreEntry[]) => void;
}) {
  const instanceId = useInstanceId();
  const slice = useLoreSlice();
  const fileId = slice.currentFileId;
  const doc = fileId ? slice.docs[fileId] : undefined;
  const cards = doc?.cards ?? [];
  const edges = doc?.edges ?? [];
  const tags = slice.tags;
  const view = useLoreUiStore((s) => s.slices[instanceId]?.view);
  // 实例未单独设置时回退到全局持久化颜色
  const sliceEdgeColor = useLoreUiStore((s) => s.slices[instanceId]?.edgeColor);
  const globalEdgeColor = useLoreUiStore((s) => s.edgeColor);
  const sliceEdgeLabelColor = useLoreUiStore((s) => s.slices[instanceId]?.edgeLabelColor);
  const globalEdgeLabelColor = useLoreUiStore((s) => s.edgeLabelColor);
  const edgeColor = sliceEdgeColor ?? globalEdgeColor;
  const edgeLabelColor = sliceEdgeLabelColor ?? globalEdgeLabelColor;
  const selectCard = useLoreUiStore((s) => s.selectCard);
  const openCard = useLoreUiStore((s) => s.openCard);
  const moveCard = useLoreStore((s) => s.moveCard);
  const addEdge = useLoreStore((s) => s.addEdge);
  const updateEdge = useLoreStore((s) => s.updateEdge);
  const deleteEdge = useLoreStore((s) => s.deleteEdge);
  const addCard = useLoreStore((s) => s.addCard);

  // —— 视口（平移 + 缩放） ——
  const [viewState, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const viewRef = useRef(viewState);
  viewRef.current = viewState;
  const viewportRef = useRef<HTMLDivElement>(null);
  const nodeElsRef = useRef<Record<string, HTMLDivElement | null>>({});
  const sizesRef = useRef<Record<string, { w: number; h: number }>>({});
  const [vw, setVw] = useState(0);
  const [vh, setVh] = useState(0);

  // —— 菜单状态 ——
  const [menu, setMenu] = useState<{ sourceIds: string[]; x: number; y: number } | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [relName, setRelName] = useState("");
  const [relSearch, setRelSearch] = useState("");
  const [connectLine, setConnectLine] = useState<{ sourceIds: string[]; x: number; y: number } | null>(null);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [boxSel, setBoxSel] = useState<Set<string>>(new Set());
  const [paneMenu, setPaneMenu] = useState<{ x: number; y: number } | null>(null);
  const [edgeMenu, setEdgeMenu] = useState<{ edgeId: string; mode: "edit" | "context"; x: number; y: number } | null>(null);
  const [edgeDraft, setEdgeDraft] = useState("");
  /** 右键卡片上下文菜单：目标 id 列表 + 当前右键卡 + 位置 */
  const [cardMenu, setCardMenu] = useState<{ ids: string[]; currentId: string; x: number; y: number } | null>(null);
  /** 连线颜色替换弹窗：目标边 + 字段（color/labelColor）+ 位置 */
  const [edgeColorPicker, setEdgeColorPicker] = useState<{ edgeId: string; field: "color" | "labelColor"; x: number; y: number } | null>(null);
  /** 连线颜色替换草稿（应用才落盘，避免拖动取色刷屏撤销栈） */
  const [edgeColorDraft, setEdgeColorDraft] = useState(DEFAULT_EDGE_COLOR);
  /** 当前选中的线段（高亮） */
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // —— 手势 ref ——
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
    /** 是否已为本次拖动记录撤销快照（首次真正移动前记录一次，避免逐帧刷栈） */
    recorded?: boolean;
  } | null>(null);
  const marqueeRef = useRef<{ x0: number; y0: number; moved: boolean } | null>(null);
  /** 刚完成一次框选拖拽：抑制紧随其后的 contextmenu */
  const justMarqueeRef = useRef(false);

  // —— 力导向布局：只计算没有坐标的卡片 ——
  const positions = useMemo(() => runForceLayout(cards, edges), [cards, edges]);
  const posFor = useCallback(
    (c: LoreEntry) =>
      c.x !== undefined && c.y !== undefined
        ? { x: c.x, y: c.y }
        : positions.get(c.id) ?? { x: 0, y: 0 },
    [positions],
  );

  /** 节点 DOM 矩形（视口坐标） */
  const nodeScreenRect = useCallback((cardId: string) => {
    const el = nodeElsRef.current[cardId];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }, []);

  /** 卡片中心视口坐标（快捷连接 / 弹层锚点） */
  const cardCenterScreen = useCallback(
    (cardId: string): { x: number; y: number } => {
      const r = nodeScreenRect(cardId);
      if (r) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      const v = viewRef.current;
      const p = posFor(cards.find((c) => c.id === cardId) ?? { id: cardId, title: "", category: "", content: {}, tags: [] });
      const el = viewportRef.current;
      const rect = el?.getBoundingClientRect();
      return {
        x: (rect?.left ?? 0) + (p.x * v.zoom + v.x) * (rect ? rect.width / el!.clientWidth : 1),
        y: (rect?.top ?? 0) + (p.y * v.zoom + v.y) * (rect ? rect.height / el!.clientHeight : 1),
      };
    },
    [nodeScreenRect, posFor, cards],
  );

  /** 视口坐标 → 世界坐标（时间轴同款算法） */
  const clientToWorld = useCallback((clientX: number, clientY: number) => {
    const el = viewportRef.current;
    const r = el?.getBoundingClientRect();
    const v = viewRef.current;
    const rx = r?.left ?? 0;
    const ry = r?.top ?? 0;
    return { x: (clientX - rx - v.x) / v.zoom, y: (clientY - ry - v.y) / v.zoom };
  }, []);

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

  // —— 测量卡片尺寸 ——
  useLayoutEffect(() => {
    const next: Record<string, { w: number; h: number }> = {};
    for (const [id, el] of Object.entries(nodeElsRef.current)) {
      if (el) next[id] = { w: el.offsetWidth, h: el.offsetHeight };
    }
    sizesRef.current = next;
  }, [cards]);

  // —— 自适应缩放：让全部卡片 + 边恰好进入视口（纯计算，供「适应全部」与截图导出共用） ——
  const computeFitView = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return null;
    if (cards.length === 0) return { x: 0, y: 0, zoom: 1 };
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const c of cards) {
      const p = posFor(c);
      x0 = Math.min(x0, p.x - NODE_W / 2);
      x1 = Math.max(x1, p.x + NODE_W / 2);
      y0 = Math.min(y0, p.y - NODE_H / 2);
      y1 = Math.max(y1, p.y + NODE_H / 2);
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
  }, [cards, posFor]);

  const fit = useCallback(() => {
    const v = computeFitView();
    if (v) setView(v);
  }, [computeFitView]);

  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  // —— 截图式 PNG 导出：适应全部 → 截取应用内 DOM → 还原视图（供右上角导出按钮调用） ——
  useEffect(() => {
    return registerLoreCapture(instanceId, async () => {
      const el = viewportRef.current;
      if (!el) return null;
      const prev = viewRef.current;
      const fitView = computeFitView();
      if (fitView) setView(fitView);
      try {
        await waitForPaint();
        const target = viewportRef.current;
        if (!target) return null;
        return await captureElementToPng(target);
      } finally {
        if (fitView) setView(prev);
      }
    });
  }, [instanceId, computeFitView]);

  // ④ 网格「在导向图中显示」：图视图挂载时定位到选中卡片
  useEffect(() => {
    const id = view?.selectedCardId;
    if (!id) return;
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    const p = posFor(card);
    const el = viewportRef.current;
    const t = window.setTimeout(() => {
      if (el) {
        setView({
          x: el.clientWidth / 2 - p.x * 1,
          y: el.clientHeight / 2 - p.y * 1,
          zoom: 1,
        });
      }
    }, 60);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // —— 滚轮缩放（以光标为中心） ——
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

  // —— 统一 pointerdown：左键拖节点/平移，右键弹菜单/框选 ——
  const onViewportPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const target = e.target as HTMLElement;
    const nodeEl = target.closest?.("[data-lore-node]") as HTMLElement | null;
    const edgeEl = target.closest?.("[data-lore-edge]") as HTMLElement | null;

    if (e.button === 0) {
      if (connectLine) {
        if (nodeEl) {
          const nid = nodeEl.dataset.loreNode;
          if (nid && fileId) {
            for (const sid of connectLine.sourceIds) {
              if (sid !== nid) addEdge(instanceId, fileId, sid, nid, undefined, edgeColor);
            }
          }
          setConnectLine(null);
          return;
        }
        setConnectLine(null);
        return;
      }
      // 拖节点
      if (nodeEl && fileId) {
        const nid = nodeEl.dataset.loreNode!;
        e.preventDefault();
        const group = boxSel.has(nid) ? [...boxSel] : [nid];
        const startWorld = new Map<string, { x: number; y: number }>();
        for (const gid of group) {
          const c = cards.find((x) => x.id === gid);
          if (c) startWorld.set(gid, posFor(c));
        }
        dragRef.current = {
          mode: "node",
          nodeId: nid,
          group,
          startWorld,
          startClientX: e.clientX,
          startClientY: e.clientY,
          startViewX: viewRef.current.x,
          startViewY: viewRef.current.y,
          moved: false,
          recorded: false,
        };
        if (!boxSel.has(nid)) setBoxSel(new Set());
        return;
      }
      if (edgeEl) return;
      // 拖空白平移
      e.preventDefault();
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
      return;
    }

    if (e.button !== 2) return;

    // 右键卡片：只阻止默认，弹菜单交给 contextmenu 处理。
    // （若在此处 pointerdown 立即弹菜单，随后释放触发的 contextmenu 会落在菜单遮罩上并关闭它）
    if (nodeEl) {
      e.preventDefault();
      return;
    }
    if (edgeEl) {
      e.preventDefault();
      return; // 边右键由 onContextMenu 处理
    }
    // 右键空白：框选手势（点击则由 contextmenu 弹创建菜单）
    e.preventDefault();
    setPaneMenu(null);
    setMarquee(null);
    setConnectLine(null);
    setEdgeMenu(null);
    setMenu(null);
    setCardMenu(null);
    marqueeRef.current = { x0: e.clientX, y0: e.clientY, moved: false };
  };

  // —— 右键 contextmenu：防原生菜单 + 卡片菜单 / 边菜单 / 创建菜单 ——
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    // 刚完成框选：抑制随后弹出的 contextmenu
    if (justMarqueeRef.current) {
      justMarqueeRef.current = false;
      return;
    }
    const target = e.target as HTMLElement;
    const nodeEl = target.closest?.("[data-lore-node]") as HTMLElement | null;
    const edgeEl = target.closest?.("[data-lore-edge]") as HTMLElement | null;
    if (nodeEl) {
      const nid = nodeEl.dataset.loreNode;
      if (nid) {
        setPaneMenu(null);
        setMarquee(null);
        setEdgeMenu(null);
        setMenu(null);
        setConnectLine(null);
        const inGroup = boxSel.has(nid) && boxSel.size > 1;
        openCardMenu(inGroup ? [...boxSel] : [nid], nid, e.clientX, e.clientY);
      }
      return;
    }
    if (edgeEl) {
      const eid = edgeEl.dataset.loreEdge;
      const edge = edges.find((x) => x.id === eid);
      setEdgeDraft(edge?.label ?? "");
      setSelectedEdgeId(eid ?? null);
      setCardMenu(null);
      setEdgeMenu({ edgeId: eid!, mode: "context", x: e.clientX, y: e.clientY });
      return;
    }
    // 空白：点击（未框选）→ 创建菜单
    const m = marqueeRef.current;
    marqueeRef.current = null;
    setMarquee(null);
    if (!m?.moved) setPaneMenu({ x: e.clientX, y: e.clientY });
  };

  // —— 全局 pointermove / pointerup：拖动 + 框选 ——
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      // 节点拖动 / 平移
      const d = dragRef.current;
      if (d) {
        const dx = e.clientX - d.startClientX;
        const dy = e.clientY - d.startClientY;
        if (!d.moved && Math.hypot(dx, dy) < 4) return;
        d.moved = true;
        if (d.mode === "pan") {
          setView((v) => ({ ...v, x: d.startViewX + dx, y: d.startViewY + dy }));
        } else if (d.mode === "node" && fileId) {
          // 首次真正移动前记录一次撤销快照（拖动期间逐帧写位置，只入一次栈）
          if (!d.recorded) {
            d.recorded = true;
            useLoreStore.getState().record(instanceId);
          }
          const zoom = viewRef.current.zoom;
          for (const [gid, start] of d.startWorld) {
            moveCard(instanceId, fileId, gid, start.x + dx / zoom, start.y + dy / zoom);
          }
        }
        return;
      }
      // 框选
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
        if (!d.moved) {
          if (d.mode === "node" && d.nodeId) {
            setBoxSel(new Set());
            selectCard(instanceId, d.nodeId);
          } else if (d.mode === "pan") {
            // 单击空白：取消快捷连接/清框选/取消边选中/关卡片菜单
            setConnectLine(null);
            setBoxSel(new Set());
            setSelectedEdgeId(null);
            setCardMenu(null);
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
          for (const c of cards) {
            const p = posFor(c);
            if (p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) selected.add(c.id);
          }
          setBoxSel(selected);
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
  }, [fileId, instanceId, moveCard, selectCard, clientToWorld, cards, posFor]);

  // —— 快捷连接橡皮筋跟随鼠标 ——
  useEffect(() => {
    if (!connectLine) return;
    const onMove = (e: PointerEvent) =>
      setConnectLine((c) => (c ? { ...c, x: e.clientX, y: e.clientY } : c));
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [!!connectLine]);

  // —— Esc 取消一切手势/菜单 ——
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setConnectLine(null);
        setMarquee(null);
        setPaneMenu(null);
        setEdgeMenu(null);
        setMenu(null);
        setCardMenu(null);
        setEdgeColorPicker(null);
        dragRef.current = null;
        marqueeRef.current = null;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // —— 卡片右键菜单动作 ——
  const openCardMenu = (ids: string[], currentId: string, x: number, y: number) =>
    setCardMenu({ ids, currentId, x, y });
  const menuEdit = () => {
    if (!cardMenu) return;
    const c = cards.find((x) => x.id === cardMenu.currentId);
    if (c) openCard(instanceId, c.id);
    setCardMenu(null);
  };
  const menuConnect = () => {
    if (!cardMenu) return;
    setTargetId(null);
    setRelName("");
    setRelSearch("");
    setEdgeMenu(null);
    setPaneMenu(null);
    setConnectLine(null);
    setMenu({ sourceIds: cardMenu.ids, x: cardMenu.x, y: cardMenu.y });
    setCardMenu(null);
  };
  const menuQuickConnect = () => {
    if (!cardMenu) return;
    setPaneMenu(null);
    setMenu(null);
    setEdgeMenu(null);
    setConnectLine({ sourceIds: cardMenu.ids, x: cardMenu.x, y: cardMenu.y });
    setCardMenu(null);
  };
  const menuDelete = () => {
    if (!cardMenu) return;
    onDeleteCards?.(cards.filter((c) => cardMenu.ids.includes(c.id)));
    setBoxSel(new Set());
    setCardMenu(null);
  };
  const menuClearSel = () => {
    setBoxSel(new Set());
    setCardMenu(null);
  };

  const saveEdgeLabel = (label: string) => {
    if (!edgeMenu || !fileId) return;
    updateEdge(instanceId, fileId, edgeMenu.edgeId, {
      label: label.trim() || undefined,
      labelColor: edgeLabelColor,
    });
    setEdgeMenu(null);
  };

  const deleteEdgeById = () => {
    if (!edgeMenu || !fileId) return;
    deleteEdge(instanceId, fileId, edgeMenu.edgeId);
    setEdgeMenu(null);
  };

  // —— 连线颜色替换 ——
  const openEdgeColorPicker = (edgeId: string, field: "color" | "labelColor", x: number, y: number) => {
    const edge = edges.find((e) => e.id === edgeId);
    const cur = edge
      ? field === "color"
        ? edge.color ?? DEFAULT_EDGE_COLOR
        : edge.labelColor ?? DEFAULT_LABEL_COLOR
      : DEFAULT_EDGE_COLOR;
    setEdgeColorDraft(cur);
    setEdgeColorPicker({ edgeId, field, x, y });
    setEdgeMenu(null);
  };
  const applyEdgeColor = () => {
    if (!edgeColorPicker || !fileId) return;
    updateEdge(instanceId, fileId, edgeColorPicker.edgeId, {
      [edgeColorPicker.field]: edgeColorDraft,
    } as Partial<LoreEdge>);
    setEdgeColorPicker(null);
  };
  const replaceEdgeColorWithCurrent = () => {
    if (!edgeMenu || !fileId) return;
    updateEdge(instanceId, fileId, edgeMenu.edgeId, { color: edgeColor });
    setEdgeMenu(null);
  };
  const replaceLabelColorWithCurrent = () => {
    if (!edgeMenu || !fileId) return;
    updateEdge(instanceId, fileId, edgeMenu.edgeId, { labelColor: edgeLabelColor });
    setEdgeMenu(null);
  };

  const commitConnect = () => {
    if (!menu || !targetId || !fileId) return;
    const hasLabel = relName.trim().length > 0;
    for (const sid of menu.sourceIds) {
      addEdge(instanceId, fileId, sid, targetId, relName, edgeColor, hasLabel ? edgeLabelColor : undefined);
    }
    setMenu(null);
  };

  const handlePaneCreate = () => {
    if (!fileId || !paneMenu) return;
    const w = clientToWorld(paneMenu.x, paneMenu.y);
    const card = addCard(instanceId, fileId, {
      title: "",
      x: w.x - NODE_W / 2,
      y: w.y - NODE_H / 2,
    });
    if (card) openCard(instanceId, card.id);
    setPaneMenu(null);
  };

  // 快捷连接起点：多个来源时取各来源卡片中心的中点
  const sourceCenter =
    connectLine && connectLine.sourceIds.length > 0
      ? (() => {
          let cx = 0;
          let cy = 0;
          for (const sid of connectLine.sourceIds) {
            const c = cardCenterScreen(sid);
            cx += c.x;
            cy += c.y;
          }
          const n = connectLine.sourceIds.length;
          return { x: cx / n, y: cy / n };
        })()
      : null;

  // —— 边（世界层 SVG 直线） ——
  const edgeLines = edges.map((e) => {
    const s = cards.find((c) => c.id === e.source);
    const t = cards.find((c) => c.id === e.target);
    if (!s || !t) return null;
    const sp = posFor(s);
    const tp = posFor(t);
    const dx = tp.x - sp.x;
    const dy = tp.y - sp.y;
    const len = Math.hypot(dx, dy) || 1;
    const lx = (sp.x + tp.x) / 2 + (-dy / len) * EDGE_LABEL_OFFSET;
    const ly = (sp.y + tp.y) / 2 + (dx / len) * EDGE_LABEL_OFFSET;
    const editing = edgeMenu?.mode === "edit" && edgeMenu.edgeId === e.id;
    return (
      <g key={e.id}>
        {/* 命中层：透明粗线便于点击；单击选中高亮，双击就地编辑关系名 */}
        <line
          data-lore-edge={e.id}
          x1={sp.x}
          y1={sp.y}
          x2={tp.x}
          y2={tp.y}
          stroke="transparent"
          strokeWidth={16}
          style={{ pointerEvents: "auto", cursor: "pointer" }}
          onClick={(ev) => {
            ev.stopPropagation();
            setSelectedEdgeId(e.id);
          }}
          onDoubleClick={(ev) => {
            ev.stopPropagation();
            setSelectedEdgeId(e.id);
            setEdgeDraft(e.label ?? "");
            setEdgeMenu({ edgeId: e.id, mode: "edit", x: ev.clientX, y: ev.clientY });
          }}
        />
        <line
          x1={sp.x}
          y1={sp.y}
          x2={tp.x}
          y2={tp.y}
          stroke={selectedEdgeId === e.id ? "#d7b25c" : (e.color ?? DEFAULT_EDGE_COLOR)}
          strokeWidth={selectedEdgeId === e.id ? 2 : 1.5}
          style={{ pointerEvents: "none" }}
        />
        {!editing && e.label && (
          <text
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={e.labelColor ?? DEFAULT_LABEL_COLOR}
            fontSize={11}
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            {e.label}
          </text>
        )}
      </g>
    );
  });

  // —— 点阵背景 ——
  const gap = Math.max(DOT_GAP * viewState.zoom, 1);
  const dotStyle: React.CSSProperties = {
    backgroundImage:
      "radial-gradient(circle, color-mix(in srgb, var(--color-fg-muted) 22%, transparent) 1px, transparent 1px)",
    backgroundSize: `${gap}px ${gap}px`,
    backgroundPosition: `${viewState.x % gap}px ${viewState.y % gap}px`,
  };

  return (
    <>
      <div
        ref={viewportRef}
        className="relative h-full w-full select-none overflow-hidden"
        style={{ touchAction: "none" }}
        onPointerDown={onViewportPointerDown}
        onContextMenu={onContextMenu}
        onDoubleClick={(e) => {
          e.preventDefault();
        }}
      >
        {/* 点阵背景 */}
        <div className="absolute inset-0" style={dotStyle} />

        {/* 世界层 */}
        <div
          className="absolute inset-0 overflow-visible"
          style={{
            transform: `translate(${viewState.x}px, ${viewState.y}px) scale(${viewState.zoom})`,
            transformOrigin: "0 0",
          }}
        >
          {/* 边 */}
          <svg className="absolute left-0 top-0 h-1 w-1 overflow-visible">
            {edgeLines}
          </svg>

          {/* 节点卡片 */}
          {cards.map((c) => {
            const p = posFor(c);
            const size = sizesRef.current[c.id];
            const w = size?.w ?? NODE_W;
            const h = size?.h ?? NODE_H;
            const isSel = boxSel.has(c.id) || c.id === view?.selectedCardId;
            return (
              <div
                key={c.id}
                data-lore-node={c.id}
                ref={(el) => {
                  nodeElsRef.current[c.id] = el;
                }}
                style={{ left: p.x - w / 2, top: p.y - h / 2 }}
                className="absolute"
              >
                <LoreCardContent
                  card={c}
                  tags={tags}
                  selected={isSel}
                  onEdit={() => openCard(instanceId, c.id)}
                />
              </div>
            );
          })}
        </div>

        {/* 左下角缩放控件（截图导出时经 data-overlay 排除） */}
        <div data-overlay className="absolute bottom-3 left-3 z-10 flex flex-col overflow-hidden rounded-lg border border-line/70 bg-app/90 shadow-sm">
          <button
            title="放大"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              const el = viewportRef.current;
              const cx = (el?.clientWidth ?? 0) / 2;
              const cy = (el?.clientHeight ?? 0) / 2;
              const v = viewRef.current;
              const w = (cx - v.x) / v.zoom;
              const h = (cy - v.y) / v.zoom;
              const zoom = clamp(v.zoom * 1.2, MIN_ZOOM, MAX_ZOOM);
              setView({ x: cx - w * zoom, y: cy - h * zoom, zoom });
            }}
            className="flex h-7 w-7 items-center justify-center text-fg-muted transition-colors hover:bg-hover hover:text-fg"
          >
            <Plus className="size-4" />
          </button>
          <button
            title="缩小"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              const el = viewportRef.current;
              const cx = (el?.clientWidth ?? 0) / 2;
              const cy = (el?.clientHeight ?? 0) / 2;
              const v = viewRef.current;
              const w = (cx - v.x) / v.zoom;
              const h = (cy - v.y) / v.zoom;
              const zoom = clamp(v.zoom / 1.2, MIN_ZOOM, MAX_ZOOM);
              setView({ x: cx - w * zoom, y: cy - h * zoom, zoom });
            }}
            className="flex h-7 w-7 items-center justify-center border-y border-line/60 text-fg-muted transition-colors hover:bg-hover hover:text-fg"
          >
            <Minus className="size-4" />
          </button>
          <button
            title="适应全部卡片"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={fit}
            className="flex h-7 w-7 items-center justify-center text-fg-muted transition-colors hover:bg-hover hover:text-fg"
          >
            <Maximize2 className="size-4" />
          </button>
        </div>
      </div>

      {/* —— 屏幕坐标弹层（Portal 到 body，规避 CSS zoom 偏移） —— */}

      {/* 快捷连接线段 */}
      {connectLine &&
        sourceCenter &&
        createPortal(
          <svg
            className="pointer-events-none fixed inset-0 z-[45]"
            style={{ width: "100vw", height: "100vh" }}
          >
            <line
              x1={sourceCenter.x}
              y1={sourceCenter.y}
              x2={connectLine.x}
              y2={connectLine.y}
              stroke={edgeColor}
              strokeWidth={2}
            />
            <circle cx={sourceCenter.x} cy={sourceCenter.y} r={4.5} fill={edgeColor} />
            <text x={connectLine.x + 12} y={connectLine.y - 8} fontSize={11} fill={edgeColor} className="select-none">
              {connectLine.sourceIds.length > 1
                ? `整体连接（${connectLine.sourceIds.length} 个）· 左键点击目标 · 点空白/Esc 取消`
                : "左键点击卡片建立连接 · 点空白/Esc 取消"}
            </text>
          </svg>,
          document.body,
        )}

      {/* 框选矩形 */}
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

      {/* 连接面板（单个或多个来源） */}
      {menu &&
        createPortal(
          <ConnectMenu
            sources={menu.sourceIds
              .map((id) => cards.find((c) => c.id === id))
              .filter((c): c is LoreEntry => !!c)}
            candidates={cards}
            edges={edges}
            x={menu.x}
            y={menu.y}
            targetId={targetId}
            setTargetId={setTargetId}
            relName={relName}
            setRelName={setRelName}
            relSearch={relSearch}
            setRelSearch={setRelSearch}
            onConnect={commitConnect}
            onDeleteEdge={(edgeId) => fileId && deleteEdge(instanceId, fileId, edgeId)}
            onClose={() => setMenu(null)}
          />,
          document.body,
        )}

      {/* 右键空白创建菜单 */}
      {paneMenu &&
        createPortal(
          <PaneMenu
            x={paneMenu.x}
            y={paneMenu.y}
            onCreate={handlePaneCreate}
            onClose={() => setPaneMenu(null)}
          />,
          document.body,
        )}

      {/* 右键卡片上下文菜单 */}
      {cardMenu &&
        createPortal(
          <CardMenu
            multi={cardMenu.ids.length > 1}
            count={cardMenu.ids.length}
            x={cardMenu.x}
            y={cardMenu.y}
            onEdit={menuEdit}
            onConnect={menuConnect}
            onQuickConnect={menuQuickConnect}
            onDelete={menuDelete}
            onClearSel={menuClearSel}
            onClose={() => setCardMenu(null)}
          />,
          document.body,
        )}

      {/* 线段右键菜单 */}
      {edgeMenu?.mode === "context" &&
        createPortal(
          <EdgeMenu
            x={edgeMenu.x}
            y={edgeMenu.y}
            onEditMode={() => setEdgeMenu((m) => (m ? { ...m, mode: "edit" } : m))}
            onReplaceColor={() =>
              openEdgeColorPicker(edgeMenu.edgeId, "color", edgeMenu.x, edgeMenu.y)
            }
            onReplaceCurrentColor={replaceEdgeColorWithCurrent}
            onReplaceLabelColor={() =>
              openEdgeColorPicker(edgeMenu.edgeId, "labelColor", edgeMenu.x, edgeMenu.y)
            }
            onReplaceCurrentLabelColor={replaceLabelColorWithCurrent}
            onDelete={deleteEdgeById}
            onClose={() => setEdgeMenu(null)}
          />,
          document.body,
        )}

      {/* 连线颜色替换取色面板 */}
      {edgeColorPicker &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setEdgeColorPicker(null)} />
            <div
              className="fixed z-50 overflow-hidden rounded-xl border border-line/70 bg-app shadow-pop"
              style={{
                left: Math.min(edgeColorPicker.x, window.innerWidth - 268),
                top: Math.min(edgeColorPicker.y, window.innerHeight - 320),
              }}
            >
              <div className="flex items-center justify-between border-b border-line/50 px-3 py-1.5">
                <span className="text-[11px] font-medium text-fg">
                  {edgeColorPicker.field === "color" ? "替换连接线颜色" : "替换关系文本颜色"}
                </span>
                <button
                  onClick={() => setEdgeColorPicker(null)}
                  title="关闭"
                  className="flex h-5 w-5 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <ColorPickerPanel value={edgeColorDraft} onChange={setEdgeColorDraft} />
              <div className="flex justify-end gap-2 border-t border-line/50 px-3 py-2">
                <button
                  onClick={() => setEdgeColorPicker(null)}
                  className="rounded-md px-2.5 py-1 text-xs text-fg-muted transition-colors hover:bg-hover hover:text-fg"
                >
                  取消
                </button>
                <button
                  onClick={applyEdgeColor}
                  className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90"
                >
                  应用
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}

      {/* 线段关系名编辑（弹窗） */}
      <Dialog open={edgeMenu?.mode === "edit"} onOpenChange={(open) => !open && setEdgeMenu(null)}>
        <DialogContent className="w-[min(320px,92vw)]">
          <DialogHeader>
            <DialogTitle>编辑关系名</DialogTitle>
          </DialogHeader>
          <input
            autoFocus
            value={edgeDraft}
            onChange={(e) => setEdgeDraft(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") saveEdgeLabel(edgeDraft);
              if (e.key === "Escape") setEdgeMenu(null);
            }}
            placeholder="关系名（可留空）"
            className="h-9 w-full rounded-lg border border-line bg-app px-2.5 text-sm text-fg outline-none placeholder:text-fg-muted/50 focus:border-accent/50"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEdgeMenu(null)}>
              取消
            </Button>
            <Button onClick={() => saveEdgeLabel(edgeDraft)}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** 包一层（与旧版签名一致，供 lorePane 引用） */
export function LoreGraphRoot({
  onDeleteCard,
  onDeleteCards,
}: {
  onDeleteCard?: (card: LoreEntry) => void;
  onDeleteCards?: (cards: LoreEntry[]) => void;
}) {
  return <LoreGraph onDeleteCard={onDeleteCard} onDeleteCards={onDeleteCards} />;
}

// ================= 卡片内容（纯展示；操作移入右键弹窗） =================

function LoreCardContent({
  card,
  tags,
  selected,
  onEdit,
}: {
  card: LoreEntry;
  tags: LoreTag[];
  selected: boolean;
  onEdit: () => void;
}) {
  const cardTags = card.tags
    .map((t) => tags.find((x) => x.id === t))
    .filter((t): t is LoreTag => !!t);
  return (
    <div
      className={cn(
        // 注意：不加 backdrop-blur / transition-all —— 拖拽时每帧重算毛玻璃会严重拖慢节点跟手
        "group relative w-[190px] rounded-xl border bg-app/95 p-2.5 shadow-sm",
        selected ? "border-accent ring-2 ring-accent/40" : "border-line",
      )}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onEdit();
      }}
    >
      <div className="flex items-center gap-1.5">
        <BookMarked className="size-3.5 shrink-0 text-accent" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg-strong">
          {card.title || "未命名设定"}
        </span>
      </div>
      {/* 单行完整显示标签内容；超出卡片宽度即隐藏（不显示数量） */}
      <div className="mt-1 flex min-w-0 items-center gap-1 overflow-hidden">
        {cardTags.map((t) => (
          <span
            key={t.id}
            title={t.name}
            className="shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px]"
            style={{ background: t.color + "26", color: t.color }}
          >
            {t.name}
          </span>
        ))}
      </div>
      {card.note && <div className="mt-1 truncate text-[10px] text-fg-muted">{card.note}</div>}
    </div>
  );
}

// ================= 右键卡片上下文菜单 =================

function CardMenu({
  multi,
  count,
  x,
  y,
  onEdit,
  onConnect,
  onQuickConnect,
  onDelete,
  onClearSel,
  onClose,
}: {
  multi: boolean;
  count: number;
  x: number;
  y: number;
  onEdit: () => void;
  onConnect: () => void;
  onQuickConnect: () => void;
  onDelete: () => void;
  onClearSel: () => void;
  onClose: () => void;
}) {
  const pos = clampMenu(x, y, 190, multi ? 176 : 152);
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
        className="fixed z-50 w-[190px] overflow-hidden rounded-xl border border-line/70 bg-app shadow-pop"
        style={pos}
      >
        <div className="p-1">
          <div className="px-2 pb-1 pt-1.5 text-[10px] font-semibold tracking-[0.14em] text-fg-muted">
            {multi ? `已选 ${count} 个设定` : "设定操作"}
          </div>
          <button
            onClick={onEdit}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-fg transition-colors hover:bg-hover"
          >
            <Pencil className="size-3.5 text-fg-muted" /> 编辑{multi ? "（当前卡）" : ""}
          </button>
          <button
            onClick={onConnect}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-fg transition-colors hover:bg-hover"
          >
            <Link2 className="size-3.5 text-fg-muted" /> {multi ? "整体连接…" : "连接…"}
          </button>
          <button
            onClick={onQuickConnect}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-fg transition-colors hover:bg-hover"
          >
            <MousePointer2 className="size-3.5 text-fg-muted" /> {multi ? "整体快速连接" : "快速连接"}
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
            <Trash2 className="size-3.5" /> {multi ? `删除选中（${count}）` : "删除"}
          </button>
        </div>
      </div>
    </>
  );
}

// ================= 右键空白创建菜单 =================

function PaneMenu({
  x,
  y,
  onCreate,
  onClose,
}: {
  x: number;
  y: number;
  onCreate: () => void;
  onClose: () => void;
}) {
  const pos = clampMenu(x, y, 150, 44);
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
        className="fixed z-50 w-[150px] overflow-hidden rounded-xl border border-line/70 bg-app shadow-pop"
        style={pos}
      >
        <button
          onClick={onCreate}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs text-fg transition-colors hover:bg-hover"
        >
          <Plus className="size-3.5 text-accent" /> 新建设定（此处）
        </button>
      </div>
    </>
  );
}

// ================= 线段右键菜单 =================

function EdgeMenu({
  x,
  y,
  onEditMode,
  onReplaceColor,
  onReplaceCurrentColor,
  onReplaceLabelColor,
  onReplaceCurrentLabelColor,
  onDelete,
  onClose,
}: {
  x: number;
  y: number;
  onEditMode: () => void;
  onReplaceColor: () => void;
  onReplaceCurrentColor: () => void;
  onReplaceLabelColor: () => void;
  onReplaceCurrentLabelColor: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const pos = clampMenu(x, y, 196, 248);
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
        className="fixed z-50 w-[196px] overflow-hidden rounded-xl border border-line/70 bg-app shadow-pop"
        style={pos}
      >
        <div className="p-1">
          <div className="px-2 pb-1 pt-1.5 text-[10px] font-semibold tracking-[0.14em] text-fg-muted">
            连线操作
          </div>
          <button
            onClick={onEditMode}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-fg transition-colors hover:bg-hover"
          >
            <Pencil className="size-3.5 text-fg-muted" /> 编辑关系名
          </button>
          <button
            onClick={onReplaceColor}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-fg transition-colors hover:bg-hover"
          >
            <Palette className="size-3.5 text-fg-muted" /> 替换连接线颜色…
          </button>
          <button
            onClick={onReplaceCurrentColor}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-fg transition-colors hover:bg-hover"
          >
            <MousePointer2 className="size-3.5 text-fg-muted" /> 替换为当前连接线颜色
          </button>
          <button
            onClick={onReplaceLabelColor}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-fg transition-colors hover:bg-hover"
          >
            <Type className="size-3.5 text-fg-muted" /> 替换关系文本颜色…
          </button>
          <button
            onClick={onReplaceCurrentLabelColor}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-fg transition-colors hover:bg-hover"
          >
            <Type className="size-3.5 text-fg-muted" /> 替换为当前关系文本颜色
          </button>
          <button
            onClick={onDelete}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-danger transition-colors hover:bg-danger/10"
          >
            <Trash2 className="size-3.5" /> 删除连线
          </button>
        </div>
      </div>
    </>
  );
}

// ================= 连接面板（单个或多个来源） =================

function ConnectMenu({
  sources,
  candidates,
  edges,
  x,
  y,
  targetId,
  setTargetId,
  relName,
  setRelName,
  relSearch,
  setRelSearch,
  onConnect,
  onDeleteEdge,
  onClose,
}: {
  sources: LoreEntry[];
  candidates: LoreEntry[];
  edges: LoreEdge[];
  x: number;
  y: number;
  targetId: string | null;
  setTargetId: (id: string | null) => void;
  relName: string;
  setRelName: (s: string) => void;
  relSearch: string;
  setRelSearch: (s: string) => void;
  onConnect: () => void;
  onDeleteEdge: (edgeId: string) => void;
  onClose: () => void;
}) {
  const q = relSearch.trim().toLowerCase();
  const sourceIds = new Set(sources.map((s) => s.id));
  // 已与任一来源相连的卡片不再作为可连接目标，避免重复建立连线
  const connectedIds = new Set<string>();
  for (const e of edges) {
    if (sourceIds.has(e.source)) connectedIds.add(e.target);
    if (sourceIds.has(e.target)) connectedIds.add(e.source);
  }
  const filtered = candidates.filter(
    (c) => !sourceIds.has(c.id) && !connectedIds.has(c.id) && c.title.toLowerCase().includes(q),
  );
  const multi = sources.length > 1;
  // 单卡连接面板展示已有关联（可点击删除）；整体连接不展示
  const related = !multi
    ? edges.filter((e) => sourceIds.has(e.source) || sourceIds.has(e.target))
    : [];

  const pos = clampMenu(x, y, 240, 400);

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
        className="fixed z-50 w-[240px] overflow-hidden rounded-xl border border-line/70 bg-app shadow-pop"
        style={pos}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line/50 px-3 py-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-fg">
            <Link2 className="size-3.5 text-accent" />
            {multi ? `整体连接（${sources.length} 个）` : `连接「${sources[0]?.title ?? "…"}」`}
          </span>
          <button onClick={onClose} className="flex h-5 w-5 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg">
            <X className="size-3.5" />
          </button>
        </div>

        <div className="space-y-2 p-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-fg-muted" />
            <input
              autoFocus
              value={relSearch}
              onChange={(e) => {
                setRelSearch(e.target.value);
                setTargetId(null);
              }}
              placeholder="搜索要连接的设定…"
              className="h-7 w-full rounded-md border border-line/70 bg-app pl-7 pr-2 text-xs text-fg outline-none placeholder:text-fg-muted/50 focus:border-accent/40"
            />
          </div>
          <div className="max-h-28 space-y-0.5 overflow-y-auto">
            {filtered.slice(0, 8).map((c) => (
              <button
                key={c.id}
                onClick={() => setTargetId(c.id)}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs transition-colors",
                  targetId === c.id ? "bg-accent-soft text-accent" : "text-fg hover:bg-hover",
                )}
              >
                <BookMarked className="size-3 shrink-0 text-fg-muted" />
                <span className="truncate">{c.title || "未命名设定"}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-2 py-2 text-center text-[11px] text-fg-muted">
                {q ? "未找到匹配卡片" : "没有可连接的设定"}
              </div>
            )}
          </div>

          <input
            value={relName}
            onChange={(e) => setRelName(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" && targetId) onConnect();
              if (e.key === "Escape") onClose();
            }}
            placeholder="关系名（如：师徒 / 敌对），可留空"
            className="h-7 w-full rounded-md border border-line/70 bg-app px-2 text-xs text-fg outline-none placeholder:text-fg-muted/50 focus:border-accent/40"
          />
          <button
            onClick={onConnect}
            disabled={!targetId}
            className="flex w-full items-center justify-center gap-1 rounded-md bg-accent px-2 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
          >
            <Link2 className="size-3.5" /> {multi ? `整体连接（${sources.length} → 1）` : "建立连接"}
          </button>
        </div>

        {/* 单卡连接：已有关联（可点击删除） */}
        {!multi && related.length > 0 && (
          <div className="max-h-28 overflow-y-auto border-t border-line/50 p-1.5">
            <div className="px-2 pb-1 pt-1 text-[10px] font-semibold tracking-[0.14em] text-fg-muted">
              已有关联
            </div>
            {related.slice(0, 5).map((e) => {
              const other = candidates.find(
                (c) => c.id === (sourceIds.has(e.source) ? e.target : e.source),
              );
              return (
                <button
                  key={e.id}
                  onClick={() => onDeleteEdge(e.id)}
                  title="点击删除该连线"
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px] text-fg-muted transition-colors hover:bg-danger/10 hover:text-danger"
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: e.color ?? DEFAULT_EDGE_COLOR }}
                  />
                  <span className="truncate">{other?.title ?? "…"}</span>
                  {e.label && <span className="truncate text-fg-muted/70">· {e.label}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

