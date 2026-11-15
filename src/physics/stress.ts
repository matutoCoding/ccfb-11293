// ---------- 应力场计算 ----------
// 所有应力以直角坐标张量分量 (σx, σy, τxy) 叠加, 单位 MPa
// 模型:
//  1. 钢化残余应力: 边缘压应力沿切向, 距边指数衰减 (自由边法向应力≈0)
//  2. 集中力: Flamant 解 (无限大板点载荷, 纯径向应力场)
//  3. 远场单轴拉伸: 均匀场; 带孔时叠加 Kirsch 孔口解
import type { Sample, StressField } from '../types';
import { makeSDF } from './geometry';

const DEG = Math.PI / 180;

/**
 * 钢化边缘应力张量 (单位压应力 Cs=1 MPa 时的值)
 * 对每条边: 切向压应力 -exp(-d/we), 法向为 0 (自由边), 各边贡献叠加
 * 角点附近相邻边贡献自然叠加, 无中轴伪影
 */
function temperStress(
  shape: Sample['shape'],
  x: number, y: number, we: number,
): { sxx: number; syy: number; sxy: number } {
  let sxx = 0, syy = 0, sxy = 0;
  const add = (d: number, tx: number, ty: number) => {
    if (d <= 0) return;
    const s = -Math.exp(-d / we);
    sxx += s * tx * tx;
    syy += s * ty * ty;
    sxy += s * tx * ty;
  };
  switch (shape.type) {
    case 'rect': {
      const hw = shape.width / 2, hh = shape.height / 2;
      add(hw - x, 0, 1);  // 右边, 切向 ±y
      add(x + hw, 0, 1);  // 左边
      add(hh - y, 1, 0);  // 顶边, 切向 ±x
      add(y + hh, 1, 0);  // 底边
      break;
    }
    case 'circle': {
      const R = shape.diameter / 2;
      const r = Math.hypot(x, y);
      if (r > 1e-6) {
        const tx = -y / r, ty = x / r; // 切向
        add(R - r, tx, ty);
      }
      break;
    }
    case 'ring': {
      const R = shape.diameter / 2;
      const hr = shape.holeDiameter / 2;
      const r = Math.hypot(x, y);
      if (r > 1e-6) add(R - r, -y / r, x / r);
      const rh = Math.hypot(x - shape.holeX, y - shape.holeY);
      if (rh > 1e-6) add(rh - hr, -(y - shape.holeY) / rh, (x - shape.holeX) / rh);
      break;
    }
    case 'polygon': {
      // 顶点已居中 (与 geometry.makeSDF 相同的居中方式)
      const pts = shape.points;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of pts) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      }
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const ax = pts[i].x - cx, ay = pts[i].y - cy;
        const bx = pts[(i + 1) % n].x - cx, by = pts[(i + 1) % n].y - cy;
        const ex = bx - ax, ey = by - ay;
        const len = Math.hypot(ex, ey);
        if (len < 1e-9) continue;
        const wx = x - ax, wy = y - ay;
        const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (len * len)));
        const d = Math.hypot(wx - t * ex, wy - t * ey);
        add(d, ex / len, ey / len);
      }
      break;
    }
  }
  return { sxx, syy, sxy };
}

/** 计算整个样品的应力场 */
export function computeStressField(sample: Sample, resolution: number): StressField {
  const geo = makeSDF(sample.shape);
  // 留 8% 边距
  const margin = 1.08;
  const halfW = geo.halfW * margin;
  const halfH = geo.halfH * margin;
  const aspect = halfH / halfW;
  const W = resolution;
  const H = Math.max(16, Math.round(resolution * aspect));
  const physW = halfW * 2, physH = halfH * 2;

  const data = new Float32Array(W * H * 4);

  // 钢化参数
  const temp = sample.tempering;
  const Cs = temp.enabled ? temp.surfaceCompression : 0; // MPa 压应力大小
  const we = Math.max(temp.edgeZoneWidth, 0.5); // mm

  // 远场拉伸
  const ten = sample.tension;
  const S = ten.enabled ? ten.stress : 0;
  const beta = ten.angle * DEG;
  const cb = Math.cos(beta), sb = Math.sin(beta);
  // 均匀单轴拉伸的直角坐标分量
  const Sxx = S * cb * cb, Syy = S * sb * sb, Sxy = S * cb * sb;

  // 孔参数 (Kirsch)
  let hole: { hx: number; hy: number; a: number } | null = null;
  if (sample.shape.type === 'ring' && S !== 0) {
    hole = { hx: sample.shape.holeX, hy: sample.shape.holeY, a: sample.shape.holeDiameter / 2 };
  }

  // 集中力预处理
  const loads = sample.loads.map(L => ({
    x: L.x, y: L.y,
    fx: Math.cos(L.angle * DEG), fy: Math.sin(L.angle * DEG),
    P: L.force, // N
  }));
  const rMin = Math.max(sample.thickness * 0.1, 0.3); // 接触半径正则化 mm

  let maxDS = 0;

  for (let j = 0; j < H; j++) {
    const y = halfH - (j + 0.5) / H * physH; // 图像行向下 => y 翻转
    for (let i = 0; i < W; i++) {
      const x = -halfW + (i + 0.5) / W * physW;
      const idx = (j * W + i) * 4;
      const d = geo.sdf(x, y); // <0 内部
      if (d >= 0) {
        data[idx + 2] = 0; // mask
        continue;
      }
      data[idx + 2] = 1;

      let sxx = 0, syy = 0, sxy = 0;

      // --- 1. 钢化边缘应力 ---
      if (Cs > 0) {
        const t = temperStress(sample.shape, x, y, we);
        sxx += Cs * t.sxx;
        syy += Cs * t.syy;
        sxy += Cs * t.sxy;
      }

      // --- 2. 远场拉伸 ---
      if (S !== 0) {
        sxx += Sxx; syy += Syy; sxy += Sxy;
        // --- 3. Kirsch 孔口应力集中 ---
        if (hole) {
          const dx = x - hole.hx, dy = y - hole.hy;
          const r = Math.hypot(dx, dy);
          if (r > hole.a * 1.001) {
            const th = Math.atan2(dy, dx) - beta; // 相对拉伸方向的角度
            const a2r2 = (hole.a * hole.a) / (r * r);
            const a4r4 = a2r2 * a2r2;
            const c2 = Math.cos(2 * th), s2 = Math.sin(2 * th);
            // Kirsch 极坐标解 (扣掉已加的均匀场, 只加扰动部分)
            const sr = S / 2 * (1 - a2r2) + S / 2 * (1 + 3 * a4r4 - 4 * a2r2) * c2;
            const st = S / 2 * (1 + a2r2) - S / 2 * (1 + 3 * a4r4) * c2;
            const trt = -S / 2 * (1 - 3 * a4r4 + 2 * a2r2) * s2;
            // 极->直角 (相对整体坐标, 注意 th 已含 beta)
            const phi = Math.atan2(dy, dx);
            const cp = Math.cos(phi), sp = Math.sin(phi);
            const kxx = sr * cp * cp + st * sp * sp - 2 * trt * sp * cp;
            const kyy = sr * sp * sp + st * cp * cp + 2 * trt * sp * cp;
            const kxy = (sr - st) * sp * cp + trt * (cp * cp - sp * sp);
            // 加扰动场 = Kirsch - 均匀场
            sxx += kxx - Sxx; syy += kyy - Syy; sxy += kxy - Sxy;
          }
        }
      }

      // --- 4. 集中力 (Flamant) ---
      for (const L of loads) {
        const dx = x - L.x, dy = y - L.y;
        const r = Math.max(Math.hypot(dx, dy), rMin);
        // 力方向与径向夹角
        const rx = dx / r, ry = dy / r;
        const cosTh = rx * L.fx + ry * L.fy;
        // σr = -2P·cosθ / (π·t·r), P 单位 N, t,r 单位 mm -> MPa
        const sr = -2 * L.P * cosTh / (Math.PI * sample.thickness * r);
        sxx += sr * rx * rx;
        syy += sr * ry * ry;
        sxy += sr * rx * ry;
      }

      // --- 主应力差与主方向 ---
      const dxx = sxx - syy;
      const deltaSigma = Math.hypot(dxx, 2 * sxy); // = sqrt((σx-σy)² + 4τxy²)
      const psi = 0.5 * Math.atan2(2 * sxy, dxx); // 主应力方向 rad
      // σ1 (大主应力, 带符号)
      const sAvg = (sxx + syy) / 2;
      const s1 = sAvg + deltaSigma / 2;

      data[idx] = deltaSigma;
      data[idx + 1] = psi;
      data[idx + 3] = s1;
      if (deltaSigma > maxDS) maxDS = deltaSigma;
    }
  }

  return { width: W, height: H, physWidth: physW, physHeight: physH, data, maxDeltaSigma: maxDS };
}

/** 双线性插值读取场值: 返回 [Δσ, φ, mask, σ1] */
export function sampleField(field: StressField, x: number, y: number): [number, number, number, number] {
  const { width: W, height: H, physWidth: pw, physHeight: ph, data } = field;
  const fx = (x + pw / 2) / pw * W - 0.5;
  const fy = (ph / 2 - y) / ph * H - 0.5;
  const i0 = Math.floor(fx), j0 = Math.floor(fy);
  const tx = fx - i0, ty = fy - j0;
  const out = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    let v = 0, wsum = 0;
    for (let dj = 0; dj <= 1; dj++) {
      for (let di = 0; di <= 1; di++) {
        const ii = i0 + di, jj = j0 + dj;
        if (ii < 0 || ii >= W || jj < 0 || jj >= H) continue;
        const w = (di ? tx : 1 - tx) * (dj ? ty : 1 - ty);
        v += w * data[(jj * W + ii) * 4 + c];
        wsum += w;
      }
    }
    out[c] = wsum > 0 ? v / wsum : 0;
  }
  return out as [number, number, number, number];
}
