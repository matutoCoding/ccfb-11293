// ---------- 偏光观察页 ----------
import { el, angleDial, selectRow, sliderRow, checkRow } from '../widgets';
import { store } from '../../state/store';
import { getField } from '../../state/fieldCache';
import { PolariscopeRenderer, type ViewState, type DisplayMode } from '../../gl/renderer';
import { sampleField } from '../../physics/stress';
import { fringeOrder, fringeValue } from '../../physics/photoelastic';
import { makeSDF } from '../../physics/geometry';

export function renderViewerPage(root: HTMLElement): void {
  const sample = store.getSample(store.currentSampleId) ?? store.samples[0];
  if (!sample) {
    root.append(el('div', { className: 'empty-hint' }, '请先在样品库创建样品'));
    return;
  }
  store.currentSampleId = sample.id;

  const canvas = el('canvas', { className: 'view-canvas' }) as HTMLCanvasElement;
  const renderer = new PolariscopeRenderer(canvas);
  let display: DisplayMode = 0;
  let showGrid = false;

  const field = getField(sample);
  renderer.uploadField(field);

  const geo = makeSDF(sample.shape);
  const view: ViewState = {
    centerX: 0, centerY: 0,
    width: geo.halfW * 2.2, height: geo.halfH * 2.2,
  };

  const cfg = store.viewConfig;

  // ---- 读数面板 ----
  const readout = el('div', { className: 'readout' }, '点击玻璃任意位置读取应力');

  const updateReadout = (x: number, y: number) => {
    const [ds, psi, mask, s1] = sampleField(field, x, y);
    if (mask < 0.5) {
      readout.innerHTML = `<b>(${x.toFixed(1)}, ${y.toFixed(1)}) mm</b><br>玻璃区域外`;
      return;
    }
    const lam = cfg.light === 'mono' ? cfg.wavelength : store.settings.rgbWavelengths[1];
    const N = fringeOrder(ds, sample.thickness, sample.material.stressOpticCoeff, lam);
    const f = fringeValue(sample.material.stressOpticCoeff, lam);
    readout.innerHTML =
      `<b>坐标</b> (${x.toFixed(2)}, ${y.toFixed(2)}) mm<br>` +
      `<b>主应力差 Δσ</b> ${ds.toFixed(3)} MPa<br>` +
      `<b>条纹级数 N</b> <span class="highlight">${N.toFixed(3)} 级</span> (λ=${lam} nm)<br>` +
      `<b>主应力方向</b> ${((psi * 180) / Math.PI).toFixed(1)}°<br>` +
      `<b>σ₁</b> ${s1.toFixed(3)} MPa<br>` +
      `<span class="dim">材料条纹值 f=${f.toFixed(1)} kN/m · C=${sample.material.stressOpticCoeff} Brewster</span>`;
  };

  canvas.addEventListener('pointerdown', e => {
    const p = renderer.canvasToPhys(e.clientX, e.clientY, view);
    updateReadout(p.x, p.y);
  });

  // ---- 渲染 ----
  const rerender = () => {
    renderer.render(cfg, store.settings, sample.material.stressOpticCoeff,
      sample.thickness, view, display, showGrid, field.maxDeltaSigma);
  };

  const unsub = store.subscribe(rerender);

  // ---- 控制面板 ----
  const polDial = angleDial('起偏器 P', () => cfg.polarizerAngle, deg => {
    cfg.polarizerAngle = deg;
    rerender();
  });
  const anaDial = angleDial('检偏器 A', () => cfg.analyzerAngle, deg => {
    cfg.analyzerAngle = deg;
    rerender();
  });

  const sampleSel = selectRow('样品',
    store.samples.map(s => ({ value: s.id, text: s.name })),
    sample.id,
    v => { store.currentSampleId = v; rerenderPage(); });

  const modeSel = selectRow('偏振模式', [
    { value: 'plane', text: '平面偏振 (等色线+等倾线)' },
    { value: 'circular', text: '圆偏振 (仅等色线)' },
  ], cfg.mode, v => {
    cfg.mode = v as 'plane' | 'circular';
    store.saveViewConfig();
    rerenderPage();
  });

  const presetRow = el('div', { className: 'btn-row' },
    el('button', { className: 'btn small', onclick: () => {
      cfg.analyzerAngle = (cfg.polarizerAngle + 90) % 180;
      cfg.field = 'dark';
      store.saveViewConfig();
      rerenderPage();
    } }, '正交 (暗场)'),
    el('button', { className: 'btn small', onclick: () => {
      cfg.analyzerAngle = cfg.polarizerAngle;
      cfg.field = 'bright';
      store.saveViewConfig();
      rerenderPage();
    } }, '平行 (亮场)'),
  );

  const lightSel = selectRow('光源', [
    { value: 'white', text: '白光 (彩色条纹)' },
    { value: 'mono', text: '单色光 (明暗条纹)' },
  ], cfg.light, v => {
    cfg.light = v as 'white' | 'mono';
    store.saveViewConfig();
    rerenderPage();
  });

  const lambdaSlider = sliderRow('波长', cfg.wavelength, 380, 700, 1, 'nm', v => {
    cfg.wavelength = v;
    rerender();
  });

  const displaySel = selectRow('显示', [
    { value: '0', text: '偏振条纹' },
    { value: '1', text: '应力云图' },
    { value: '2', text: '条纹+云图' },
  ], '0', v => { display = Number(v) as DisplayMode; rerender(); });

  const gridCheck = checkRow('显示 10mm 网格', showGrid, v => { showGrid = v; rerender(); });

  // ---- 截图 ----
  const screenshot = () => {
    rerender();
    const src = renderer.canvas;
    const pad = 16;
    const infoH = 108;
    const out = document.createElement('canvas');
    out.width = src.width + pad * 2;
    out.height = src.height + infoH + pad * 2;
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = '#16181d';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(src, pad, pad);
    ctx.fillStyle = '#e8e9ec';
    ctx.font = `${Math.round(out.width / 55)}px sans-serif`;
    const lam = cfg.light === 'mono' ? `${cfg.wavelength} nm 单色` : '白光';
    const lines = [
      `样品: ${sample.name}    厚度: ${sample.thickness} mm    材料: ${sample.material.name} (C=${sample.material.stressOpticCoeff} Brewster)`,
      `模式: ${cfg.mode === 'plane' ? '平面偏振' : '圆偏振'}    起偏器: ${cfg.polarizerAngle.toFixed(1)}°    检偏器: ${cfg.analyzerAngle.toFixed(1)}°    光源: ${lam}`,
      `钢化: ${sample.tempering.enabled ? sample.tempering.surfaceCompression + ' MPa' : '关'}    载荷: ${sample.loads.length} 个    时间: ${new Date().toLocaleString()}`,
    ];
    lines.forEach((t, i) => ctx.fillText(t, pad, src.height + pad + 30 + i * 26));
    out.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = el('a', { href: url, download: `光弹_${sample.name}_${Date.now()}.png` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  };

  // ---- 页面重组 (样品/模式切换时) ----
  const rerenderPage = () => {
    unsub();
    root.innerHTML = '';
    renderViewerPage(root);
  };

  const panel = el('div', { className: 'side-panel' },
    sampleSel,
    el('h3', {}, '偏振系统'),
    modeSel,
    cfg.mode === 'plane' ? el('div', { className: 'dial-row' }, polDial, anaDial) : '',
    cfg.mode === 'plane' ? presetRow :
      el('div', { className: 'btn-row' },
        el('button', { className: 'btn small', onclick: () => { cfg.field = 'dark'; store.saveViewConfig(); rerender(); } }, '暗场'),
        el('button', { className: 'btn small', onclick: () => { cfg.field = 'bright'; store.saveViewConfig(); rerender(); } }, '亮场'),
      ),
    el('h3', {}, '光源'),
    lightSel,
    cfg.light === 'mono' ? lambdaSlider : '',
    el('h3', {}, '显示'),
    displaySel,
    gridCheck,
    el('h3', {}, '读数'),
    readout,
    el('div', { className: 'btn-row' },
      el('button', { className: 'btn primary', onclick: screenshot }, '📷 截图导出'),
      el('button', { className: 'btn', onclick: () => { store.saveViewConfig(); } }, '保存视角'),
    ),
  );

  root.append(
    el('div', { className: 'viewer-layout' },
      el('div', { className: 'canvas-wrap' }, canvas),
      panel,
    ),
  );

  // canvas 进入布局后再渲染, 并跟随尺寸变化
  requestAnimationFrame(rerender);
  new ResizeObserver(rerender).observe(canvas);

  // 拖拽平移 + 滚轮缩放
  let panning = false;
  let lastX = 0, lastY = 0;
  canvas.addEventListener('pointerdown', e => {
    if (e.button === 1 || e.shiftKey) {
      panning = true; lastX = e.clientX; lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    }
  });
  canvas.addEventListener('pointermove', e => {
    if (!panning) return;
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / view.width, rect.height / view.height);
    view.centerX -= (e.clientX - lastX) / scale;
    view.centerY += (e.clientY - lastY) / scale;
    lastX = e.clientX; lastY = e.clientY;
    rerender();
  });
  canvas.addEventListener('pointerup', () => { panning = false; });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const k = e.deltaY > 0 ? 1.1 : 0.9;
    view.width *= k; view.height *= k;
    rerender();
  }, { passive: false });
}
