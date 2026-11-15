// ---------- 对比页: 两个样品并排, 共享偏振配置 ----------
import { el, angleDial, selectRow } from '../widgets';
import { store } from '../../state/store';
import { getField } from '../../state/fieldCache';
import { PolariscopeRenderer, type ViewState } from '../../gl/renderer';
import { makeSDF } from '../../physics/geometry';
import type { Sample } from '../../types';

export function renderComparePage(root: HTMLElement): void {
  if (store.samples.length < 1) {
    root.append(el('div', { className: 'empty-hint' }, '请先在样品库创建样品'));
    return;
  }
  const ids = store.compareIds;
  if (!ids[0]) ids[0] = store.samples[0].id;
  if (!ids[1]) ids[1] = store.samples[Math.min(1, store.samples.length - 1)].id;

  const cfg = store.viewConfig;
  const panels: { renderer: PolariscopeRenderer; sample: Sample; view: ViewState }[] = [];

  const rerenderAll = () => {
    for (const p of panels) {
      const field = getField(p.sample);
      p.renderer.uploadField(field);
      p.renderer.render(cfg, store.settings, p.sample.material.stressOpticCoeff,
        p.sample.thickness, p.view, 0, false, field.maxDeltaSigma);
    }
  };

  const rerenderPage = () => {
    root.innerHTML = '';
    renderComparePage(root);
  };

  const makePane = (slot: 0 | 1): HTMLElement => {
    const sample = store.getSample(ids[slot])!;
    const canvas = el('canvas', { className: 'view-canvas compare-canvas' }) as HTMLCanvasElement;
    const renderer = new PolariscopeRenderer(canvas);
    const geo = makeSDF(sample.shape);
    const view: ViewState = { centerX: 0, centerY: 0, width: geo.halfW * 2.2, height: geo.halfH * 2.2 };
    panels.push({ renderer, sample, view });

    const sel = selectRow(`样品 ${slot === 0 ? 'A' : 'B'}`,
      store.samples.map(s => ({ value: s.id, text: s.name })),
      sample.id,
      v => { ids[slot] = v; rerenderPage(); });

    return el('div', { className: 'compare-pane' },
      el('div', { className: 'compare-head' }, sel),
      canvas,
      el('div', { className: 'sample-meta center' },
        `${sample.thickness} mm · ${sample.material.name} · 钢化${sample.tempering.enabled ? ' ' + sample.tempering.surfaceCompression + ' MPa' : '关'}`),
    );
  };

  const polDial = angleDial('起偏器 P', () => cfg.polarizerAngle, deg => {
    cfg.polarizerAngle = deg;
    rerenderAll();
  });
  const anaDial = angleDial('检偏器 A', () => cfg.analyzerAngle, deg => {
    cfg.analyzerAngle = deg;
    rerenderAll();
  });

  const controls = el('div', { className: 'compare-controls' },
    selectRow('偏振模式', [
      { value: 'plane', text: '平面偏振' },
      { value: 'circular', text: '圆偏振' },
    ], cfg.mode, v => { cfg.mode = v as 'plane' | 'circular'; store.saveViewConfig(); rerenderPage(); }),
    selectRow('光源', [
      { value: 'white', text: '白光' },
      { value: 'mono', text: '单色光' },
    ], cfg.light, v => { cfg.light = v as 'white' | 'mono'; store.saveViewConfig(); rerenderAll(); }),
    cfg.mode === 'plane' ? el('div', { className: 'dial-row' }, polDial, anaDial) : '',
    el('div', { className: 'btn-row' },
      el('button', { className: 'btn small', onclick: () => {
        cfg.analyzerAngle = (cfg.polarizerAngle + 90) % 180;
        store.saveViewConfig();
        rerenderPage();
      } }, '正交'),
      el('button', { className: 'btn small', onclick: () => {
        cfg.analyzerAngle = cfg.polarizerAngle;
        store.saveViewConfig();
        rerenderPage();
      } }, '平行'),
    ),
  );

  root.append(
    el('div', { className: 'compare-layout' },
      el('div', { className: 'compare-panes' }, makePane(0), makePane(1)),
      controls,
    ),
  );

  // 初始渲染需要等 canvas 进入布局
  requestAnimationFrame(rerenderAll);
}
