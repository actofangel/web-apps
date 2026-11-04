import * as THREE from "three";
import { FULLSCREEN_VS, RAIN_FS, RAIN_VS, SCENE_FS, SPLASH_FS, SPLASH_VS } from "./shaders/core";
import { BLUR_FS, BRIGHT_FS, DISPLAY_FS, FINAL_FS, GRADE_FS } from "./shaders/post";
import { MaskLayer } from "./MaskLayer";
import {
  cloneSettings,
  DEFAULT_SETTINGS,
  hexToLinearRgb,
  QUALITY_LONG_EDGE,
  type Settings,
} from "../state/settings";
import { computeViewRect, type ViewState } from "./view";

export type OverlayMode = "none" | "wet" | "protect" | "depth";

export interface OverlayState {
  mode: OverlayMode;
  /** -1 = off, otherwise image-space x (0..1) of the before/after wipe. */
  split: number;
  showOriginal: boolean;
}

export interface EngineImage {
  texture: THREE.CanvasTexture;
  /** Natural (uploaded) dimensions. */
  width: number;
  height: number;
  /** Texture dimensions (≤ GPU limit). Equal to natural unless downscaled. */
  texW: number;
  texH: number;
  source: HTMLCanvasElement;
}

interface Targets {
  w: number;
  h: number;
  scene: THREE.WebGLRenderTarget;
  graded: THREE.WebGLRenderTarget;
  bright: THREE.WebGLRenderTarget;
  blurA: THREE.WebGLRenderTarget;
  blurB: THREE.WebGLRenderTarget;
  blurC: THREE.WebGLRenderTarget;
  blurD: THREE.WebGLRenderTarget;
  final: THREE.WebGLRenderTarget;
}

type UniformValue = number | boolean | THREE.Texture | null | number[];

const MAX_RAIN_INSTANCES = 65536;
const MAX_SPLASH_INSTANCES = 4096;
/** Depth bands of the rain volume in metres (near, mid, far). */
export const BAND_NEAR = [0.25, 1.5, 6.0];
export const BAND_FAR = [1.5, 6.0, 22.0];
/** Long-edge cap for the source texture (also bounds "Original size" export). */
export const MAX_IMAGE_EDGE = 8192;
/** Soft cap on export pixel count to avoid GPU out-of-memory on typical hardware. */
export const MAX_EXPORT_PIXELS = 60_000_000;

const f = (v = 0) => ({ value: v });
const v2 = () => ({ value: new THREE.Vector2() });
const v3 = () => ({ value: new THREE.Vector3() });
const v4 = () => ({ value: new THREE.Vector4() });
const t = () => ({ value: null as THREE.Texture | null });

function fitWithin(w: number, h: number, maxEdge: number) {
  const s = Math.min(1, maxEdge / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

export class RainEngine {
  readonly canvas: HTMLCanvasElement;
  renderer!: THREE.WebGLRenderer;
  ok = false;
  error: string | null = null;
  settings: Settings = cloneSettings(DEFAULT_SETTINGS);
  time = 0;
  playing = false;
  view: ViewState = { zoom: 1, panX: 0, panY: 0 };
  overlay: OverlayState = { mode: "none", split: -1, showOriginal: false };
  /** Effect pipeline must be re-run (settings, time, masks, image changed). */
  needsRender = true;
  /** Only the display pass must be re-run (zoom, pan, overlays, compare). */
  needsDisplay = true;
  onTick?: (time: number, fps: number) => void;
  onContextLost?: () => void;

  image: EngineImage | null = null;
  wetMask: MaskLayer | null = null;
  protectMask: MaskLayer | null = null;
  depth: { texture: THREE.CanvasTexture; canvas: HTMLCanvasElement } | null = null;
  compW = 0;
  compH = 0;
  maxTextureSize = 4096;
  halfFloat = true;

  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private targets: Targets | null = null;
  private blackTex!: THREE.DataTexture;
  private sceneMat!: THREE.RawShaderMaterial;
  private rainMat!: THREE.RawShaderMaterial;
  private splashMat!: THREE.RawShaderMaterial;
  private gradeMat!: THREE.RawShaderMaterial;
  private brightMat!: THREE.RawShaderMaterial;
  private blurMat!: THREE.RawShaderMaterial;
  private finalMat!: THREE.RawShaderMaterial;
  private displayMat!: THREE.RawShaderMaterial;
  private rainGeo!: THREE.InstancedBufferGeometry;
  private splashGeo!: THREE.InstancedBufferGeometry;
  private scenes: Record<string, THREE.Scene> = {};
  private raf = 0;
  private lastNow = 0;
  private lastNotify = 0;
  private fpsCount = 0;
  private fps = 0;
  private dpr = 1;
  private lastQuality: Settings["quality"] = "balanced";
  private materials: THREE.RawShaderMaterial[] = [];
  private sizeTmp = new THREE.Vector2();
  // Video recording surface: a 2D canvas that receives the clean composition (no zoom, pan or overlays).
  private rec: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; last: number } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        alpha: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
        powerPreference: "high-performance",
      });
    } catch (e) {
      this.error = "WebGL 2 is not available in this browser, so Amefurashi cannot render. " + String(e);
      return;
    }
    const r = this.renderer;
    if (!r.capabilities.isWebGL2) {
      this.error = "WebGL 2 is required but only WebGL 1 is available.";
      return;
    }
    r.autoClear = false;
    r.toneMapping = THREE.NoToneMapping;
    r.outputColorSpace = THREE.LinearSRGBColorSpace; // all encoding is done in our shaders
    r.setClearColor(0x000000, 1);
    this.maxTextureSize = Math.min(r.capabilities.maxTextureSize, 16384);
    this.halfFloat = r.extensions.has("EXT_color_buffer_float") || r.extensions.has("EXT_color_buffer_half_float");
    canvas.addEventListener("webglcontextlost", (ev) => {
      ev.preventDefault();
      this.error = "The WebGL context was lost (usually GPU memory pressure). Reload the page to continue.";
      this.onContextLost?.();
    });

    this.blackTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.blackTex.needsUpdate = true;
    this.buildMaterials();
    this.ok = true;
    this.lastNow = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------------ setup

  private makeMaterial(fs: string, uniforms: Record<string, { value: unknown }>, vs = FULLSCREEN_VS, extra: Partial<THREE.ShaderMaterialParameters> = {}) {
    const m = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: vs,
      fragmentShader: fs,
      uniforms: uniforms as Record<string, THREE.IUniform>,
      depthTest: false,
      depthWrite: false,
      ...extra,
    });
    this.materials.push(m);
    return m;
  }

  private fullscreenScene(name: string, mat: THREE.Material) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    const s = new THREE.Scene();
    s.add(mesh);
    this.scenes[name] = s;
  }

  private instancedScene(name: string, mat: THREE.Material): THREE.InstancedBufferGeometry {
    const plane = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute("position", plane.attributes.position);
    geo.setIndex(plane.index);
    geo.instanceCount = 0;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    const s = new THREE.Scene();
    s.add(mesh);
    this.scenes[name] = s;
    return geo;
  }

  private buildMaterials() {
    const cameraU = () => ({ uRes: v2(), uFocal: f(1000), uTime: f(0), uSeed: f(1) });
    const lightU = () => ({ uAmbient: f(1), uKeyDir: v3(), uKeyColor: v3(), uKeyIntensity: f(0.7), uBacklight: f(0.4) });
    const depthU = () => ({ uDepthMap: t(), uHasDepth: f(0), uDepthInvert: f(0), uDepthNear: f(0.5), uDepthFar: f(40), uGradHorizon: f(0.55) });
    const mistU = () => ({ uAtmoOn: f(1), uMistDensity: f(0), uMistColor: v3(), uNearHaze: f(0), uFarHaze: f(1), uDrift: f(0) });

    this.sceneMat = this.makeMaterial(SCENE_FS, {
      ...cameraU(), ...lightU(), ...depthU(), ...mistU(),
      uImage: t(), uWetMask: t(), uWetOn: f(0), uWetness: f(0), uReflStrength: f(0), uRoughness: f(0), uReflBlur: f(0),
      uRippleAmt: f(0), uRippleScale: f(1), uWetHighlight: f(0), uHorizonY: f(0.5), uTilt: f(0), uMaskFeather: f(0), uSoftness: f(0),
    });
    this.fullscreenScene("scene", this.sceneMat);

    const premul = {
      transparent: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    };
    this.rainMat = this.makeMaterial(RAIN_FS, {
      ...cameraU(), ...lightU(), ...depthU(), ...mistU(),
      uImage: t(), uCounts: v3(), uBandNear: v3(), uBandFar: v3(), uDropSize: f(1.6), uSizeVar: f(0.5), uFallSpeed: f(1),
      uWindDirDeg: f(0), uWindStrength: f(0), uGust: f(0), uTurb: f(0), uShutter: f(0.008), uLengthMul: f(1), uFocusDist: f(4),
      uDof: f(1), uVisibility: f(1), uProtectMask: t(), uFgVis: f(0.35), uProtectNear: f(1.2), uOcclusion: f(0.85),
    }, RAIN_VS, premul);
    this.rainGeo = this.instancedScene("rain", this.rainMat);

    this.splashMat = this.makeMaterial(SPLASH_FS, {
      ...cameraU(), ...lightU(), uWetMask: t(), uImage: t(), uHorizonY: f(0.5), uTilt: f(0),
    }, SPLASH_VS, premul);
    this.splashGeo = this.instancedScene("splash", this.splashMat);

    this.gradeMat = this.makeMaterial(GRADE_FS, { uScene: t(), uExposure: f(0), uContrast: f(1), uTemperature: f(0), uSaturation: f(1), uOvercast: f(0) });
    this.fullscreenScene("grade", this.gradeMat);
    this.brightMat = this.makeMaterial(BRIGHT_FS, { uSrc: t(), uThreshold: f(0.85) });
    this.fullscreenScene("bright", this.brightMat);
    this.blurMat = this.makeMaterial(BLUR_FS, { uSrc: t(), uDir: v2() });
    this.fullscreenScene("blur", this.blurMat);
    this.finalMat = this.makeMaterial(FINAL_FS, {
      uGraded: t(), uBloomA: t(), uBloomB: t(), uBloom: f(0), uRes: v2(), uTime: f(0), uSeed: f(1), uGlassOn: f(0), uCoverage: f(0.5),
      uDropR: f(0.02), uDropVar: f(0.5), uRefract: f(0.6), uGHighlight: f(0.5), uEdgeSoft: f(0.3), uSlide: f(0.4), uTrail: f(0.5),
      uCoalesce: f(0.5), uGlassFog: f(0.25), uKeyDir: v3(), uKeyColor: v3(), uKeyIntensity: f(0.7),
    });
    this.fullscreenScene("final", this.finalMat);
    this.displayMat = this.makeMaterial(DISPLAY_FS, {
      ...depthU(), uFinal: t(), uImage: t(), uOverlayMask: t(), uOverlayMode: f(0), uViewRect: v4(), uSplit: f(-1), uShowOriginal: f(0), uBg: v3(),
    });
    this.fullscreenScene("display", this.displayMat);
  }

  private makeTarget(w: number, h: number, opts: { hdr?: boolean; mips?: boolean } = {}) {
    const hdr = opts.hdr !== false && this.halfFloat;
    const rt = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
      type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      minFilter: opts.mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: !!opts.mips,
      depthBuffer: false,
      stencilBuffer: false,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
    });
    rt.texture.colorSpace = THREE.NoColorSpace;
    return rt;
  }

  private createTargets(w: number, h: number, previewMips = false): Targets {
    const h2 = (n: number) => Math.max(1, Math.round(n / 2));
    const h4 = (n: number) => Math.max(1, Math.round(n / 4));
    const h8 = (n: number) => Math.max(1, Math.round(n / 8));
    return {
      w, h,
      scene: this.makeTarget(w, h),
      graded: this.makeTarget(w, h, { mips: true }),
      bright: this.makeTarget(h2(w), h2(h)),
      blurA: this.makeTarget(h4(w), h4(h)),
      blurB: this.makeTarget(h4(w), h4(h)),
      blurC: this.makeTarget(h8(w), h8(h)),
      blurD: this.makeTarget(h8(w), h8(h)),
      // Preview: mipmapped so thin streaks do not alias away when the view is zoomed out.
      final: this.makeTarget(w, h, { hdr: false, mips: previewMips }),
    };
  }

  private disposeTargets(T: Targets | null) {
    if (!T) return;
    for (const k of ["scene", "graded", "bright", "blurA", "blurB", "blurC", "blurD", "final"] as const) T[k].dispose();
  }

  private allocatePreviewTargets() {
    this.disposeTargets(this.targets);
    this.targets = null;
    if (!this.image) return;
    const cap = Math.min(QUALITY_LONG_EDGE[this.settings.quality], this.maxTextureSize);
    const c = fitWithin(this.image.texW, this.image.texH, cap);
    this.compW = c.w;
    this.compH = c.h;
    this.targets = this.createTargets(c.w, c.h, true);
    this.lastQuality = this.settings.quality;
    this.needsRender = true;
  }

  // ------------------------------------------------------------------ image / masks / depth

  setImage(source: HTMLCanvasElement, naturalW: number, naturalH: number) {
    this.clearImage();
    const tex = new THREE.CanvasTexture(source);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    this.image = { texture: tex, width: naturalW, height: naturalH, texW: source.width, texH: source.height, source };
    const m = fitWithin(naturalW, naturalH, 2048);
    this.wetMask = new MaskLayer(m.w, m.h);
    this.protectMask = new MaskLayer(m.w, m.h);
    this.allocatePreviewTargets();
    this.needsRender = true;
  }

  clearImage() {
    this.stopRecordingSurface();
    if (this.image) {
      this.image.texture.dispose();
      this.image = null;
    }
    this.wetMask?.dispose();
    this.protectMask?.dispose();
    this.wetMask = null;
    this.protectMask = null;
    this.setDepthMap(null);
    this.disposeTargets(this.targets);
    this.targets = null;
    this.compW = this.compH = 0;
    this.needsRender = true;
    // Also clear the on-screen canvas so no stale frame remains.
    if (this.ok) {
      this.renderer.setRenderTarget(null);
      this.renderer.clear();
    }
  }

  setDepthMap(canvas: HTMLCanvasElement | null) {
    if (this.depth) {
      this.depth.texture.dispose();
      this.depth = null;
    }
    if (canvas) {
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.NoColorSpace;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;
      this.depth = { texture: tex, canvas };
    }
    this.needsRender = true;
  }

  // ------------------------------------------------------------------ frame loop

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, Math.max(0, (now - this.lastNow) / 1000));
    this.lastNow = now;
    if (this.playing) {
      this.time += dt;
      this.needsRender = true;
    }
    // Quality changes are deferred while recording so the video frame size stays constant.
    if (this.settings.quality !== this.lastQuality && !this.rec) this.allocatePreviewTargets();
    if (this.resizeIfNeeded()) this.needsDisplay = true;
    if (this.image && this.targets && (this.needsRender || this.needsDisplay)) {
      if (this.needsRender) {
        this.renderPipeline(this.targets);
        this.copyToRecording(now);
        this.fpsCount++;
      }
      this.renderDisplay();
      this.needsRender = false;
      this.needsDisplay = false;
    }
    if (now - this.lastNotify > 500) {
      // Real frames presented per second while playing (wall-clock based).
      this.fps = this.playing ? (this.fpsCount * 1000) / Math.max(1, now - this.lastNotify) : 0;
      this.fpsCount = 0;
      this.lastNotify = now;
      this.onTick?.(this.time, this.fps);
    }
  };

  private resizeIfNeeded(): boolean {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight));
    const cur = this.renderer.getSize(this.sizeTmp);
    if (cur.x !== w || cur.y !== h || this.dpr !== dpr) {
      this.dpr = dpr;
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(w, h, false);
      return true;
    }
    return false;
  }

  setTime(t: number) {
    this.time = Math.max(0, t);
    this.needsRender = true;
  }

  invalidate() {
    this.needsRender = true;
  }

  /** Redraw only the display pass (view transform / preview overlays). */
  invalidateDisplay() {
    this.needsDisplay = true;
  }

  // ------------------------------------------------------------------ uniforms

  private setU(mat: THREE.RawShaderMaterial, name: string, v: UniformValue) {
    const u = mat.uniforms[name];
    if (!u) return;
    if (Array.isArray(v)) (u.value as THREE.Vector3).fromArray(v);
    else if (typeof v === "boolean") u.value = v ? 1 : 0;
    else u.value = v;
  }

  private applyAll(params: Record<string, UniformValue>) {
    for (const m of this.materials) for (const k in params) this.setU(m, k, params[k]);
  }

  private keyDirection(aspect: number): [number, number, number] {
    const L = this.settings.lighting;
    const tanV = Math.tan((this.settings.camera.fov * Math.PI) / 360);
    const nx = (L.keyX - 0.5) * 2 * tanV * aspect;
    const ny = (L.keyY - 0.5) * 2 * tanV;
    const nz = L.keyDepth;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-4) return [0, 1, 0];
    return [nx / len, ny / len, nz / len];
  }

  /** Rain instance counts per band; independent of resolution and preview quality. */
  rainCounts(): [number, number, number] {
    const R = this.settings.rain;
    if (!R.enabled) return [0, 0, 0];
    const base = R.amount * 14000;
    let n = base * R.nearBalance / 2.5;
    let m = base * R.midBalance / 2.5;
    let fa = base * R.farBalance / 2.5;
    const total = n + m + fa;
    if (total > MAX_RAIN_INSTANCES) {
      const s = MAX_RAIN_INSTANCES / total;
      n *= s; m *= s; fa *= s;
    }
    return [Math.floor(n), Math.floor(m), Math.floor(fa)];
  }

  splashCount(): number {
    const S = this.settings;
    if (!S.wet.enabled || !S.rain.enabled) return 0;
    return Math.min(MAX_SPLASH_INSTANCES, Math.floor(S.wet.splashAmount * S.rain.amount * 1500));
  }

  private updateUniforms(w: number, h: number, T: Targets) {
    const S = this.settings;
    const img = this.image!;
    const aspect = w / h;
    const focal = h / (2 * Math.tan((S.camera.fov * Math.PI) / 360));
    const wetMaskTex = this.wetMask ? this.wetMask.texture : this.blackTex;
    const protectTex = this.protectMask ? this.protectMask.texture : this.blackTex;
    const counts = this.rainCounts();

    this.applyAll({
      uRes: [w, h],
      uFocal: focal,
      uTime: this.time,
      uSeed: Math.floor(S.rain.seed) >>> 0,
      uImage: img.texture,
      uAmbient: S.lighting.ambient,
      uKeyDir: this.keyDirection(aspect),
      uKeyColor: hexToLinearRgb(S.lighting.keyColor),
      uKeyIntensity: S.lighting.keyIntensity,
      uBacklight: S.lighting.backlight,
      uDepthMap: this.depth ? this.depth.texture : this.blackTex,
      uHasDepth: !!this.depth,
      uDepthInvert: S.camera.depthInvert,
      uDepthNear: S.camera.depthNear,
      uDepthFar: Math.max(S.camera.depthFar, S.camera.depthNear + 0.1),
      uGradHorizon: S.camera.gradientHorizon,
      uAtmoOn: S.atmosphere.enabled,
      uMistDensity: S.atmosphere.mistDensity,
      uMistColor: hexToLinearRgb(S.atmosphere.mistColor),
      uNearHaze: S.atmosphere.nearHaze,
      uFarHaze: S.atmosphere.farHaze,
      uDrift: S.atmosphere.drift,
      uWetMask: wetMaskTex,
      uHorizonY: S.wet.horizonY,
      uTilt: S.wet.tilt,
    });

    // Scene pass
    this.setU(this.sceneMat, "uWetOn", S.wet.enabled);
    this.setU(this.sceneMat, "uWetness", S.wet.wetness);
    this.setU(this.sceneMat, "uReflStrength", S.wet.reflection);
    this.setU(this.sceneMat, "uRoughness", S.wet.roughness);
    this.setU(this.sceneMat, "uReflBlur", S.wet.reflectionBlur);
    this.setU(this.sceneMat, "uRippleAmt", S.wet.rippleAmount);
    this.setU(this.sceneMat, "uRippleScale", S.wet.rippleScale);
    this.setU(this.sceneMat, "uWetHighlight", S.wet.highlight);
    this.setU(this.sceneMat, "uMaskFeather", S.wet.maskFeather);
    this.setU(this.sceneMat, "uSoftness", S.atmosphere.softness);

    // Rain pass
    const R = S.rain;
    this.setU(this.rainMat, "uCounts", counts);
    this.setU(this.rainMat, "uBandNear", BAND_NEAR);
    this.setU(this.rainMat, "uBandFar", BAND_FAR);
    this.setU(this.rainMat, "uDropSize", R.dropSize);
    this.setU(this.rainMat, "uSizeVar", R.sizeVariation);
    this.setU(this.rainMat, "uFallSpeed", R.fallSpeed);
    this.setU(this.rainMat, "uWindDirDeg", R.windDirection);
    this.setU(this.rainMat, "uWindStrength", R.windStrength);
    this.setU(this.rainMat, "uGust", R.gusts);
    this.setU(this.rainMat, "uTurb", R.turbulence);
    this.setU(this.rainMat, "uShutter", R.shutterTime);
    this.setU(this.rainMat, "uLengthMul", R.lengthMultiplier);
    this.setU(this.rainMat, "uFocusDist", R.focusDistance);
    this.setU(this.rainMat, "uDof", R.depthOfField);
    this.setU(this.rainMat, "uVisibility", R.visibility);
    this.setU(this.rainMat, "uProtectMask", protectTex);
    this.setU(this.rainMat, "uFgVis", S.camera.foregroundRainVisibility);
    this.setU(this.rainMat, "uProtectNear", S.camera.protectNearDistance);
    this.setU(this.rainMat, "uOcclusion", R.occlusion);
    this.rainGeo.instanceCount = counts[0] + counts[1] + counts[2];
    this.splashGeo.instanceCount = this.splashCount();

    // Grade
    const A = S.atmosphere;
    this.setU(this.gradeMat, "uScene", T.scene.texture);
    this.setU(this.gradeMat, "uExposure", A.exposure);
    this.setU(this.gradeMat, "uContrast", A.contrast);
    this.setU(this.gradeMat, "uTemperature", A.temperature);
    this.setU(this.gradeMat, "uSaturation", A.saturation);
    this.setU(this.gradeMat, "uOvercast", A.enabled ? A.overcast : 0);

    // Bloom
    this.setU(this.brightMat, "uSrc", T.graded.texture);
    this.setU(this.brightMat, "uThreshold", S.lighting.highlightThreshold);

    // Final / glass
    const G = S.glass;
    this.setU(this.finalMat, "uGraded", T.graded.texture);
    this.setU(this.finalMat, "uBloomA", T.blurB.texture);
    this.setU(this.finalMat, "uBloomB", T.blurD.texture);
    this.setU(this.finalMat, "uBloom", S.lighting.bloom);
    this.setU(this.finalMat, "uGlassOn", G.enabled);
    this.setU(this.finalMat, "uCoverage", G.coverage);
    this.setU(this.finalMat, "uDropR", G.dropletSize / 100);
    this.setU(this.finalMat, "uDropVar", G.sizeVariation);
    this.setU(this.finalMat, "uRefract", G.refraction);
    this.setU(this.finalMat, "uGHighlight", G.highlight);
    this.setU(this.finalMat, "uEdgeSoft", G.edgeSoftness);
    this.setU(this.finalMat, "uSlide", G.slideSpeed);
    this.setU(this.finalMat, "uTrail", G.trailAmount);
    this.setU(this.finalMat, "uCoalesce", G.coalescence);
    this.setU(this.finalMat, "uGlassFog", G.fog);
  }

  // ------------------------------------------------------------------ rendering

  /** Full effect pipeline into `T.final` (sRGB-encoded RGBA8). Shared by preview and export. */
  private renderPipeline(T: Targets) {
    const r = this.renderer;
    const S = this.settings;
    this.wetMask?.flush();
    this.protectMask?.flush();
    this.updateUniforms(T.w, T.h, T);

    r.setRenderTarget(T.scene);
    r.clear();
    r.render(this.scenes.scene, this.cam);
    if (this.rainGeo.instanceCount > 0) r.render(this.scenes.rain, this.cam);
    if (this.splashGeo.instanceCount > 0) r.render(this.scenes.splash, this.cam);

    r.setRenderTarget(T.graded);
    r.render(this.scenes.grade, this.cam);

    if (S.lighting.bloom > 0) {
      r.setRenderTarget(T.bright);
      r.render(this.scenes.bright, this.cam);
      const blur = (src: THREE.WebGLRenderTarget, dst: THREE.WebGLRenderTarget, dx: number, dy: number) => {
        this.setU(this.blurMat, "uSrc", src.texture);
        this.setU(this.blurMat, "uDir", [dx / src.width, dy / src.height]);
        r.setRenderTarget(dst);
        r.render(this.scenes.blur, this.cam);
      };
      blur(T.bright, T.blurA, 1, 0);
      blur(T.blurA, T.blurB, 0, 1);
      blur(T.blurB, T.blurC, 1, 0);
      blur(T.blurC, T.blurD, 0, 1);
    }

    r.setRenderTarget(T.final);
    r.render(this.scenes.final, this.cam);
  }

  private renderDisplay() {
    const T = this.targets!;
    const img = this.image!;
    const r = this.renderer;
    const size = r.getSize(this.sizeTmp);
    const rect = computeViewRect(this.view, size.x, size.y, img.width, img.height);
    const dpr = this.dpr;
    const dm = this.displayMat;
    this.setU(dm, "uFinal", T.final.texture);
    this.setU(dm, "uImage", img.texture);
    const mode = this.overlay.mode;
    this.setU(dm, "uOverlayMode", mode === "wet" ? 1 : mode === "protect" ? 2 : mode === "depth" ? 3 : 0);
    this.setU(dm, "uOverlayMask", mode === "protect" ? (this.protectMask?.texture ?? this.blackTex) : (this.wetMask?.texture ?? this.blackTex));
    (dm.uniforms.uViewRect.value as THREE.Vector4).set(rect.left * dpr, (size.y - rect.top - rect.height) * dpr, rect.width * dpr, rect.height * dpr);
    this.setU(dm, "uSplit", this.overlay.split);
    this.setU(dm, "uShowOriginal", this.overlay.showOriginal);
    this.setU(dm, "uBg", [0.055, 0.057, 0.062]);
    r.setRenderTarget(null);
    r.clear();
    r.render(this.scenes.display, this.cam);
  }

  // ------------------------------------------------------------------ video recording surface

  /**
   * Start mirroring the clean composition into a 2D canvas for MediaRecorder. The video size is the preview
   * render size, reduced only if it does not fit the on-screen drawing buffer (the copy goes through it).
   */
  startRecordingSurface(): HTMLCanvasElement | null {
    const T = this.targets;
    if (!T) return null;
    const buf = this.renderer.getDrawingBufferSize(this.sizeTmp);
    const k = Math.min(1, buf.x / T.w, buf.y / T.h);
    const canvas = document.createElement("canvas");
    // Even dimensions keep VP8/VP9 encoders happy.
    canvas.width = Math.max(2, Math.floor((T.w * k) / 2) * 2);
    canvas.height = Math.max(2, Math.floor((T.h * k) / 2) * 2);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    this.rec = { canvas, ctx, last: -Infinity };
    this.needsRender = true;
    return canvas;
  }

  stopRecordingSurface() {
    if (!this.rec) return;
    this.rec.canvas.width = this.rec.canvas.height = 1;
    this.rec = null;
  }

  /**
   * Draw the composition unzoomed into the corner of the drawing buffer and copy it into the recording
   * canvas within the same frame (GPU to GPU, no pixel readback). The normal display pass then overwrites it.
   */
  private copyToRecording(now: number) {
    const R = this.rec;
    const T = this.targets;
    if (!R || !T) return;
    if (now - R.last < 1000 / 30 - 2) return; // the recorder samples at 30 fps
    R.last = now;
    const buf = this.renderer.getDrawingBufferSize(this.sizeTmp);
    const k = Math.min(1, buf.x / R.canvas.width, buf.y / R.canvas.height);
    const rw = Math.max(1, Math.floor(R.canvas.width * k));
    const rh = Math.max(1, Math.floor(R.canvas.height * k));
    const dm = this.displayMat;
    this.setU(dm, "uFinal", T.final.texture);
    this.setU(dm, "uOverlayMode", 0);
    (dm.uniforms.uViewRect.value as THREE.Vector4).set(0, 0, rw, rh);
    this.setU(dm, "uSplit", -1);
    this.setU(dm, "uShowOriginal", false);
    const r = this.renderer;
    r.setRenderTarget(null);
    r.clear();
    r.render(this.scenes.display, this.cam);
    R.ctx.drawImage(this.canvas, 0, buf.y - rh, rw, rh, 0, 0, R.canvas.width, R.canvas.height);
  }

  // ------------------------------------------------------------------ export

  /** Largest output dimensions this GPU / build can produce for the current image. */
  exportLimits() {
    return { maxEdge: this.maxTextureSize, maxPixels: MAX_EXPORT_PIXELS, texW: this.image?.texW ?? 0, texH: this.image?.texH ?? 0 };
  }

  /**
   * Render the frozen scene at the requested output size through the same pipeline used for the
   * preview (dedicated render targets, no screenshot) and return a PNG blob.
   * If the output aspect differs from the image, the image is letterboxed (never cropped or stretched).
   */
  async exportPNG(outW: number, outH: number): Promise<Blob> {
    if (!this.image) throw new Error("No image is loaded.");
    outW = Math.max(1, Math.round(outW));
    outH = Math.max(1, Math.round(outH));
    if (outW > this.maxTextureSize || outH > this.maxTextureSize) {
      throw new Error(`Requested ${outW}×${outH} exceeds this GPU's maximum texture size (${this.maxTextureSize} px per side). Choose a smaller size.`);
    }
    if (outW * outH > MAX_EXPORT_PIXELS) {
      throw new Error(`Requested ${outW}×${outH} (${(outW * outH / 1e6).toFixed(1)} MP) exceeds the ${MAX_EXPORT_PIXELS / 1e6} MP export limit of this build. Choose a smaller size.`);
    }
    const img = this.image;
    const scale = Math.min(outW / img.width, outH / img.height);
    const rw = Math.max(1, Math.round(img.width * scale));
    const rh = Math.max(1, Math.round(img.height * scale));
    const ox = Math.floor((outW - rw) / 2);
    const oy = Math.floor((outH - rh) / 2);
    const r = this.renderer;
    const gl = r.getContext() as WebGL2RenderingContext;
    gl.getError(); // clear stale errors
    let T: Targets | null = null;
    try {
      T = this.createTargets(rw, rh);
      this.renderPipeline(T);
      const err = gl.getError();
      if (err !== gl.NO_ERROR) {
        const msg = err === gl.OUT_OF_MEMORY ? "the GPU ran out of memory" : `WebGL error ${err}`;
        throw new Error(`Export at ${outW}×${outH} failed because ${msg}. Try a smaller output size.`);
      }
      const buf = new Uint8Array(rw * rh * 4);
      r.readRenderTargetPixels(T.final, 0, 0, rw, rh, buf);
      let nonZero = false;
      for (let i = 0; i < buf.length; i += 4013) if (buf[i] !== 0 || buf[i + 1] !== 0 || buf[i + 2] !== 0) { nonZero = true; break; }
      if (!nonZero) throw new Error("The export came back blank (all black). This usually means the GPU could not allocate the output. Try a smaller size.");
      const out = document.createElement("canvas");
      out.width = outW;
      out.height = outH;
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("Could not create the output canvas.");
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, outW, outH);
      const data = ctx.createImageData(rw, rh);
      const row = rw * 4;
      for (let y = 0; y < rh; y++) {
        const src = (rh - 1 - y) * row;
        data.data.set(buf.subarray(src, src + row), y * row);
      }
      for (let i = 3; i < data.data.length; i += 4) data.data[i] = 255;
      ctx.putImageData(data, ox, oy);
      const blob = await new Promise<Blob>((resolve, reject) =>
        out.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed."))), "image/png"),
      );
      out.width = out.height = 1;
      return blob;
    } finally {
      this.disposeTargets(T);
      r.setRenderTarget(null);
      this.needsRender = true;
    }
  }

  // ------------------------------------------------------------------ teardown

  dispose() {
    cancelAnimationFrame(this.raf);
    this.stopRecordingSurface();
    this.clearImage();
    for (const m of this.materials) m.dispose();
    for (const k in this.scenes) this.scenes[k].traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    this.blackTex.dispose();
    this.renderer?.dispose();
  }
}
