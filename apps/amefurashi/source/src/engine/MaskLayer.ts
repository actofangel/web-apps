import * as THREE from "three";

/**
 * A paintable grayscale mask stored in a 2D canvas and uploaded as a texture.
 * White = selected. Undo/redo keeps ImageData snapshots (bounded history).
 */
export class MaskLayer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  readonly texture: THREE.CanvasTexture;
  dirty = false;
  hasPaint = false;
  private undoStack: ImageData[] = [];
  private redoStack: ImageData[] = [];
  private lastPoint: { x: number; y: number } | null = null;
  /** Undo depth, bounded by memory (~96 MB of snapshots per layer, 4 to 24 steps). */
  private readonly history: number;

  constructor(width: number, height: number) {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.history = Math.max(4, Math.min(24, Math.floor((96 * 1024 * 1024) / (this.width * this.height * 4))));
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    const ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Could not create a 2D context for the mask.");
    this.ctx = ctx;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, this.width, this.height);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.needsUpdate = true;
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }

  private snapshot(): ImageData {
    return this.ctx.getImageData(0, 0, this.width, this.height);
  }

  beginStroke() {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > this.history) this.undoStack.shift();
    this.redoStack = [];
    this.lastPoint = null;
  }

  endStroke() {
    this.lastPoint = null;
  }

  /**
   * Paint (or erase) a soft round dab at image UV (y up).
   * @param radius brush radius in mask pixels
   * @param softness 0 = hard edge, 1 = fully feathered
   */
  paint(u: number, v: number, radius: number, softness: number, erase: boolean) {
    const x = u * this.width;
    const y = (1 - v) * this.height;
    const r = Math.max(0.5, radius);
    const step = Math.max(1, r * 0.3);
    if (this.lastPoint) {
      const dx = x - this.lastPoint.x;
      const dy = y - this.lastPoint.y;
      const dist = Math.hypot(dx, dy);
      const n = Math.floor(dist / step);
      for (let i = 1; i <= n; i++) {
        const t = i / (n + 1);
        this.dab(this.lastPoint.x + dx * t, this.lastPoint.y + dy * t, r, softness, erase);
      }
    }
    this.dab(x, y, r, softness, erase);
    this.lastPoint = { x, y };
    this.dirty = true;
    if (!erase) this.hasPaint = true;
  }

  private dab(x: number, y: number, r: number, softness: number, erase: boolean) {
    const ctx = this.ctx;
    const hard = 1 - Math.min(0.98, Math.max(0, softness));
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const c = erase ? "0,0,0" : "255,255,255";
    g.addColorStop(0, `rgba(${c},1)`);
    g.addColorStop(hard, `rgba(${c},1)`);
    g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  undo() {
    const s = this.undoStack.pop();
    if (!s) return;
    this.redoStack.push(this.snapshot());
    this.ctx.putImageData(s, 0, 0);
    this.dirty = true;
    this.hasPaint = true;
  }

  redo() {
    const s = this.redoStack.pop();
    if (!s) return;
    this.undoStack.push(this.snapshot());
    this.ctx.putImageData(s, 0, 0);
    this.dirty = true;
    this.hasPaint = true;
  }

  clear() {
    this.beginStroke();
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.dirty = true;
    this.hasPaint = false;
  }

  /** Called once per rendered frame so a stroke uploads at most once per frame. */
  flush() {
    if (this.dirty) {
      this.texture.needsUpdate = true;
      this.dirty = false;
    }
  }

  toDataURL(): string | null {
    return this.hasPaint ? this.canvas.toDataURL("image/png") : null;
  }

  loadFromDataURL(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.ctx.fillStyle = "#000";
        this.ctx.fillRect(0, 0, this.width, this.height);
        this.ctx.drawImage(img, 0, 0, this.width, this.height);
        this.dirty = true;
        this.hasPaint = true;
        this.undoStack = [];
        this.redoStack = [];
        resolve();
      };
      img.onerror = () => reject(new Error("Could not decode the saved mask."));
      img.src = url;
    });
  }

  dispose() {
    this.texture.dispose();
    this.undoStack = [];
    this.redoStack = [];
  }
}
