// 颜色工具：HEX <-> RGB <-> HSV 转换、对比文本色、预设色（取色面板共用）。

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  if (Number.isNaN(n)) return [200, 69, 44];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.round(Math.min(Math.max(v, 0), 255)).toString(16).padStart(2, "0"))
      .join("")
  );
}

export function hexToHsv(hex: string): { h: number; s: number; v: number } {
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

export function hsvToHex(h: number, s: number, v: number): string {
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

/** 根据背景色亮度返回对比文本色（深底白字 / 浅底黑字） */
export function contrastText(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#1c1c1c" : "#ffffff";
}

/** 常用预设色：以中国传统色为主（含主题色朱砂红），明快有质感，避免灰扑扑的廉价感 */
export const PRESET_COLORS = [
  "#c8452c", // 朱砂红（主题色）
  "#d94f6a", // 胭脂
  "#a85274", // 绛紫
  "#d2a2bb", // 藕荷
  "#46618f", // 黛蓝
  "#2f6a7a", // 靛青
  "#3d8f6a", // 竹青
  "#6b8a3f", // 松花绿
  "#d9a32b", // 杏黄
  "#c96f2d", // 琥珀
  "#a05a2c", // 赭石
  "#8a5d3b", // 茶褐
  "#5b4a7d", // 黛紫
  "#3a4149", // 墨青
  "#e8e0d0", // 月白
];
