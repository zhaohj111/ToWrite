// 开始页背景效果：整幅「S 形流」连续长线条（Canvas 2D）。
// - 聚集线 6~12 条（原有效果）：沿 S 通道高斯聚集；额外偏离线 3~5 条：
//   画面中部向 S 通道收拢（聚集度高），两端（左右边缘）逐渐散开（聚集度低）；
// - 伪移动（慢速）：S 通道缓慢左右滑动 + 波形缓慢沿线传播 + 每线缓慢浮动；
// - 鼠标交互：基于平滑基线的径向高斯推离作为「目标」，每线每采样点保存位移状态做
//   弹簧松弛（一阶指数逼近，时间常数约 0.7s）——指针移走后扰动缓慢归零，
//   无迅速回弹、无反向扰动；叠加两遍 1-2-1 折线平滑，曲线始终柔顺；
// - 红色（强调色）线条保证存在：偏离线大概率红色，整组无红线时强制一条。
// 仅当 layoutStore.startBackground === "lines" 时挂载画布；无全局状态。

import { useEffect, useRef } from "react";
import { useLayoutStore } from "@/stores/layoutStore";
import { useThemeStore } from "@/stores/themeStore";

/** 单条波浪线（相对 S 通道的参数化描述） */
interface WaveLine {
  /** 相对 S 通道中线的垂直偏移（聚集：高斯；偏离线：大偏移） */
  offset: number;
  /** 偏离线（新加入）：中部收拢、两端散开 */
  scattered: boolean;
  /** 沿 S 通道的相位偏移（每线略有差异） */
  phaseShift: number;
  /** 波动幅度缩放 */
  ampScale: number;
  /** 波动初相 */
  wavePhase: number;
  /** 缓慢浮动幅度（px）与角速度 */
  bob: number;
  bobSpeed: number;
  accent: boolean;
  /** 每采样点的扰动位移（弹簧松弛状态，索引 = 采样序号） */
  disp: Float64Array;
}

/** S 形通道幅度（相对窗口高度） */
const S_AMP = 0.2;
/** S 形通道周期（相对窗口宽度）：一个周期内呈现完整的 S */
const S_PERIOD = 1.25;
/** 聚集偏移标准差（相对窗口高度）：大部分线贴紧 S 中线 */
const OFFSET_SIGMA = 0.045;
/** 额外偏离线条数（在原始聚集线之上追加） */
const SCATTER_COUNT_MIN = 3;
const SCATTER_COUNT_MAX = 5;
/** 偏离线偏移范围（相对窗口高度；上限 0.35） */
const SCATTER_MIN = 0.16;
const SCATTER_MAX = 0.35;
/** 偏离线在画面中部的收拢比例 */
const SCATTER_MID_SCALE = 0.35;

/** 指针影响半径（px）：≈3σ 高斯包络截断，宽而柔 */
const MOUSE_RADIUS = 290;
/** 指针中心最大推离量（px） */
const MOUSE_PUSH = 160;
/** 扰动弹簧松弛速率（1/s）：越大越快回到目标，0.7s 时间常数 ≈ 1.4 */
const RELAX_RATE = 1.4;

const MAIN_ALPHA = 0.4;
const ACCENT_ALPHA = 0.6;
const STEP = 12;

export function LineFlowBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const enabled = useLayoutStore((s) => s.startBackground) === "lines";
  const theme = useThemeStore((s) => s.mode);

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 颜色只在主题变化（effect 重跑）时读取一次
    const cs = getComputedStyle(document.documentElement);
    const colorMain = cs.getPropertyValue("--color-fg-muted").trim() || "#8a8f98";
    const colorAccent = cs.getPropertyValue("--color-accent").trim() || "#d7b25c";

    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let lines: WaveLine[] = [];
    const pointer = { x: -9999, y: -9999, sx: -9999, sy: -9999 };
    let raf = 0;
    let last = performance.now();
    let time = 0;

    /** 采样点总数（x = -40 起，步长 STEP） */
    const sampleCount = () => Math.ceil((w + 80 + STEP) / STEP) + 1;

    /** scattered = true 为额外追加的偏离线（大偏移、高概率强调色红线） */
    const spawnLine = (scattered: boolean): WaveLine => {
      const sign = Math.random() < 0.5 ? -1 : 1;
      const offset = scattered
        ? sign * h * (SCATTER_MIN + Math.random() * (SCATTER_MAX - SCATTER_MIN))
        : (Math.random() - 0.5) * 2 * h * OFFSET_SIGMA * 2; // 高斯近似（±2σ 内加权分布）
      return {
        offset,
        scattered,
        phaseShift: (Math.random() - 0.5) * 0.5,
        ampScale: 0.55 + Math.random() * 0.9,
        wavePhase: Math.random() * Math.PI * 2,
        bob: 2 + Math.random() * 4,
        bobSpeed: 0.03 + Math.random() * 0.05,
        accent: false, // 红线数量由 resize 统一分配（固定约 3 条）
        disp: new Float64Array(sampleCount()),
      };
    };

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // 原有效果：聚集线 6~12 条（约每 200px 一条）；在其上追加偏离线 3~5 条
      const coreCount = Math.max(6, Math.min(12, Math.round(w / 200)));
      const scatterCount = Math.max(
        SCATTER_COUNT_MIN,
        Math.min(SCATTER_COUNT_MAX, Math.round(coreCount * 0.4)),
      );
      lines = [
        ...Array.from({ length: coreCount }, () => spawnLine(false)),
        ...Array.from({ length: scatterCount }, () => spawnLine(true)),
      ];
      // 红线（强调色）分配：偏离线最多 2 条 + 聚集线恰好 1 条（共约 3 条）
      const pickRandom = (arr: WaveLine[], n: number): WaveLine[] => {
        const copy = [...arr];
        for (let i = copy.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy.slice(0, n);
      };
      lines.forEach((l) => (l.accent = false));
      const scatterLines = lines.filter((l) => l.scattered);
      const coreLines = lines.filter((l) => !l.scattered);
      [...pickRandom(scatterLines, Math.min(2, scatterLines.length)),
       ...pickRandom(coreLines, Math.min(1, coreLines.length))].forEach((l) => (l.accent = true));
    };

    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    };
    const onLeave = () => {
      pointer.x = -9999;
      pointer.y = -9999;
      pointer.sx = -9999;
      pointer.sy = -9999;
    };
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      time += dt;

      // 指针惯性平滑
      pointer.sx += (pointer.x - pointer.sx) * Math.min(1, dt * 8);
      pointer.sy += (pointer.y - pointer.sy) * Math.min(1, dt * 8);

      const midY = h * 0.5;
      const sAmp = h * S_AMP;
      const kS = (Math.PI * 2) / (w * S_PERIOD);
      const ampBase = 18;
      const relax = Math.min(1, dt * RELAX_RATE);

      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1.4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (const l of lines) {
        const ys: number[] = [];
        for (let i = 0; i < l.disp.length; i++) {
          const x = -40 + i * STEP;
          const sPhase = time * 0.03;
          // 偏离线：画面中部收拢、两端散开
          const q = Math.abs(x - w / 2) / Math.max(w / 2, 1);
          const env = l.scattered ? SCATTER_MID_SCALE + (1 - SCATTER_MID_SCALE) * q * q : 1;
          const baseY = midY + sAmp * Math.sin(kS * x + l.phaseShift - sPhase) + l.offset * env;
          let y =
            baseY +
            ampBase *
              l.ampScale *
              Math.sin((x / (0.9 * w)) * Math.PI * 3 + l.wavePhase - time * Math.PI * 0.25) +
            l.bob * Math.sin(time * l.bobSpeed * Math.PI * 2 + l.wavePhase);

          // 扰动目标：基于平滑基线的径向高斯推离（宽而柔）
          let target = 0;
          if (pointer.sx > -9998) {
            const dxp = x - pointer.sx;
            const dyp = baseY - pointer.sy;
            const d2 = dxp * dxp + dyp * dyp;
            if (d2 < MOUSE_RADIUS * MOUSE_RADIUS) {
              const g = Math.exp(-d2 / (2 * (MOUSE_RADIUS / 2.8) ** 2));
              const dist = Math.sqrt(d2) + 1e-3;
              target = (dyp / dist) * MOUSE_PUSH * g;
            }
          }
          // 弹簧松弛：缓慢逼近目标（移走后缓慢归零，无回弹/反向扰动）
          l.disp[i] += (target - l.disp[i]) * relax;
          y += l.disp[i];
          ys.push(y);
        }

        // 柔度：两遍 1-2-1 折线平滑滤波（机制上消除任何残余尖角）
        for (let pass = 0; pass < 2; pass++) {
          for (let i = 1; i < ys.length - 1; i++) {
            ys[i] = (ys[i - 1] + ys[i] * 2 + ys[i + 1]) / 4;
          }
        }

        ctx.strokeStyle = l.accent ? colorAccent : colorMain;
        ctx.globalAlpha = l.accent ? ACCENT_ALPHA : MAIN_ALPHA;
        ctx.beginPath();
        for (let i = 0; i < ys.length; i++) {
          const x = -40 + i * STEP;
          if (i === 0) ctx.moveTo(x, ys[i]);
          else ctx.lineTo(x, ys[i]);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("blur", onLeave);
    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("blur", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, theme]);

  if (!enabled) return null;
  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-0" />;
}