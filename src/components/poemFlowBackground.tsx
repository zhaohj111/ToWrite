// 开始页背景效果：古诗文隐显（DOM + CSS 过渡），三层结构：
// - 底层：字号小、透明度高（淡），5~6 片；中间层：适中，3~4 片；顶层：最大最实，1~2 片；
// - 所有层淡入淡出时间统一（4.2s / 3.2s）；
// - 层容量满后：有新片要加入时，**先触发该层队列最前（最早加入）的一片淡出**，
//   待其完全离场后再加入新片（顺序执行，不交叉叠位；该层队列单独触发，互不干扰）；
// - 随机红色（强调色）逻辑不变（约 30%）；位置随机，不做重叠限制之外的排布；
// - 纵向书写，一联两列，列间落差最小 0.5 倍字号；
// - 字体为子集化的令东齐伋体 combo 版（仅含诗句用字，见 tools/subset-poem-font.mjs）。
// 仅当 startBackground === "poem" 时挂载。

import { useEffect, useRef, useState } from "react";
import { POEMS, type PoemEntry } from "@/lib/poems";
import { useLayoutStore } from "@/stores/layoutStore";

/** 诗文列（每列 = 一句，纵向书写） */
interface PoemCol {
  text: string;
  /** 列顶高低落差（px，相对首列顶部；最小 0.5 倍字号） */
  drop: number;
}

/** 分层定义 */
interface LayerDef {
  key: "bottom" | "middle" | "top";
  /** 各层容量 */
  cap: number;
  /** 字号相对基础字号的范围 */
  sizeMin: number;
  sizeMax: number;
  /** 透明度范围（底层高透明度=淡、顶层低透明度=实） */
  opacityMin: number;
  opacityMax: number;
}

const LAYERS: LayerDef[] = [
  { key: "bottom", cap: 12, sizeMin: 0.55, sizeMax: 0.8, opacityMin: 0.2, opacityMax: 0.34 },
  { key: "middle", cap: 6, sizeMin: 0.85, sizeMax: 1.1, opacityMin: 0.4, opacityMax: 0.58 },
  { key: "top", cap: 3, sizeMin: 1.25, sizeMax: 1.5, opacityMin: 0.75, opacityMax: 0.9 },
];

interface ActivePoem {
  key: number;
  entry: PoemEntry;
  layer: LayerDef["key"];
  x: number;
  y: number;
  size: number;
  accent: boolean;
  opacity: number;
  /** 片内列间距（绝对固定小值 px）与列高落差（该片固定绝对值 px） */
  gapPx: number;
  highDrop: number;
  cols: PoemCol[];
  visible: boolean;
  /** 估算包围盒（用于重叠检测） */
  rect: { x0: number; y0: number; x1: number; y1: number };
}

/** 淡入时长（ms） */
const FADE_IN_MS = 4200;
/** 淡出时长（ms，驱逐时） */
const FADE_OUT_MS = 3200;
/** 生成间隔（ms） */
const SPAWN_INTERVAL = 5200;
/** 强调色概率（主题色诗文，逻辑不变） */
const ACCENT_RATIO = 0.3;
/** 基础字号（相对窗口高度） */
const BASE_SIZE = 0.03;
/** 驱逐后重试生成的间隔（淡出完成 + 余量） */
const EVICT_RETRY_MS = FADE_OUT_MS + 250;

/** 字体栈：子集令东齐伋体 → 系统楷体回退 */
const FONT_STACK =
  "'Qiji Combo Poem', KaiTi, 'STKaiti', 'Kaiti SC', 'SimKai', serif";

function rectsOverlap(a: ActivePoem["rect"], b: ActivePoem["rect"]): boolean {
  return !(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0);
}

/** 评估放置位置：在页内（margin 4%）且避开现有诗文 */
function place(
  entry: PoemEntry,
  size: number,
  active: ActivePoem[],
  winW: number,
  winH: number,
): { x: number; y: number; rect: ActivePoem["rect"] } | null {
  const cols = entry.lines.length;
  const maxLen = Math.max(...entry.lines.map((s) => s.length));
  const w = size * cols + (cols - 1) * 10; // 列距 10px
  const h = size * (maxLen + 1);
  for (let t = 0; t < 12; t++) {
    const x = winW * (0.04 + Math.random() * 0.88);
    const y = winH * (0.045 + Math.random() * 0.72);
    const rect = { x0: x, y0: y, x1: x + w, y1: y + h };
    if (active.some((p) => rectsOverlap(rect, p.rect))) continue;
    return { x, y, rect };
  }
  return null;
}

export function PoemFlowBackground() {
  const enabled = useLayoutStore((s) => s.startBackground) === "poem";
  const [poems, setPoems] = useState<ActivePoem[]>([]);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 近期已显示的条目 id（近期优先避开，保证轮换感） */
  const recentRef = useRef<number[]>([]);
  const keyRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (retryRef.current) clearTimeout(retryRef.current);
    retryRef.current = null;
    recentRef.current = [];
    setPoems([]);

    const spawn = () => {
      setPoems((cur) => {
        const countOf = (k: LayerDef["key"]) => cur.filter((p) => p.visible && p.layer === k).length;
        // 选择容量最缺的层（同缺额随机）；全部满额时随机选一层
        const ratios = LAYERS.map((l) => ({
          layer: l,
          ratio: countOf(l.key) / l.cap,
        }));
        const minRatio = Math.min(...ratios.map((r) => r.ratio));
        const candidates = ratios.filter((r) => r.ratio === minRatio);
        const pick = (minRatio < 1 ? candidates : ratios)[
          Math.floor(Math.random() * (minRatio < 1 ? candidates.length : ratios.length))
        ].layer;

        // 该层已满：先触发本层队列最前的一片淡出，待其完全离场后再加入新片（顺序队列）
        const sameLayer = cur.filter((p) => p.visible && p.layer === pick.key);
        if (sameLayer.length >= pick.cap) {
          const oldest = sameLayer[0];
          timersRef.current.push(
            setTimeout(
              () => setPoems((cs) => cs.map((p) => (p.key === oldest.key ? { ...p, visible: false } : p))),
              60,
            ),
          );
          timersRef.current.push(
            setTimeout(() => setPoems((cs) => cs.filter((p) => p.key !== oldest.key)), 60 + FADE_OUT_MS + 200),
          );
          // 新片挂起：等旧片完全离场后重试生成（同层独占触发，不交叉叠位）
          if (!retryRef.current) {
            retryRef.current = setTimeout(() => {
              retryRef.current = null;
              spawn();
            }, 60 + EVICT_RETRY_MS);
          }
          return cur;
        }

        const free = POEMS.filter((e) => !cur.some((p) => p.entry.id === e.id));
        const recent = new Set(recentRef.current);
        const pool =
          free.filter((e) => !recent.has(e.id)).length > 0
            ? free.filter((e) => !recent.has(e.id))
            : free.length > 0
              ? free
              : POEMS;
        // 硬去重兜底：屏上已存在同 id 时重新抽选（最多 10 次），保证同屏绝不重复
        let entry = pool[Math.floor(Math.random() * pool.length)];
        for (let tries = 0; tries < 10 && cur.some((p) => p.entry.id === entry.id); tries++) {
          entry = pool[Math.floor(Math.random() * pool.length)];
        }
        recentRef.current = [entry.id, ...recentRef.current.filter((id) => id !== entry.id)].slice(0, 48);
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        // 分层字号：基础字号 × 层内系数（随机）
        const base = Math.max(14, Math.min(24, Math.round(winH * BASE_SIZE)));
        const size = Math.max(
          11,
          Math.min(40, Math.round(base * (pick.sizeMin + Math.random() * (pick.sizeMax - pick.sizeMin)))),
        );
        const opacity = pick.opacityMin + Math.random() * (pick.opacityMax - pick.opacityMin);
        const placed = place(entry, size, cur, winW, winH);
        if (!placed) return cur;
        const key = ++keyRef.current;
        // 该片固定参数：绝对固定列间距、绝对固定落差（第 1 列高、第 2 列低，多列 高-低-高 交替）
        const gapPx = 4 + Math.floor(Math.random() * 4);
                const highDrop = Math.round(
          size *
            (entry.lines.length > 2 ? 1.0 + Math.random() * 1.0 : 1.5 + Math.random() * 1.0),
        ); // 多列 1~2，双列 1.5~2.5（倍字号）
        const item: ActivePoem = {
          key,
          entry,
          layer: pick.key,
          x: placed.x,
          y: placed.y,
          size,
          accent: Math.random() < ACCENT_RATIO,
          opacity,
          gapPx,
          highDrop,
          cols: entry.lines.map((text, ci) => ({
            text,
            // 双列：首列高（不降）、次列低（下沉 highDrop）；多列：高-低-高 交替（固定）
            drop: ci % 2 === 0 ? 0 : highDrop,
          })),
          visible: false,
          rect: placed.rect,
        };
        timersRef.current.push(
          setTimeout(
            () => setPoems((cs) => cs.map((p) => (p.key === key ? { ...p, visible: true } : p))),
            120,
          ),
        );
        return [...cur, item];
      });
    };

    // 初始快速填充，随后按较长间隔维持
    const t0 = setTimeout(spawn, 400);
    const t1 = setTimeout(spawn, 1500);
    const t2 = setTimeout(spawn, 2600);
    const t3 = setTimeout(spawn, 3700);
    const t4 = setTimeout(spawn, 4800);
    const t5 = setTimeout(spawn, 5900);
    const iv = setInterval(spawn, SPAWN_INTERVAL);
    return () => {
      clearInterval(iv);
      clearTimeout(t0);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      if (retryRef.current) clearTimeout(retryRef.current);
      retryRef.current = null;
      setPoems([]);
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {poems.map((p) => (
        <div
          key={p.key}
          className="absolute flex flex-row items-start transition-opacity ease-in-out"
          style={{
            left: p.x,
            top: p.y,
            gap: `${p.gapPx}px`, // 片内列间距（绝对固定）
            opacity: p.visible ? 1 : 0,
            transitionDuration: p.visible ? `${FADE_IN_MS}ms` : `${FADE_OUT_MS}ms`,
            color: p.accent ? "var(--color-accent)" : "var(--color-fg-muted)",
            fontFamily: FONT_STACK,
          }}
        >
          {p.cols.map((c, i) => (
            <span
              key={i}
              className="select-none leading-none"
              style={{
                writingMode: "vertical-rl",
                textOrientation: "upright",
                fontSize: p.size,
                marginTop: c.drop,
                letterSpacing: "0.14em",
                opacity: p.opacity,
              }}
            >
              {c.text}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}