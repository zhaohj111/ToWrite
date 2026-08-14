// ResizableImage —— 可拖拽边缘改大小的图片扩展。
// 免费版 @tiptap/extension-image 不支持 resizable，这里自定义节点视图：
// 选中图片时在四边/四角渲染拖拽手柄，指针拖动实时预览，松手提交 width/height 属性。
// 纵横比：角点保持当前纵横比，纯边只改单边。边/角按「相对起点位移」计算，1:1 跟手。
// 自适应：图片插入且未显式设宽、原图宽于内容区时，加载后自动缩窄到内容区宽度（高度按纵横比）。
//
// 旋转（物理旋转）：width/height 属性始终存「物理显示宽高」；rotation 0/90/180/270。
//   奇数 90° 时属性随旋转互换（如 400×300 顺时针 → 300×400），占位框与拖拽手柄跟随旋转方向。
//   渲染：外层占位框用物理宽高；内层 <img> 用「互换后的内容尺寸」+ transform 旋转到占位框内
//   （rotate ±90 绕左上角 + translate 归位，180 绕中心），避免内容被拉伸变形。

import Image from "@tiptap/extension-image";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { emitImageContextMenu } from "@/lib/editorBus";

type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const HANDLES: Handle[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

const HANDLE_CLASS: Record<Handle, string> = {
  n: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-n-resize",
  s: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-s-resize",
  e: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-e-resize",
  w: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-w-resize",
  ne: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize",
  nw: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
  se: "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize",
  sw: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
};

const MIN_SIZE = 24;
const MAX_SIZE = 2400;

interface DragState {
  axis: Handle;
  startX: number;
  startY: number;
  startW: number; // 起始尺寸
  startH: number;
}

export function ResizableImageView(props: NodeViewProps) {
  const { node, updateAttributes, deleteNode, selected } = props;
  const imgRef = useRef<HTMLImageElement>(null);
  // 外层物理占位框（宽高 = 属性物理值，旋转后即互换后的值）
  const boxRef = useRef<HTMLSpanElement>(null);
  const dragRef = useRef<DragState | null>(null);
  // 拖动中的实时预览尺寸（物理宽高）；null = 未拖动，展示 node.attrs 尺寸
  const [live, setLive] = useState<{ width: number; height: number } | null>(null);

  const attrW = node.attrs.width as number | null | undefined;
  const attrH = node.attrs.height as number | null | undefined;
  const rotation = ((Number(node.attrs.rotation) || 0) % 360) as number;
  const isVertical = rotation % 180 !== 0; // 90/270：物理宽高已互换
  // 物理显示宽高（属性值即物理值；拖动中实时预览优先）
  const dispW = live ? `${live.width}px` : attrW ? `${attrW}px` : "auto";
  const dispH = live ? `${live.height}px` : attrH ? `${attrH}px` : "auto";
  // 物理宽高数值（旋转归位平移用；auto 时为 null）
  const physW = live ? live.width : attrW ?? null;
  const physH = live ? live.height : attrH ?? null;
  // 内层 img 的内容尺寸：垂直旋转时取互换后的尺寸，保证内容不被拉伸
  const contentW = isVertical ? dispH : dispW;
  const contentH = isVertical ? dispW : dispH;

  const startDrag = (axis: Handle) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = imgRef.current;
    const box = boxRef.current;
    if (!el || !box) return;
    // 物理占位框：拖拽手柄与宽高计算都基于旋转后的物理宽高
    const rect = box.getBoundingClientRect();
    // 纵横比优先用原图尺寸（未加载完/变形时回退到渲染矩形），保证角点缩放不漂移；
    // 物理空间：垂直旋转（90/270）时宽高互换
    const srcAspect =
      el.naturalWidth > 0 && el.naturalHeight > 0
        ? el.naturalWidth / el.naturalHeight
        : rect.width > 0 && rect.height > 0
          ? rect.width / rect.height
          : 1;
    const aspect = isVertical ? 1 / srcAspect : srcAspect;
    dragRef.current = {
      axis,
      startX: e.clientX,
      startY: e.clientY,
      startW: rect.width,
      startH: rect.height,
    };
    // 拖动中的最新尺寸（onUp 提交用，避免依赖 React 重渲染时序）
    let lastW = rect.width;
    let lastH = rect.height;
    el.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      // 相对起点位移（含方向）：w 向右/上为正，n 轴取反 → 边角随鼠标 1:1 移动
      const dxW = d.axis.includes("w") ? -(ev.clientX - d.startX) : ev.clientX - d.startX;
      const dyH = d.axis.includes("n") ? -(ev.clientY - d.startY) : ev.clientY - d.startY;
      let w = d.startW;
      let h = d.startH;
      if (d.axis.length === 1) {
        // 纯边：只改对应单边
        if (d.axis === "e" || d.axis === "w") w = d.startW + dxW;
        else h = d.startH + dyH;
      } else {
        // 角点：按相对变化更大的轴驱动，另一轴按纵横比跟随，角始终贴近鼠标
        const wFromX = d.startW + dxW;
        const hFromY = d.startH + dyH;
        if (d.startH > 0 && Math.abs(dxW / d.startW) >= Math.abs(dyH / d.startH)) {
          w = wFromX;
          h = w / aspect;
        } else {
          h = hFromY;
          w = h * aspect;
        }
      }
      w = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(w)));
      h = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(h)));
      lastW = w;
      lastH = h;
      setLive({ width: w, height: h });
    };

    const onUp = () => {
      const d = dragRef.current;
      dragRef.current = null;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      setLive(null);
      // 尺寸有实际变化才提交属性（lastW/lastH 为拖动终点，规避对 DOM 布局的时序依赖）
      if (lastW !== Math.round(d!.startW) || lastH !== Math.round(d!.startH)) {
        updateAttributes({ width: lastW, height: lastH });
      }
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  };

  // 图片插入且未显式设宽、原图宽于内容区时，加载后自动缩窄到内容区宽度（高度按纵横比）。
  // 已旋转的图片跳过：旋转时会把自然尺寸物化进属性，自动缩窄只处理未旋转的自动大小图片。
  const handleLoad = () => {
    const el = imgRef.current;
    if (!el || attrW != null || rotation !== 0) return;
    const nw = el.naturalWidth;
    const nh = el.naturalHeight;
    if (!nw || !nh) return;
    const pm = el.closest(".ProseMirror");
    if (!pm) return;
    const cs = getComputedStyle(pm);
    const contentWidth = pm.clientWidth - parseFloat(cs.paddingLeft || "0") - parseFloat(cs.paddingRight || "0");
    if (nw > contentWidth) {
      updateAttributes({
        width: Math.round(contentWidth),
        height: Math.round((nh * contentWidth) / nw),
      });
    }
  };

  return (
    <NodeViewWrapper
      as="span"
      className="inline-block align-baseline"
      onContextMenu={(e: React.MouseEvent) => {
        // 图片右键：交给 EditorPane 弹菜单（删除图片 / 旋转）；阻止冒泡避免触发文本/表格菜单。
        // 操作走节点视图自身的 updateAttributes / deleteNode（与拖拽缩放同机制），不依赖跨组件传 pos。
        e.preventDefault();
        e.stopPropagation();
        emitImageContextMenu(e.nativeEvent, {
          rotate: (delta: number) => {
            const cur = (Number(node.attrs.rotation) || 0) as number;
            const next = (cur + delta + 360) % 360;
            const attrs: Record<string, unknown> = { rotation: next };
            let w = node.attrs.width as number | null | undefined;
            let h = node.attrs.height as number | null | undefined;
            // 无显式尺寸（自动大小）：以原图自然尺寸物化进属性，保证物理占位可互换
            if (w == null || h == null) {
              const el = imgRef.current;
              if (el && el.naturalWidth > 0 && el.naturalHeight > 0) {
                w = el.naturalWidth;
                h = el.naturalHeight;
                attrs.width = w;
                attrs.height = h;
              }
            }
            // 物理旋转：与垂直态（90/270）之间切换时互换宽高属性
            const wasVertical = cur % 180 !== 0;
            const isVerticalNext = next % 180 !== 0;
            if (wasVertical !== isVerticalNext && w != null && h != null) {
              attrs.width = h;
              attrs.height = w;
            }
            updateAttributes(attrs);
          },
          remove: () => deleteNode(),
        });
      }}
    >
      <span ref={boxRef} className="relative inline-block" style={{ width: dispW, height: dispH }}>
        <img
          ref={imgRef}
          src={node.attrs.src}
          alt={node.attrs.alt ?? ""}
          title={node.attrs.title ?? ""}
          draggable={false}
          data-drag-handle=""
          onLoad={handleLoad}
          className={cn("block max-w-none", selected && "ring-2 ring-accent")}
          style={{
            // 内容尺寸：垂直旋转时互换（避免内容被拉伸）；绕中心旋转后平移回占位框原点：
            // translate(dx, -dx) rotate(±90deg)，dx = (物理宽 − 物理高)/2
            width: contentW,
            height: contentH,
            transform:
              rotation === 0
                ? undefined
                : rotation === 180
                  ? "rotate(180deg)"
                  : dispW !== "auto" && dispH !== "auto" && physW != null && physH != null
                    ? `translate(${(physW - physH) / 2}px, ${(physH - physW) / 2}px) rotate(${rotation === 90 ? 90 : -90}deg)`
                    : `rotate(${rotation}deg)`,
          }}
        />
        {selected &&
          HANDLES.map((h) => (
            <span
              key={h}
              onPointerDown={startDrag(h)}
              className={cn(
                "absolute z-10 size-2.5 rounded-sm border border-white bg-accent shadow-md transition-transform hover:scale-125",
                HANDLE_CLASS[h],
              )}
            />
          ))}
      </span>
    </NodeViewWrapper>
  );
}

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => {
          const fromAttr = el.getAttribute("width");
          const fromStyle = el.style.width;
          const raw = fromAttr ?? (fromStyle && fromStyle.endsWith("px") ? fromStyle : null);
          const n = raw ? parseInt(raw, 10) : NaN;
          return Number.isFinite(n) && n > 0 ? n : null;
        },
        renderHTML: (attrs) => (attrs.width ? { style: `width:${attrs.width}px` } : {}),
      },
      height: {
        default: null,
        parseHTML: (el) => {
          const fromAttr = el.getAttribute("height");
          const fromStyle = el.style.height;
          const raw = fromAttr ?? (fromStyle && fromStyle.endsWith("px") ? fromStyle : null);
          const n = raw ? parseInt(raw, 10) : NaN;
          return Number.isFinite(n) && n > 0 ? n : null;
        },
        renderHTML: (attrs) => (attrs.height ? { style: `height:${attrs.height}px` } : {}),
      },
      // 显示旋转角（0/90/180/270），物理旋转：width/height 属性存物理宽高。
      // 编辑器内由节点视图渲染物理占位；序列化输出（图片型 PDF 导出）经
      // pdfRender.ts enhanceFragment 读取 data-rotation 做相同的物理占位处理。
      rotation: {
        default: 0,
        parseHTML: (el) => {
          const raw = el.getAttribute("data-rotation");
          const n = raw ? parseInt(raw, 10) : NaN;
          return [0, 90, 180, 270].includes(n) ? n : 0;
        },
        renderHTML: (attrs) => ({ "data-rotation": String(Number(attrs.rotation) || 0) }),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});
