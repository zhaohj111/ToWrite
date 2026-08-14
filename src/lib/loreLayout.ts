// 设定库力导向布局：供画布渲染与 PNG 导出共用，保证两处节点位置一致。
import type { LoreEdge, LoreEntry } from "@/types/writeproj";

/**
 * 极简力导向：给没有坐标的卡片按拓扑关系铺开（有坐标的卡片保持原位）。
 * 返回 id → 世界坐标。
 */
export function runForceLayout(
  cards: LoreEntry[],
  edges: LoreEdge[]
): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  const fixed = new Set(cards.filter((c) => c.x !== undefined && c.y !== undefined).map((c) => c.id));
  // 简单网格回退位置
  const grid: Record<string, { x: number; y: number }> = {};
  cards.forEach((c, i) => {
    const col = i % 6;
    const row = Math.floor(i / 6);
    grid[c.id] = { x: col * 240 - 600, y: row * 160 - 160 };
  });
  const pos = (id: string) => out.get(id) ?? grid[id] ?? { x: 0, y: 0 };
  // 邻接列表
  const adj = new Map<string, string[]>();
  for (const c of cards) adj.set(c.id, []);
  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
    adj.get(e.target)?.push(e.source);
  }
  // 逐步拉近相连卡片（少量迭代）
  for (let iter = 0; iter < 20; iter++) {
    for (const c of cards) {
      if (fixed.has(c.id)) continue;
      const neighbors = (adj.get(c.id) ?? []).map(pos);
      if (neighbors.length === 0) continue;
      const cx = neighbors.reduce((s, n) => s + n.x, 0) / neighbors.length;
      const cy = neighbors.reduce((s, n) => s + n.y, 0) / neighbors.length;
      const cur = pos(c.id);
      out.set(c.id, { x: cur.x + (cx - cur.x) * 0.4, y: cur.y + (cy - cur.y) * 0.4 });
    }
  }
  for (const c of cards) {
    if (c.x !== undefined && c.y !== undefined) out.set(c.id, { x: c.x, y: c.y });
  }
  return out;
}
