// ---------- 光弹光学: 应力光学定律与偏振光强 (CPU 参考实现) ----------
// 与 GPU 着色器使用完全相同的公式与常量, 保证读数与条纹一致

/**
 * 条纹级数 N = δ/λ = C·t·Δσ / λ
 * @param deltaSigmaMPa 主应力差 MPa
 * @param thicknessMm   厚度 mm
 * @param cBrewster     应力光学系数 (1e-12 m²/N)
 * @param lambdaNm      波长 nm
 */
export function fringeOrder(
  deltaSigmaMPa: number,
  thicknessMm: number,
  cBrewster: number,
  lambdaNm: number,
): number {
  // C[m²/N] * t[m] * Δσ[Pa] / λ[m]
  const C = cBrewster * 1e-12;
  const t = thicknessMm * 1e-3;
  const ds = deltaSigmaMPa * 1e6;
  const lam = lambdaNm * 1e-9;
  return (C * t * ds) / lam;
}

/**
 * 平面偏振仪 (线偏振) 归一化光强 —— 通式
 * I = cos²(θa−θp) − sin2(φ−θp)·sin2(φ−θa)·sin²(πN)
 * 正交(暗场) θa=θp+90° 时退化为 sin²(2(φ−θp))·sin²(πN)
 * 平行(亮场) θa=θp 时退化为 1 − sin²(2(φ−θp))·sin²(πN)
 */
export function planeIntensity(
  psi: number,
  polarizerDeg: number,
  analyzerDeg: number,
  N: number,
): number {
  const thP = (polarizerDeg * Math.PI) / 180;
  const thA = (analyzerDeg * Math.PI) / 180;
  const base = Math.cos(thA - thP);
  const chrom = Math.sin(Math.PI * N);
  return (
    base * base -
    Math.sin(2 * (psi - thP)) * Math.sin(2 * (psi - thA)) * chrom * chrom
  );
}

/**
 * 圆偏振仪归一化光强 (等倾线被消除)
 * 暗场: I = sin²(πN)   亮场: I = cos²(πN)
 */
export function circularIntensity(N: number, dark: boolean): number {
  const s = Math.sin(Math.PI * N);
  return dark ? s * s : 1 - s * s;
}

/** 材料条纹值 f_σ = λ/C, 单位 kN/m (常用参考量) */
export function fringeValue(cBrewster: number, lambdaNm: number): number {
  return (lambdaNm * 1e-9) / (cBrewster * 1e-12) / 1000;
}
