// ---------- 应用状态与持久化 ----------
import type { Sample, AppSettings, PolariscopeConfig } from '../types';
import { DEFAULT_SETTINGS, defaultSample } from '../types';

const LS_SAMPLES = 'photoelastic.samples.v1';
const LS_SETTINGS = 'photoelastic.settings.v1';
const LS_VIEW = 'photoelastic.viewcfg.v1';

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

type Listener = () => void;

class Store {
  samples: Sample[] = [];
  settings: AppSettings = { ...DEFAULT_SETTINGS };
  viewConfig: PolariscopeConfig = {
    mode: 'plane',
    field: 'dark',
    polarizerAngle: 0,
    analyzerAngle: 90,
    light: 'white',
    wavelength: DEFAULT_SETTINGS.monoWavelength,
  };
  /** 当前在观察页/编辑页选中的样品 */
  currentSampleId: string | null = null;
  /** 对比页两个样品 */
  compareIds: [string | null, string | null] = [null, null];

  private listeners = new Set<Listener>();

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      const s = localStorage.getItem(LS_SAMPLES);
      if (s) this.samples = JSON.parse(s);
    } catch { /* 忽略损坏数据 */ }
    try {
      const s = localStorage.getItem(LS_SETTINGS);
      if (s) this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(s) };
    } catch { /* ignore */ }
    try {
      const s = localStorage.getItem(LS_VIEW);
      if (s) this.viewConfig = { ...this.viewConfig, ...JSON.parse(s) };
    } catch { /* ignore */ }
    if (this.samples.length === 0) {
      // 内置演示样品
      const demo = defaultSample(uid(), this.settings);
      demo.name = '演示: 钢化矩形板';
      demo.note = '钢化玻璃边缘压应力 + 中心集中力';
      demo.loads = [{ id: uid(), x: 0, y: 0, angle: 90, force: 2000 }];
      this.samples.push(demo);
      const ring = defaultSample(uid(), this.settings);
      ring.name = '演示: 带孔圆盘拉伸';
      ring.shape = { type: 'ring', diameter: 120, holeDiameter: 30, holeX: 0, holeY: 0 };
      ring.tempering.enabled = false;
      ring.tension = { enabled: true, stress: 15, angle: 0 };
      this.samples.push(ring);
      this.saveSamples();
    }
    if (!this.currentSampleId && this.samples.length > 0) {
      this.currentSampleId = this.samples[0].id;
    }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(): void {
    for (const fn of this.listeners) fn();
  }

  saveSamples(): void {
    localStorage.setItem(LS_SAMPLES, JSON.stringify(this.samples));
    this.emit();
  }
  saveSettings(): void {
    localStorage.setItem(LS_SETTINGS, JSON.stringify(this.settings));
    this.emit();
  }
  saveViewConfig(): void {
    localStorage.setItem(LS_VIEW, JSON.stringify(this.viewConfig));
    this.emit();
  }

  getSample(id: string | null): Sample | null {
    return this.samples.find(s => s.id === id) ?? null;
  }

  addSample(sample?: Sample): Sample {
    const s = sample ?? defaultSample(uid(), this.settings);
    this.samples.push(s);
    this.currentSampleId = s.id;
    this.saveSamples();
    return s;
  }

  updateSample(s: Sample): void {
    s.updatedAt = Date.now();
    const i = this.samples.findIndex(x => x.id === s.id);
    if (i >= 0) this.samples[i] = s;
    this.saveSamples();
  }

  deleteSample(id: string): void {
    this.samples = this.samples.filter(s => s.id !== id);
    if (this.currentSampleId === id) {
      this.currentSampleId = this.samples[0]?.id ?? null;
    }
    this.saveSamples();
  }

  duplicateSample(id: string): Sample | null {
    const src = this.getSample(id);
    if (!src) return null;
    const copy: Sample = JSON.parse(JSON.stringify(src));
    copy.id = uid();
    copy.name = src.name + ' (副本)';
    copy.createdAt = Date.now();
    copy.loads = copy.loads.map(l => ({ ...l, id: uid() }));
    this.samples.push(copy);
    this.saveSamples();
    return copy;
  }

  exportJSON(): string {
    return JSON.stringify({ version: 1, samples: this.samples, settings: this.settings }, null, 2);
  }

  importJSON(text: string): { ok: boolean; message: string } {
    try {
      const obj = JSON.parse(text);
      const list: Sample[] = Array.isArray(obj) ? obj : obj.samples;
      if (!Array.isArray(list)) return { ok: false, message: '文件中没有样品数据' };
      let n = 0;
      for (const raw of list) {
        if (!raw || !raw.shape || !raw.shape.type) continue;
        const s: Sample = { ...defaultSample(uid(), this.settings), ...raw, id: uid() };
        s.loads = (s.loads ?? []).map(l => ({ ...l, id: uid() }));
        this.samples.push(s);
        n++;
      }
      if (obj.settings) {
        this.settings = { ...this.settings, ...obj.settings };
        this.saveSettings();
      }
      this.saveSamples();
      return { ok: true, message: `成功导入 ${n} 个样品` };
    } catch (e) {
      return { ok: false, message: '导入失败: ' + (e as Error).message };
    }
  }
}

export const store = new Store();
