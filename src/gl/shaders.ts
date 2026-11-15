// ---------- GLSL 着色器源码 ----------
// 与 src/physics/photoelastic.ts 的 CPU 参考实现严格同公式

export const VERT_SRC = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUV;
void main() {
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

export const FRAG_SRC = `#version 300 es
precision highp float;
precision highp sampler2D;

uniform sampler2D uField;      // R=Δσ(MPa) G=φ(rad) B=mask A=σ1
uniform vec2  uTexSize;        // 场纹理尺寸
uniform int   uMode;           // 0=平面偏振 1=圆偏振
uniform bool  uDark;           // 圆偏振: 暗场/亮场
uniform float uPolarizer;      // 起偏器角 rad
uniform float uAnalyzer;       // 检偏器角 rad (平面偏振)
uniform float uCBrewster;      // 应力光学系数 1e-12 m²/N
uniform float uThickness;      // mm
uniform bool  uWhite;          // 白光/单色
uniform float uLambda;         // 单色波长 nm
uniform vec3  uRGBLambda;      // 白光三通道波长 nm
uniform float uExposure;
uniform float uGamma;
uniform vec2  uViewCenter;     // 视野中心 mm
uniform vec2  uViewSize;       // 视野尺寸 mm
uniform vec2  uCanvasSize;     // 画布像素
uniform bool  uShowGrid;       // 网格
uniform float uMaxDS;          // 最大Δσ, 用于可选的应力云图
uniform int   uDisplay;        // 0=偏振条纹 1=应力云图 2=条纹+云图混合

in vec2 vUV;
out vec4 outColor;

const float PI = 3.141592653589793;

// 双线性插值采样应力场
vec4 sampleField(vec2 p) {
  vec2 uv = (p - uViewCenter) / uViewSize + 0.5;
  uv.y = 1.0 - uv.y; // 场纹理行向下
  vec2 st = uv * uTexSize - 0.5;
  vec2 i = floor(st);
  vec2 f = st - i;
  vec2 uv00 = (i + vec2(0.5, 0.5)) / uTexSize;
  vec2 uv10 = (i + vec2(1.5, 0.5)) / uTexSize;
  vec2 uv01 = (i + vec2(0.5, 1.5)) / uTexSize;
  vec2 uv11 = (i + vec2(1.5, 1.5)) / uTexSize;
  vec4 a = texture(uField, uv00);
  vec4 b = texture(uField, uv10);
  vec4 c = texture(uField, uv01);
  vec4 d = texture(uField, uv11);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// 条纹级数 N = C·t·Δσ/λ  (与 CPU fringeOrder 相同)
float fringeOrder(float dSigmaMPa, float lambdaNm) {
  float C = uCBrewster * 1e-12;
  float t = uThickness * 1e-3;
  float ds = dSigmaMPa * 1e6;
  float lam = lambdaNm * 1e-9;
  return C * t * ds / lam;
}

// 单波长强度
float intensityAt(float dSigma, float psi, float lambdaNm) {
  float N = fringeOrder(dSigma, lambdaNm);
  float chrom = sin(PI * N);
  float chrom2 = chrom * chrom;
  if (uMode == 1) {
    // 圆偏振: 等倾线消除
    return uDark ? chrom2 : 1.0 - chrom2;
  }
  // 平面偏振通式: I = cos²(θa−θp) − sin2(φ−θp)·sin2(φ−θa)·sin²(πN)
  float base = cos(uAnalyzer - uPolarizer);
  float I = base * base - sin(2.0 * (psi - uPolarizer)) * sin(2.0 * (psi - uAnalyzer)) * chrom2;
  return I;
}

// 应力云图配色 (蓝->青->绿->黄->红)
vec3 stressColorMap(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c1 = vec3(0.05, 0.1, 0.45);
  vec3 c2 = vec3(0.0, 0.7, 0.8);
  vec3 c3 = vec3(0.2, 0.85, 0.3);
  vec3 c4 = vec3(0.98, 0.85, 0.1);
  vec3 c5 = vec3(0.9, 0.1, 0.05);
  if (t < 0.25) return mix(c1, c2, t * 4.0);
  if (t < 0.5)  return mix(c2, c3, (t - 0.25) * 4.0);
  if (t < 0.75) return mix(c3, c4, (t - 0.5) * 4.0);
  return mix(c4, c5, (t - 0.75) * 4.0);
}

void main() {
  // 画布像素 -> 物理坐标 mm (保持纵横比)
  float scale = min(uCanvasSize.x / uViewSize.x, uCanvasSize.y / uViewSize.y);
  vec2 p = (gl_FragCoord.xy - uCanvasSize * 0.5) / scale + uViewCenter;

  vec4 field = sampleField(p);
  float mask = field.b;
  vec3 bg = vec3(0.115, 0.12, 0.135);

  if (mask < 0.5) {
    // 玻璃外: 暗背景 + 可选网格
    vec3 col = bg;
    if (uShowGrid) {
      vec2 g = abs(fract(p / 10.0) - 0.5);
      float line = smoothstep(0.48, 0.5, max(g.x, g.y));
      col += line * 0.05;
    }
    outColor = vec4(col, 1.0);
    return;
  }

  float dSigma = field.r;
  float psi = field.g;
  vec3 col;

  if (uDisplay == 1) {
    // 纯应力云图
    col = stressColorMap(dSigma / max(uMaxDS, 1e-6));
  } else {
    vec3 I;
    if (uWhite) {
      I.r = intensityAt(dSigma, psi, uRGBLambda.r);
      I.g = intensityAt(dSigma, psi, uRGBLambda.g);
      I.b = intensityAt(dSigma, psi, uRGBLambda.b);
    } else {
      float v = intensityAt(dSigma, psi, uLambda);
      I = vec3(v);
    }
    col = I * uExposure;
    if (uDisplay == 2) {
      // 条纹叠加云图
      col = mix(stressColorMap(dSigma / max(uMaxDS, 1e-6)) * 0.55, col, 0.65);
    }
  }

  // 玻璃区域轻微提亮边缘便于辨认轮廓
  col = pow(max(col, 0.0), vec3(1.0 / uGamma));
  outColor = vec4(col, 1.0);
}`;
