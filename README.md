# 光弹应力可视化系统

面向钢化/夹胶玻璃质检与教学的浏览器端光弹应力分析工具。TypeScript + WebGL2 自写着色器, 无框架依赖。

## 运行

```bash
npm install
npm run dev        # 开发服务器
npm run build      # 类型检查 + 生产构建
npm run preview    # 预览生产构建
```

物理验证测试:

```bash
npx esbuild test/verify.ts --bundle --format=esm --outfile=test/verify.mjs && node test/verify.mjs
```

20 项测试覆盖应力光学定律、Flamant 集中力解、Kirsch 孔口解、偏振光强公式、SDF 几何, 全部解析解对拍。

## 功能

| 页面 | 功能 |
|------|------|
| 样品库 | 增删改复制, localStorage 持久化, JSON 导出/导入 |
| 应力编辑 | 矩形/圆形/带孔/自定义多边形, 厚度, 钢化工艺参数, 远场拉伸, 点击添加集中力, 实时预览 |
| 偏光观察 | 平面/圆偏振, 正交/平行, 白光/单色光, 旋钮拖动实时变化, 点击读数, 截图导出 |
| 对比 | 两个样品并排, 共享偏振配置同步对比 |
| 设置 | 材料系数, 波长, 网格分辨率, 伽马/曝光, 数据管理 |

## 物理模型

**应力光学定律** (读数与条纹的共同基准):

```
δ = C·t·(σ₁−σ₂)        光程差
N = δ/λ = C·t·(σ₁−σ₂)/λ  条纹级数
```

C 为应力光学系数 (钠钙玻璃 ≈2.55 Brewster), t 厚度, λ 波长。CPU 读数 (`src/physics/photoelastic.ts`) 与 GPU 着色器 (`src/gl/shaders.ts`) 使用同一公式同一组常量, 同点读数与条纹级数一致。

**应力场叠加** (直角坐标张量分量叠加后求主应力):

1. **钢化残余应力**: 每条自由边切向压应力 −Cs·exp(−d/we), 法向应力为 0; 各边贡献叠加, 角点自然过渡
2. **集中力**: Flamant 解, σ_r = −2P·cosθ/(π·t·r), 纯径向应力场
3. **远场拉伸**: 均匀场; 带孔时叠加 Kirsch 孔口应力集中解 (孔边 σ_θ = 3S)

**偏振光强**:

- 平面偏振通式: `I = cos²(θa−θp) − sin2(φ−θp)·sin2(φ−θa)·sin²(πN)` — 同时呈现等色线与等倾线
- 圆偏振暗场: `I = sin²(πN)`; 亮场: `I = cos²(πN)` — 等倾线消除
- 白光: R/G/B 三个波长 (默认 650/550/450 nm) 分别计算合成彩色条纹

## 精度

- 读数直接从 CPU 应力场双线性插值, 与着色器采样同源
- 验证测试与解析解对拍误差 < 0.001 级 (要求 0.05 级)
- 应力场只在参数变化时重算并上传纹理; 拖动偏振片仅更新 uniform, 单全屏 pass, 60fps 无压力

## 目录结构

```
src/
  physics/    geometry.ts (SDF) · stress.ts (应力场) · photoelastic.ts (光学)
  gl/         shaders.ts (GLSL) · renderer.ts (WebGL2)
  state/      store.ts (状态+持久化) · fieldCache.ts (应力场缓存)
  ui/         router.ts · widgets.ts · pages/ (五个页面)
test/
  verify.ts   物理验证 (解析解对拍)
```
