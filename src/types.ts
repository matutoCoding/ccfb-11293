// ---------- 全局类型定义 ----------

/** 玻璃形状 */
export type ShapeConfig =
  | { type: 'rect'; width: number; height: number }                       // mm
  | { type: 'circle'; diameter: number }                                  // mm
  | { type: 'ring'; diameter: number; holeDiameter: number; holeX: number; holeY: number } // mm
  | { type: 'polygon'; points: { x: number; y: number }[] };              // mm, 逆时针

/** 集中力载荷 */
export interface PointLoad {
  id: string;
  x: number;       // mm, 样品中心为原点
  y: number;       // mm
  angle: number;   // 度, 力的方向 (0 = +x)
  force: number;   // N
}

/** 钢化工艺参数 */
export interface TemperingParams {
  enabled: boolean;
  surfaceCompression: number; // MPa, 表面压应力 (正值表示压应力大小)
  edgeZoneWidth: number;      // mm, 边缘应力区特征宽度
}

/** 远场单轴拉伸 */
export interface TensionParams {
  enabled: boolean;
  stress: number;   // MPa
  angle: number;    // 度
}

/** 材料参数 */
export interface MaterialParams {
  name: string;
  /** 应力光学系数 C, 单位 Brewster (1e-12 m²/N) */
  stressOpticCoeff: number;
}

/** 样品 */
export interface Sample {
  id: string;
  name: string;
  note: string;
  createdAt: number;
  updatedAt: number;
  shape: ShapeConfig;
  thickness: number; // mm
  material: MaterialParams;
  tempering: TemperingParams;
  tension: TensionParams;
  loads: PointLoad[];
}

/** 偏振观察配置 */
export interface PolariscopeConfig {
  /** 'plane' 平面(正交线偏振) | 'circular' 圆偏振 */
  mode: 'plane' | 'circular';
  /** 'dark' 暗场(正交) | 'bright' 亮场(平行) */
  field: 'dark' | 'bright';
  polarizerAngle: number;  // 度
  analyzerAngle: number;   // 度 (plane 模式下相对于起偏器, 通常 90 或 0)
  light: 'white' | 'mono';
  wavelength: number;      // nm, 单色光波长
}

/** 全局设置 */
export interface AppSettings {
  defaultMaterial: MaterialParams;
  monoWavelength: number;      // nm
  rgbWavelengths: [number, number, number]; // nm, 白光三通道
  gridResolution: number;      // 应力场网格边长
  gamma: number;               // 显示伽马
  exposure: number;            // 显示曝光
}

/** 应力场计算结果 (CPU 侧, 用于读数与上传 GPU) */
export interface StressField {
  width: number;   // 网格像素
  height: number;
  /** 物理尺寸 mm */
  physWidth: number;
  physHeight: number;
  /** RGBA float: R=主应力差Δσ(MPa) G=主应力方向φ(rad) B=mask(1=玻璃内) A=σ1(MPa,带符号) */
  data: Float32Array;
  maxDeltaSigma: number; // MPa
}

export const DEFAULT_SETTINGS: AppSettings = {
  defaultMaterial: { name: '钠钙玻璃', stressOpticCoeff: 2.55 },
  monoWavelength: 589,
  rgbWavelengths: [650, 550, 450],
  gridResolution: 384,
  gamma: 1.0,
  exposure: 1.0,
};

export function defaultSample(id: string, settings: AppSettings): Sample {
  return {
    id,
    name: '新样品',
    note: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    shape: { type: 'rect', width: 150, height: 100 },
    thickness: 6,
    material: { ...settings.defaultMaterial },
    tempering: { enabled: true, surfaceCompression: 100, edgeZoneWidth: 12 },
    tension: { enabled: false, stress: 20, angle: 0 },
    loads: [],
  };
}
