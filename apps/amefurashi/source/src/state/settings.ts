/**
 * Amefurashi: settings model.
 *
 * Every value here drives a shader uniform (or a CPU-side quantity that becomes one).
 * Physical quantities carry units in their labels; values without units are artistic controls.
 */

export type PreviewQuality = "low" | "balanced" | "high";

export interface RainSettings {
  enabled: boolean;
  /** Artistic density gain (particle count scales linearly). Not calibrated to mm/h. */
  amount: number;
  /** Mean drop diameter in millimetres (physical). */
  dropSize: number;
  /** 0 = uniform drops, 1 = full exponential (Marshall–Palmer-like) spread. */
  sizeVariation: number;
  /** Multiplier on terminal velocity (1 = Atlas et al. 1973 fit). */
  fallSpeed: number;
  /** Degrees: 0 = blowing right, 90 = away from camera, 180 = left, 270 = toward camera. */
  windDirection: number;
  /** Metres per second (physical). */
  windStrength: number;
  gusts: number;
  turbulence: number;
  nearBalance: number;
  midBalance: number;
  farBalance: number;
  /** Artistic gain applied to streak opacity. */
  visibility: number;
  /** Exposure time in seconds (physical). Streak length = projected velocity × shutter. */
  shutterTime: number;
  /** Artistic multiplier on streak length, kept separate from the physical derivation. */
  lengthMultiplier: number;
  /** Focus distance in metres of the virtual camera (physical). */
  focusDistance: number;
  /** Artistic defocus strength (0 = pinhole). */
  depthOfField: number;
  /** Amount of background replaced by a streak (1 = physical blend, lower = more additive glow). */
  occlusion: number;
  seed: number;
}

export interface AtmosphereSettings {
  enabled: boolean;
  mistDensity: number;
  mistColor: string;
  nearHaze: number;
  farHaze: number;
  softness: number;
  drift: number;
  overcast: number;
  /** Exposure in stops. */
  exposure: number;
  contrast: number;
  /** -1 (cool) .. +1 (warm). */
  temperature: number;
  saturation: number;
}

export interface GlassSettings {
  enabled: boolean;
  coverage: number;
  /** Droplet radius as a percentage of image height. */
  dropletSize: number;
  sizeVariation: number;
  refraction: number;
  highlight: number;
  edgeSoftness: number;
  slideSpeed: number;
  trailAmount: number;
  coalescence: number;
  fog: number;
}

export interface WetSettings {
  enabled: boolean;
  wetness: number;
  reflection: number;
  roughness: number;
  reflectionBlur: number;
  rippleAmount: number;
  rippleScale: number;
  splashAmount: number;
  highlight: number;
  /** Horizon height in image UV (0 = bottom, 1 = top). */
  horizonY: number;
  /** Ground tilt in degrees. */
  tilt: number;
  /** Mask edge feather (mip-level blur). */
  maskFeather: number;
}

export interface LightingSettings {
  ambient: number;
  /** Key light guide position in image UV (y up). */
  keyX: number;
  keyY: number;
  /** -1 = behind the camera (front light), +1 = behind the scene (back light). */
  keyDepth: number;
  keyColor: string;
  keyIntensity: number;
  backlight: number;
  highlightThreshold: number;
  bloom: number;
}

export interface CameraSettings {
  /** Vertical field of view of the virtual camera in degrees. */
  fov: number;
  depthNear: number;
  depthFar: number;
  depthInvert: boolean;
  /** Horizon line of the approximate depth gradient (image UV, y up). Used when no depth map is loaded. */
  gradientHorizon: number;
  /** Rain visibility over protected (masked) areas. */
  foregroundRainVisibility: number;
  /** Rain closer than this distance (m) stays visible in front of protected subjects. */
  protectNearDistance: number;
}

export type ExportMode = "preview" | "original" | "custom";

export interface ExportSettings {
  mode: ExportMode;
  width: number;
  height: number;
  lockAspect: boolean;
  embedImageInProject: boolean;
}

export interface Settings {
  rain: RainSettings;
  atmosphere: AtmosphereSettings;
  glass: GlassSettings;
  wet: WetSettings;
  lighting: LightingSettings;
  camera: CameraSettings;
  export: ExportSettings;
  quality: PreviewQuality;
}

export const DEFAULT_SETTINGS: Settings = {
  rain: {
    enabled: true,
    amount: 0.6,
    dropSize: 1.6,
    sizeVariation: 0.6,
    fallSpeed: 1.0,
    windDirection: 0,
    windStrength: 1.2,
    gusts: 0.3,
    turbulence: 0.3,
    nearBalance: 0.5,
    midBalance: 1.0,
    farBalance: 1.0,
    visibility: 1.0,
    shutterTime: 1 / 125,
    lengthMultiplier: 1.0,
    focusDistance: 4,
    depthOfField: 1.0,
    occlusion: 0.85,
    seed: 1337,
  },
  atmosphere: {
    enabled: true,
    mistDensity: 0.08,
    mistColor: "#b8c0c8",
    nearHaze: 0.1,
    farHaze: 1.0,
    softness: 0.3,
    drift: 0.3,
    overcast: 0.2,
    exposure: 0,
    contrast: 1,
    temperature: 0,
    saturation: 1,
  },
  glass: {
    enabled: false,
    coverage: 0.5,
    dropletSize: 2.0,
    sizeVariation: 0.5,
    refraction: 0.6,
    highlight: 0.5,
    edgeSoftness: 0.3,
    slideSpeed: 0.4,
    trailAmount: 0.5,
    coalescence: 0.5,
    fog: 0.25,
  },
  wet: {
    enabled: false,
    wetness: 0.8,
    reflection: 0.6,
    roughness: 0.35,
    reflectionBlur: 0.3,
    rippleAmount: 0.5,
    rippleScale: 1.0,
    splashAmount: 0.5,
    highlight: 0.6,
    horizonY: 0.55,
    tilt: 0,
    maskFeather: 0.5,
  },
  lighting: {
    ambient: 1.0,
    keyX: 0.5,
    keyY: 0.85,
    keyDepth: 0.4,
    keyColor: "#fff2e0",
    keyIntensity: 0.7,
    backlight: 0.4,
    highlightThreshold: 0.85,
    bloom: 0.15,
  },
  camera: {
    fov: 50,
    depthNear: 0.5,
    depthFar: 40,
    depthInvert: false,
    gradientHorizon: 0.55,
    foregroundRainVisibility: 0.35,
    protectNearDistance: 1.2,
  },
  export: {
    mode: "original",
    width: 1920,
    height: 1080,
    lockAspect: true,
    embedImageInProject: false,
  },
  quality: "balanced",
};

export function cloneSettings(s: Settings): Settings {
  return JSON.parse(JSON.stringify(s)) as Settings;
}

export type SectionKey = Exclude<keyof Settings, "quality">;

/** Long-edge cap of the preview render in pixels for each quality level. */
export const QUALITY_LONG_EDGE: Record<PreviewQuality, number> = {
  low: 1280,
  balanced: 1920,
  high: 2880,
};

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [1, 1, 1];
  const v = parseInt(m[1], 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

/** sRGB (0..1) to linear. */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function hexToLinearRgb(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}

/** Deterministic 32-bit seed from a string or number (used for "New Random Seed"). */
export function randomSeed(): number {
  const buf = new Uint32Array(1);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(buf);
  else buf[0] = Math.floor(Math.random() * 0xffffffff);
  return buf[0] % 1000000;
}
