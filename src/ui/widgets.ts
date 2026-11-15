// ---------- 通用 UI 组件 ----------

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | EventListener> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v as string;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v as string);
  }
  for (const c of children) {
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

/** 数字输入行 */
export function numberRow(
  label: string,
  value: number,
  opts: { min?: number; max?: number; step?: number; unit?: string; onChange: (v: number) => void },
): HTMLElement {
  const input = el('input', { type: 'number', value: String(value) }) as HTMLInputElement;
  if (opts.min !== undefined) input.min = String(opts.min);
  if (opts.max !== undefined) input.max = String(opts.max);
  input.step = String(opts.step ?? 1);
  input.addEventListener('change', () => {
    const v = parseFloat(input.value);
    if (!Number.isNaN(v)) opts.onChange(v);
  });
  return el('label', { className: 'form-row' },
    el('span', { className: 'form-label' }, label),
    input,
    el('span', { className: 'form-unit' }, opts.unit ?? ''),
  );
}

/** 滑块 + 数字联动行 */
export function sliderRow(
  label: string,
  value: number,
  min: number, max: number, step: number,
  unit: string,
  onInput: (v: number) => void,
): HTMLElement {
  const num = el('input', { type: 'number', value: String(value) }) as HTMLInputElement;
  num.min = String(min); num.max = String(max); num.step = String(step);
  const range = el('input', { type: 'range', value: String(value) }) as HTMLInputElement;
  range.min = String(min); range.max = String(max); range.step = String(step);
  range.addEventListener('input', () => {
    num.value = range.value;
    onInput(parseFloat(range.value));
  });
  num.addEventListener('change', () => {
    const v = parseFloat(num.value);
    if (!Number.isNaN(v)) { range.value = num.value; onInput(v); }
  });
  return el('div', { className: 'slider-row' },
    el('span', { className: 'form-label' }, label),
    range,
    num,
    el('span', { className: 'form-unit' }, unit),
  );
}

/** 下拉选择行 */
export function selectRow(
  label: string,
  options: { value: string; text: string }[],
  value: string,
  onChange: (v: string) => void,
): HTMLElement {
  const sel = el('select', {}) as HTMLSelectElement;
  for (const o of options) {
    const opt = el('option', { value: o.value }, o.text) as HTMLOptionElement;
    if (o.value === value) opt.selected = true;
    sel.append(opt);
  }
  sel.addEventListener('change', () => onChange(sel.value));
  return el('label', { className: 'form-row' },
    el('span', { className: 'form-label' }, label),
    sel,
  );
}

/** 复选行 */
export function checkRow(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  const input = el('input', { type: 'checkbox' }) as HTMLInputElement;
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { className: 'form-row check' }, input, el('span', {}, label));
}

/**
 * 角度旋钮: 拖动旋转, 实时回调
 */
export function angleDial(
  label: string,
  getAngle: () => number,
  onRotate: (deg: number) => void,
): HTMLElement {
  const canvas = el('canvas', { className: 'dial', width: '96', height: '96' }) as HTMLCanvasElement;
  const readout = el('div', { className: 'dial-readout' }, '0.0°');

  const draw = () => {
    const ctx = canvas.getContext('2d')!;
    const a = getAngle();
    ctx.clearRect(0, 0, 96, 96);
    ctx.save();
    ctx.translate(48, 48);
    // 外圈
    ctx.beginPath();
    ctx.arc(0, 0, 42, 0, Math.PI * 2);
    ctx.fillStyle = '#2a2d35';
    ctx.fill();
    ctx.strokeStyle = '#4a4f5c';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 刻度
    ctx.strokeStyle = '#5c6270';
    ctx.lineWidth = 1;
    for (let d = 0; d < 360; d += 15) {
      const r = (d * Math.PI) / 180;
      const long = d % 45 === 0;
      ctx.beginPath();
      ctx.moveTo(Math.cos(r) * (long ? 32 : 36), Math.sin(r) * (long ? 32 : 36));
      ctx.lineTo(Math.cos(r) * 40, Math.sin(r) * 40);
      ctx.stroke();
    }
    // 偏振轴 (双向线)
    const r = (a * Math.PI) / 180;
    ctx.strokeStyle = '#ffb74d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-Math.cos(r) * 34, -Math.sin(r) * 34);
    ctx.lineTo(Math.cos(r) * 34, Math.sin(r) * 34);
    ctx.stroke();
    ctx.restore();
    readout.textContent = `${a.toFixed(1)}°`;
  };
  draw();

  let dragging = false;
  const setFromEvent = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // 屏幕 y 向下, 物理角 y 向上
    let deg = (Math.atan2(-(e.clientY - cy), e.clientX - cx) * 180) / Math.PI;
    deg = ((deg % 180) + 180) % 180; // 偏振轴 180° 周期
    onRotate(deg);
    draw();
  };
  canvas.addEventListener('pointerdown', e => {
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    setFromEvent(e);
  });
  canvas.addEventListener('pointermove', e => { if (dragging) setFromEvent(e); });
  canvas.addEventListener('pointerup', () => { dragging = false; });

  const wrap = el('div', { className: 'dial-wrap' },
    el('div', { className: 'dial-label' }, label),
    canvas,
    readout,
  );
  (wrap as unknown as { redraw: () => void }).redraw = draw;
  return wrap;
}

export function downloadText(filename: string, text: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
