// ---------- 应力编辑页 ----------
import { el, numberRow, selectRow, checkRow, sliderRow } from '../widgets';
import { store, uid } from '../../state/store';
import { getField } from '../../state/fieldCache';
import { PolariscopeRenderer, type ViewState } from '../../gl/renderer';
import { makeSDF } from '../../physics/geometry';
import type { ShapeConfig } from '../../types';

export function renderEditorPage(root: HTMLElement): void {
  const sample = store.getSample(store.currentSampleId) ?? store.samples[0];
  if (!sample) {
    root.append(el('div', { className: 'empty-hint' }, '请先在样品库创建样品'));
    return;
  }
  store.currentSampleId = sample.id;

  // ---- 预览 ----
  const canvas = el('canvas', { className: 'view-canvas editor-preview' }) as HTMLCanvasElement;
  const renderer = new PolariscopeRenderer(canvas);
  let addingLoad = false;

  const geo = makeSDF(sample.shape);
  const view: ViewState = { centerX: 0, centerY: 0, width: geo.halfW * 2.2, height: geo.halfH * 2.2 };

  const previewCfg = { ...store.viewConfig, mode: 'circular' as const, field: 'dark' as const };

  let debounceTimer = 0;
  const refreshPreview = () => {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      const field = getField(sample);
      renderer.uploadField(field);
      renderer.render(previewCfg, store.settings, sample.material.stressOpticCoeff,
        sample.thickness, view, 0, true, field.maxDeltaSigma);
    }, 150);
  };
  new ResizeObserver(refreshPreview).observe(canvas);

  canvas.addEventListener('pointerdown', e => {
    if (!addingLoad) return;
    const p = renderer.canvasToPhys(e.clientX, e.clientY, view);
    sample.loads.push({ id: uid(), x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, angle: 90, force: 100 });
    store.updateSample(sample);
    addingLoad = false;
    rerenderPage();
  });

  const rerenderPage = () => {
    root.innerHTML = '';
    renderEditorPage(root);
  };

  const update = () => {
    store.updateSample(sample);
    refreshPreview();
  };

  // ---- 形状参数表单 ----
  const shapeForm = el('div', {});
  const buildShapeForm = () => {
    shapeForm.innerHTML = '';
    const sh = sample.shape;
    if (sh.type === 'rect') {
      shapeForm.append(
        numberRow('宽度', sh.width, { min: 1, unit: 'mm', onChange: v => { sh.width = v; update(); } }),
        numberRow('高度', sh.height, { min: 1, unit: 'mm', onChange: v => { sh.height = v; update(); } }),
      );
    } else if (sh.type === 'circle') {
      shapeForm.append(
        numberRow('直径', sh.diameter, { min: 1, unit: 'mm', onChange: v => { sh.diameter = v; update(); } }),
      );
    } else if (sh.type === 'ring') {
      shapeForm.append(
        numberRow('外径', sh.diameter, { min: 1, unit: 'mm', onChange: v => { sh.diameter = v; update(); } }),
        numberRow('孔径', sh.holeDiameter, { min: 0.5, unit: 'mm', onChange: v => { sh.holeDiameter = v; update(); } }),
        numberRow('孔心 X', sh.holeX, { unit: 'mm', onChange: v => { sh.holeX = v; update(); } }),
        numberRow('孔心 Y', sh.holeY, { unit: 'mm', onChange: v => { sh.holeY = v; update(); } }),
      );
    } else if (sh.type === 'polygon') {
      const ta = el('textarea', { className: 'polygon-input', rows: '6' },
        sh.points.map(p => `${p.x}, ${p.y}`).join('\n')) as HTMLTextAreaElement;
      const hint = el('div', { className: 'dim small-text' }, '每行一个顶点 "x, y" (mm), 至少 3 点, 自动居中');
      const err = el('div', { className: 'error-text' }, '');
      const apply = el('button', { className: 'btn small', onclick: () => {
        const pts = ta.value.split('\n')
          .map(line => line.split(',').map(s => parseFloat(s.trim())))
          .filter(pair => pair.length === 2 && pair.every(Number.isFinite))
          .map(([x, y]) => ({ x, y }));
        if (pts.length < 3) {
          err.textContent = '至少需要 3 个有效顶点';
          return;
        }
        err.textContent = '';
        (sample.shape as Extract<ShapeConfig, { type: 'polygon' }>).points = pts;
        update();
        rerenderPage();
      } }, '应用多边形');
      shapeForm.append(hint, ta, apply, err);
    }
  };
  buildShapeForm();

  const shapeSel = selectRow('形状', [
    { value: 'rect', text: '矩形' },
    { value: 'circle', text: '圆形' },
    { value: 'ring', text: '带孔圆形' },
    { value: 'polygon', text: '自定义多边形' },
  ], sample.shape.type, v => {
    const cur = sample.shape;
    let next: ShapeConfig;
    if (v === 'rect') next = { type: 'rect', width: 150, height: 100 };
    else if (v === 'circle') next = { type: 'circle', diameter: 120 };
    else if (v === 'ring') next = { type: 'ring', diameter: 120, holeDiameter: 30, holeX: 0, holeY: 0 };
    else next = { type: 'polygon', points: [{ x: -60, y: -40 }, { x: 60, y: -40 }, { x: 70, y: 20 }, { x: 0, y: 50 }, { x: -70, y: 20 }] };
    // 尽量保留尺寸
    if (v === 'rect' && cur.type === 'rect') next = cur;
    sample.shape = next;
    update();
    rerenderPage();
  });

  // ---- 载荷列表 ----
  const loadsBox = el('div', {});
  const buildLoads = () => {
    loadsBox.innerHTML = '';
    if (sample.loads.length === 0) {
      loadsBox.append(el('div', { className: 'dim small-text' }, '暂无载荷'));
    }
    sample.loads.forEach((L, i) => {
      loadsBox.append(
        el('div', { className: 'load-row' },
          el('span', { className: 'load-title' }, `载荷 ${i + 1}`),
          numberRow('X', L.x, { unit: 'mm', onChange: v => { L.x = v; update(); } }),
          numberRow('Y', L.y, { unit: 'mm', onChange: v => { L.y = v; update(); } }),
          numberRow('方向', L.angle, { unit: '°', onChange: v => { L.angle = v; update(); } }),
          numberRow('力', L.force, { min: 0, unit: 'N', onChange: v => { L.force = v; update(); } }),
          el('button', { className: 'btn small danger', onclick: () => {
            sample.loads.splice(i, 1);
            store.updateSample(sample);
            rerenderPage();
          } }, '删除'),
        ),
      );
    });
  };
  buildLoads();

  const addLoadBtn = el('button', { className: 'btn small', onclick: () => {
    addingLoad = true;
    addLoadBtn.textContent = '点击预览图放置载荷…';
    addLoadBtn.classList.add('primary');
  } }, '＋ 在预览上点击添加集中力');

  // ---- 面板 ----
  const panel = el('div', { className: 'side-panel editor-panel' },
    selectRow('样品', store.samples.map(s => ({ value: s.id, text: s.name })), sample.id,
      v => { store.currentSampleId = v; rerenderPage(); }),
    el('label', { className: 'form-row' },
      el('span', { className: 'form-label' }, '名称'),
      (() => {
        const inp = el('input', { type: 'text', value: sample.name }) as HTMLInputElement;
        inp.addEventListener('change', () => { sample.name = inp.value; update(); });
        return inp;
      })(),
    ),
    el('label', { className: 'form-row' },
      el('span', { className: 'form-label' }, '备注'),
      (() => {
        const inp = el('input', { type: 'text', value: sample.note }) as HTMLInputElement;
        inp.addEventListener('change', () => { sample.note = inp.value; update(); });
        return inp;
      })(),
    ),

    el('h3', {}, '几何'),
    shapeSel,
    shapeForm,
    numberRow('厚度', sample.thickness, { min: 0.5, step: 0.5, unit: 'mm', onChange: v => { sample.thickness = v; update(); } }),

    el('h3', {}, '材料'),
    numberRow('应力光学系数 C', sample.material.stressOpticCoeff, { min: 0.1, step: 0.05, unit: 'Brewster', onChange: v => { sample.material.stressOpticCoeff = v; update(); } }),

    el('h3', {}, '钢化工艺'),
    checkRow('启用钢化残余应力', sample.tempering.enabled, v => { sample.tempering.enabled = v; update(); }),
    sliderRow('表面压应力', sample.tempering.surfaceCompression, 0, 200, 1, 'MPa', v => {
      sample.tempering.surfaceCompression = v; update();
    }),
    sliderRow('边缘区宽度', sample.tempering.edgeZoneWidth, 1, 40, 0.5, 'mm', v => {
      sample.tempering.edgeZoneWidth = v; update();
    }),

    el('h3', {}, '远场拉伸'),
    checkRow('启用单轴拉伸', sample.tension.enabled, v => { sample.tension.enabled = v; update(); }),
    sliderRow('拉应力', sample.tension.stress, 0, 100, 1, 'MPa', v => { sample.tension.stress = v; update(); }),
    sliderRow('方向', sample.tension.angle, 0, 180, 1, '°', v => { sample.tension.angle = v; update(); }),

    el('h3', {}, '集中力载荷'),
    addLoadBtn,
    loadsBox,
  );

  root.append(
    el('div', { className: 'viewer-layout' },
      el('div', { className: 'canvas-wrap' },
        el('div', { className: 'preview-hint' }, '预览: 圆偏振暗场条纹 · 修改参数实时更新'),
        canvas),
      panel,
    ),
  );
}
