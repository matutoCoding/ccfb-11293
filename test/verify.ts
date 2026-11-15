// 物理验证: 条纹级数与应力光学定律一致性
// 运行: npx esbuild test/verify.ts --bundle --format=esm --outfile=test/verify.mjs && node test/verify.mjs
import { fringeOrder, planeIntensity, circularIntensity } from '../src/physics/photoelastic';
import { computeStressField, sampleField } from '../src/physics/stress';
import { makeSDF } from '../src/physics/geometry';
import { defaultSample, DEFAULT_SETTINGS } from '../src/types';

let pass = 0, fail = 0;
function check(name: string, actual: number, expected: number, tol: number) {
  const err = Math.abs(actual - expected);
  const ok = err <= tol;
  if (ok) pass++; else fail++;
  console.log(`${ok ? '✓' : '✗'} ${name}: 实际=${actual.toFixed(5)} 期望=${expected.toFixed(5)} 误差=${err.toFixed(5)} ${ok ? '' : '<<< 超差'}`);
}

const C = 2.55, T = 6, LAM = 589;

// ---- 1. 应力光学定律基准值 ----
// N = C·t·Δσ/λ, Δσ=20 MPa: N = 2.55e-12 * 6e-3 * 20e6 / 589e-9
const N1 = fringeOrder(20, T, C, LAM);
check('应力光学定律 Δσ=20MPa', N1, (2.55e-12 * 6e-3 * 20e6) / 589e-9, 1e-9);

// ---- 2. 均匀拉伸场: 场内任意点 Δσ = S ----
const s2 = defaultSample('t2', DEFAULT_SETTINGS);
s2.tempering.enabled = false;
s2.tension = { enabled: true, stress: 20, angle: 0 };
s2.loads = [];
const f2 = computeStressField(s2, 256);
const [ds2] = sampleField(f2, 10, -15);
check('均匀拉伸 Δσ', ds2, 20, 0.01);
const N2 = fringeOrder(ds2, T, C, LAM);
check('均匀拉伸 N', N2, N1, 0.001);

// 拉伸方向旋转 45°, Δσ 不变
s2.tension.angle = 45;
const f2b = computeStressField(s2, 256);
const [ds2b, psi2b] = sampleField(f2b, 0, 0);
check('旋转45°后 Δσ 不变', ds2b, 20, 0.01);
check('主方向=45°', (psi2b * 180) / Math.PI, 45, 0.5);

// ---- 3. Kirsch 孔口: 与同半径理论解对比 Δσ = σθ − σr ----
const s3 = defaultSample('t3', DEFAULT_SETTINGS);
s3.shape = { type: 'ring', diameter: 120, holeDiameter: 30, holeX: 0, holeY: 0 };
s3.tempering.enabled = false;
s3.tension = { enabled: true, stress: 10, angle: 0 };
const f3 = computeStressField(s3, 512);
// Kirsch 理论: 孔顶 (θ=90°) 任意半径 r 处
const kirschDelta = (r: number, a: number, S: number) => {
  const a2r2 = (a * a) / (r * r), a4r4 = a2r2 * a2r2;
  const sr = S / 2 * (1 - a2r2) - S / 2 * (1 + 3 * a4r4 - 4 * a2r2); // cos2θ=-1
  const st = S / 2 * (1 + a2r2) + S / 2 * (1 + 3 * a4r4);
  return st - sr;
};
const [ds3] = sampleField(f3, 0, 15.8);
check('Kirsch 孔边 Δσ (r=15.8)', ds3, kirschDelta(15.8, 15, 10), 1.0);
const [ds3b] = sampleField(f3, 0, 25);
check('Kirsch 中场 Δσ (r=25)', ds3b, kirschDelta(25, 15, 10), 0.3);
// 孔边 r→a 时 σθ=3S=30 (理论极限)
check('Kirsch 理论极限 3S', kirschDelta(15.001, 15, 10), 30, 0.01);

// ---- 4. Flamant 集中力: 力轴线上 Δσ = 2P/(π·t·r) ----
const s4 = defaultSample('t4', DEFAULT_SETTINGS);
s4.tempering.enabled = false;
s4.tension.enabled = false;
s4.loads = [{ id: 'L', x: 0, y: 0, angle: 90, force: 100 }];
const f4 = computeStressField(s4, 384);
const r = 20; // mm, 力沿 +y, 轴线上 cosθ=1
const [ds4] = sampleField(f4, 0, r);
const expect4 = (2 * 100) / (Math.PI * 6 * r);
check('Flamant 轴线 Δσ', ds4, expect4, expect4 * 0.03);
// 垂直于力方向 cosθ=0 → Δσ≈0
const [ds4b] = sampleField(f4, r, 0);
check('Flamant 垂直向 Δσ≈0', ds4b, 0, 0.05);

// ---- 5. 偏振光强公式 ----
// 正交平面偏振, φ=45°, θp=0, θa=90: sin²(2·45°)=1 → I = sin²(πN)
const I5 = planeIntensity(Math.PI / 4, 0, 90, 0.5);
check('正交平面 N=0.5 φ=45°', I5, 1, 1e-12);
// 等倾线上 φ=0: I=0
const I5b = planeIntensity(0, 0, 90, 0.5);
check('等倾线消光', I5b, 0, 1e-12);
// 平行偏振: I = 1 − 暗场
const I5c = planeIntensity(Math.PI / 4, 0, 0, 0.5);
check('平行平面互补', I5c, 0, 1e-12);
// 圆偏振暗场 N=整数 → 0
check('圆偏振整数级消光', circularIntensity(2, true), 0, 1e-12);
check('圆偏振亮场整数级全亮', circularIntensity(2, false), 1, 1e-12);

// ---- 6. SDF ----
const rect = makeSDF({ type: 'rect', width: 100, height: 60 });
check('矩形中心 sdf', rect.sdf(0, 0), -30, 1e-9);
check('矩形外 sdf', rect.sdf(60, 0), 10, 1e-9);
const poly = makeSDF({ type: 'polygon', points: [{ x: -50, y: -50 }, { x: 50, y: -50 }, { x: 0, y: 50 }] });
console.log(`  多边形内部(0,0) sdf=${poly.sdf(0, 0).toFixed(2)} (应<0), 外部(0,-60) sdf=${poly.sdf(0, -60).toFixed(2)} (应>0)`);
if (poly.sdf(0, 0) < 0 && poly.sdf(0, -60) > 0) pass++; else fail++;

// ---- 7. 钢化边缘应力: 边缘处 Δσ≈表面压应力, 深處衰减 ----
const s7 = defaultSample('t7', DEFAULT_SETTINGS);
s7.tension.enabled = false;
s7.loads = [];
s7.tempering = { enabled: true, surfaceCompression: 100, edgeZoneWidth: 12 };
const f7 = computeStressField(s7, 384);
// 矩形 150x100, 右边缘内 1mm 处 (74,0): 四边贡献叠加
// σyy = -100·(e^(-1/12)+e^(-149/12)), σxx = -100·2·e^(-50/12)
const [ds7] = sampleField(f7, 74, 0);
const syy7 = -100 * (Math.exp(-1 / 12) + Math.exp(-149 / 12));
const sxx7 = -100 * 2 * Math.exp(-50 / 12);
check('钢化边缘 Δσ=四边叠加', ds7, Math.abs(syy7 - sxx7), 0.3);
const [ds7c] = sampleField(f7, 0, 0);
// 中心: 上下边 d=50 (切向x), 左右边 d=75 (切向y), Δσ = |2·e^(-50/12) − 2·e^(-75/12)|·100
check('钢化中心 Δσ=四边叠加', ds7c, Math.abs(2 * Math.exp(-50 / 12) - 2 * Math.exp(-75 / 12)) * 100, 0.3);

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
