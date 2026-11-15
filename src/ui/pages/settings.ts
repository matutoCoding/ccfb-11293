// ---------- 设置页 ----------
import { el, numberRow, downloadText } from '../widgets';
import { store } from '../../state/store';
import { invalidateField } from '../../state/fieldCache';

export function renderSettingsPage(root: HTMLElement): void {
  const s = store.settings;
  const msg = el('div', { className: 'dim' }, '');

  const fileInput = el('input', { type: 'file', accept: '.json', style: 'display:none' }) as HTMLInputElement;
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    const res = store.importJSON(await f.text());
    msg.textContent = res.message;
    fileInput.value = '';
  });

  const nameInput = el('input', { type: 'text', value: s.defaultMaterial.name }) as HTMLInputElement;
  nameInput.addEventListener('change', () => { s.defaultMaterial.name = nameInput.value; store.saveSettings(); });

  root.append(
    el('div', { className: 'settings-page' },
      el('h2', {}, '设置'),

      el('h3', {}, '默认材料 (新建样品时)'),
      el('label', { className: 'form-row' }, el('span', { className: 'form-label' }, '材料名称'), nameInput),
      numberRow('应力光学系数 C', s.defaultMaterial.stressOpticCoeff, {
        min: 0.1, step: 0.05, unit: 'Brewster',
        onChange: v => { s.defaultMaterial.stressOpticCoeff = v; store.saveSettings(); },
      }),
      el('div', { className: 'dim small-text' }, '钠钙玻璃约 2.4–2.7 Brewster; 光学玻璃参考厂商数据'),

      el('h3', {}, '光源'),
      numberRow('默认单色波长', s.monoWavelength, {
        min: 380, max: 700, unit: 'nm',
        onChange: v => { s.monoWavelength = v; store.viewConfig.wavelength = v; store.saveSettings(); },
      }),
      numberRow('白光 R 通道波长', s.rgbWavelengths[0], {
        min: 380, max: 700, unit: 'nm',
        onChange: v => { s.rgbWavelengths[0] = v; store.saveSettings(); },
      }),
      numberRow('白光 G 通道波长', s.rgbWavelengths[1], {
        min: 380, max: 700, unit: 'nm',
        onChange: v => { s.rgbWavelengths[1] = v; store.saveSettings(); },
      }),
      numberRow('白光 B 通道波长', s.rgbWavelengths[2], {
        min: 380, max: 700, unit: 'nm',
        onChange: v => { s.rgbWavelengths[2] = v; store.saveSettings(); },
      }),

      el('h3', {}, '计算与显示'),
      numberRow('应力场网格分辨率', s.gridResolution, {
        min: 128, max: 1024, step: 32, unit: 'px',
        onChange: v => {
          s.gridResolution = Math.round(v);
          store.saveSettings();
          for (const smp of store.samples) invalidateField(smp.id);
          msg.textContent = '分辨率已更新, 应力场将重新计算';
        },
      }),
      numberRow('显示伽马', s.gamma, {
        min: 0.5, max: 3, step: 0.1,
        onChange: v => { s.gamma = v; store.saveSettings(); },
      }),
      numberRow('曝光', s.exposure, {
        min: 0.1, max: 4, step: 0.1,
        onChange: v => { s.exposure = v; store.saveSettings(); },
      }),

      el('h3', {}, '数据'),
      el('div', { className: 'btn-row' },
        el('button', { className: 'btn', onclick: () => {
          downloadText(`光弹数据_${new Date().toISOString().slice(0, 10)}.json`, store.exportJSON());
        } }, '导出全部数据'),
        el('button', { className: 'btn', onclick: () => fileInput.click() }, '导入数据'),
        el('button', { className: 'btn danger', onclick: () => {
          if (confirm('清空所有样品和设置? 此操作不可恢复')) {
            localStorage.clear();
            location.reload();
          }
        } }, '清空全部数据'),
      ),
      el('div', { className: 'dim small-text' }, '数据保存在浏览器 localStorage, 换浏览器或清缓存前请先导出'),
      msg,
      fileInput,
    ),
  );
}
