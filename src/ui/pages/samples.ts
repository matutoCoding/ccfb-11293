// ---------- 样品库页面 ----------
import { el, downloadText } from '../widgets';
import { store } from '../../state/store';
import { navigate } from '../router';
import type { ShapeConfig } from '../../types';

export function shapeLabel(shape: ShapeConfig): string {
  switch (shape.type) {
    case 'rect': return `矩形 ${shape.width}×${shape.height} mm`;
    case 'circle': return `圆形 Ø${shape.diameter} mm`;
    case 'ring': return `带孔圆 Ø${shape.diameter}/Ø${shape.holeDiameter} mm`;
    case 'polygon': return `多边形 (${shape.points.length} 顶点)`;
  }
}

export function renderSamplesPage(root: HTMLElement): void {
  const list = el('div', { className: 'sample-grid' });

  const renderList = () => {
    list.innerHTML = '';
    for (const s of store.samples) {
      const card = el('div', { className: 'sample-card' },
        el('div', { className: 'sample-name' }, s.name),
        el('div', { className: 'sample-meta' }, shapeLabel(s.shape)),
        el('div', { className: 'sample-meta' }, `厚度 ${s.thickness} mm · ${s.material.name}`),
        el('div', { className: 'sample-meta' },
          `钢化${s.tempering.enabled ? ' ' + s.tempering.surfaceCompression + ' MPa' : ' 关'} · ` +
          `载荷 ${s.loads.length} 个`),
        s.note ? el('div', { className: 'sample-note' }, s.note) : '',
        el('div', { className: 'card-actions' },
          el('button', { className: 'btn primary', onclick: () => {
            store.currentSampleId = s.id;
            navigate('/viewer');
          } }, '观察'),
          el('button', { className: 'btn', onclick: () => {
            store.currentSampleId = s.id;
            navigate('/editor');
          } }, '编辑'),
          el('button', { className: 'btn', onclick: () => { store.duplicateSample(s.id); } }, '复制'),
          el('button', { className: 'btn danger', onclick: () => {
            if (confirm(`删除样品「${s.name}」?`)) store.deleteSample(s.id);
          } }, '删除'),
        ),
      );
      list.append(card);
    }
    if (store.samples.length === 0) {
      list.append(el('div', { className: 'empty-hint' }, '暂无样品, 点击「新建样品」开始'));
    }
  };
  renderList();
  store.subscribe(renderList);

  const fileInput = el('input', { type: 'file', accept: '.json', style: 'display:none' }) as HTMLInputElement;
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    const text = await f.text();
    const res = store.importJSON(text);
    alert(res.message);
    fileInput.value = '';
  });

  root.append(
    el('div', { className: 'page-header' },
      el('h2', {}, '样品库'),
      el('div', { className: 'header-actions' },
        el('button', { className: 'btn primary', onclick: () => {
          store.addSample();
          navigate('/editor');
        } }, '＋ 新建样品'),
        el('button', { className: 'btn', onclick: () => {
          downloadText(`光弹样品库_${new Date().toISOString().slice(0, 10)}.json`, store.exportJSON());
        } }, '导出全部'),
        el('button', { className: 'btn', onclick: () => fileInput.click() }, '导入'),
      ),
    ),
    list,
    fileInput,
  );
}
