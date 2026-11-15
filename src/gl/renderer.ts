// ---------- WebGL2 渲染器 ----------
import type { StressField, PolariscopeConfig, AppSettings } from '../types';
import { VERT_SRC, FRAG_SRC } from './shaders';

export interface ViewState {
  centerX: number; // mm
  centerY: number;
  width: number;   // mm, 视野宽
  height: number;  // mm
}

export type DisplayMode = 0 | 1 | 2; // 0 条纹 1 云图 2 混合

export class PolariscopeRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private tex: WebGLTexture;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private fieldSize: [number, number] = [1, 1];
  field: StressField | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      preserveDrawingBuffer: true, // 截图需要
      antialias: true,
    });
    if (!gl) throw new Error('当前浏览器不支持 WebGL2');
    this.gl = gl;
    this.prog = this.buildProgram();
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // 全屏三角形带
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  }

  private buildProgram(): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error('着色器编译失败: ' + gl.getShaderInfoLog(sh));
      }
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT_SRC));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG_SRC));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('着色器链接失败: ' + gl.getProgramInfoLog(prog));
    }
    return prog;
  }

  private u(name: string): WebGLUniformLocation | null {
    if (!this.uniforms.has(name)) {
      this.uniforms.set(name, this.gl.getUniformLocation(this.prog, name));
    }
    return this.uniforms.get(name)!;
  }

  /** 上传新的应力场 */
  uploadField(field: StressField): void {
    const gl = this.gl;
    this.field = field;
    this.fieldSize = [field.width, field.height];
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA32F,
      field.width, field.height, 0,
      gl.RGBA, gl.FLOAT, field.data,
    );
  }

  /** 渲染一帧 */
  render(
    cfg: PolariscopeConfig,
    settings: AppSettings,
    materialC: number,
    thicknessMm: number,
    view: ViewState,
    display: DisplayMode,
    showGrid: boolean,
    maxDS: number,
  ): void {
    const gl = this.gl;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.canvas.clientWidth * dpr);
    const h = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.u('uField'), 0);
    gl.uniform2f(this.u('uTexSize'), this.fieldSize[0], this.fieldSize[1]);
    gl.uniform1i(this.u('uMode'), cfg.mode === 'circular' ? 1 : 0);
    gl.uniform1i(this.u('uDark'), cfg.field === 'dark' ? 1 : 0);
    gl.uniform1f(this.u('uPolarizer'), (cfg.polarizerAngle * Math.PI) / 180);
    gl.uniform1f(this.u('uAnalyzer'), (cfg.analyzerAngle * Math.PI) / 180);
    gl.uniform1f(this.u('uCBrewster'), materialC);
    gl.uniform1f(this.u('uThickness'), thicknessMm);
    gl.uniform1i(this.u('uWhite'), cfg.light === 'white' ? 1 : 0);
    gl.uniform1f(this.u('uLambda'), cfg.wavelength);
    gl.uniform3f(this.u('uRGBLambda'), ...settings.rgbWavelengths);
    gl.uniform1f(this.u('uExposure'), settings.exposure);
    gl.uniform1f(this.u('uGamma'), settings.gamma);
    gl.uniform2f(this.u('uViewCenter'), view.centerX, view.centerY);
    gl.uniform2f(this.u('uViewSize'), view.width, view.height);
    gl.uniform2f(this.u('uCanvasSize'), w, h);
    gl.uniform1i(this.u('uShowGrid'), showGrid ? 1 : 0);
    gl.uniform1f(this.u('uMaxDS'), maxDS);
    gl.uniform1i(this.u('uDisplay'), display);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** 画布像素坐标 -> 物理坐标 mm */
  canvasToPhys(clientX: number, clientY: number, view: ViewState): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const scale = Math.min(rect.width / view.width, rect.height / view.height);
    return {
      x: (px - rect.width / 2) / scale + view.centerX,
      y: -(py - rect.height / 2) / scale + view.centerY,
    };
  }
}
