// ---------- 几何: 有符号距离场 (SDF), 负值在玻璃内部 ----------
import type { ShapeConfig } from '../types';

export interface ShapeSDF {
  /** 有符号距离 mm, 负值在内部 */
  sdf(x: number, y: number): number;
  /** 包围盒 half-extents mm */
  halfW: number;
  halfH: number;
}

export function makeSDF(shape: ShapeConfig): ShapeSDF {
  switch (shape.type) {
    case 'rect': {
      const hw = shape.width / 2, hh = shape.height / 2;
      return {
        halfW: hw, halfH: hh,
        sdf(x, y) {
          // 矩形 SDF
          const dx = Math.abs(x) - hw, dy = Math.abs(y) - hh;
          const ox = Math.max(dx, 0), oy = Math.max(dy, 0);
          return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0);
        },
      };
    }
    case 'circle': {
      const r = shape.diameter / 2;
      return {
        halfW: r, halfH: r,
        sdf(x, y) { return Math.hypot(x, y) - r; },
      };
    }
    case 'ring': {
      const r = shape.diameter / 2;
      const hr = Math.min(shape.holeDiameter / 2, r * 0.9);
      const hx = shape.holeX, hy = shape.holeY;
      return {
        halfW: r, halfH: r,
        sdf(x, y) {
          const dOuter = Math.hypot(x, y) - r;
          const dHole = hr - Math.hypot(x - hx, y - hy); // 孔内为正
          return Math.max(dOuter, dHole);
        },
      };
    }
    case 'polygon': {
      const pts = shape.points;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of pts) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      }
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      // 平移到中心为原点
      const local = pts.map(p => ({ x: p.x - cx, y: p.y - cy }));
      const hw = (maxX - minX) / 2, hh = (maxY - minY) / 2;
      return {
        halfW: hw, halfH: hh,
        sdf(x, y) { return polygonSDF(local, x, y); },
      };
    }
  }
}

/** 多边形 SDF (奇偶规则判定内外, 到边最短距离) */
function polygonSDF(pts: { x: number; y: number }[], px: number, py: number): number {
  let minD = Infinity;
  let inside = false;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    // 点到线段距离
    const ex = b.x - a.x, ey = b.y - a.y;
    const wx = px - a.x, wy = py - a.y;
    const len2 = ex * ex + ey * ey;
    const t = len2 > 0 ? Math.max(0, Math.min(1, (wx * ex + wy * ey) / len2)) : 0;
    const dx = wx - t * ex, dy = wy - t * ey;
    const d = dx * dx + dy * dy;
    if (d < minD) minD = d;
    // 射线法
    if ((a.y > py) !== (b.y > py)) {
      const xInt = a.x + ((py - a.y) / (b.y - a.y)) * (b.x - a.x);
      if (px < xInt) inside = !inside;
    }
  }
  const dist = Math.sqrt(minD);
  return inside ? -dist : dist;
}

/** 由 SDF 数值求梯度 (指向外部法线) */
export function sdfGradient(f: ShapeSDF, x: number, y: number, eps = 0.05): { nx: number; ny: number } {
  const gx = f.sdf(x + eps, y) - f.sdf(x - eps, y);
  const gy = f.sdf(x, y + eps) - f.sdf(x, y - eps);
  const len = Math.hypot(gx, gy);
  if (len < 1e-9) return { nx: 1, ny: 0 };
  return { nx: gx / len, ny: gy / len };
}
