import { cloneSettings, DEFAULT_SETTINGS, type Settings } from "./settings";

export interface Preset {
  id: string;
  name: string;
  description: string;
  apply: (s: Settings) => Settings;
}

type Partialize<T> = { [K in keyof T]?: Partial<T[K]> };

/**
 * Presets only touch weather / look parameters. They never overwrite image-specific data
 * (masks, depth guides, camera depth range, seed, export settings).
 */
function makePreset(
  id: string,
  name: string,
  description: string,
  patch: Partialize<Pick<Settings, "rain" | "atmosphere" | "glass" | "lighting" | "wet">>,
): Preset {
  return {
    id,
    name,
    description,
    apply: (current) => {
      const base = cloneSettings(DEFAULT_SETTINGS);
      const next = cloneSettings(current);
      // Start from defaults for the weather sections so presets are reproducible,
      // then apply the patch. Keep seed, and keep wet-surface enable/mask geometry.
      const seed = current.rain.seed;
      const wetKeep = {
        enabled: current.wet.enabled,
        horizonY: current.wet.horizonY,
        tilt: current.wet.tilt,
        maskFeather: current.wet.maskFeather,
      };
      const keyKeep = { keyX: current.lighting.keyX, keyY: current.lighting.keyY };
      next.rain = { ...base.rain, ...(patch.rain ?? {}), seed };
      next.atmosphere = { ...base.atmosphere, ...(patch.atmosphere ?? {}) };
      next.glass = { ...base.glass, ...(patch.glass ?? {}) };
      next.lighting = { ...base.lighting, ...(patch.lighting ?? {}), ...keyKeep };
      next.wet = { ...current.wet, ...(patch.wet ?? {}), ...wetKeep };
      return next;
    },
  };
}

export const PRESETS: Preset[] = [
  makePreset("soft-drizzle", "Soft Drizzle", "Fine, slow drops with a light veil of haze.", {
    rain: {
      amount: 0.35,
      dropSize: 0.9,
      sizeVariation: 0.4,
      windStrength: 0.6,
      gusts: 0.15,
      turbulence: 0.4,
      nearBalance: 0.4,
      midBalance: 1.0,
      farBalance: 1.2,
      visibility: 0.9,
      shutterTime: 1 / 100,
      depthOfField: 0.8,
    },
    atmosphere: { mistDensity: 0.15, softness: 0.4, overcast: 0.35, contrast: 0.95, saturation: 0.9 },
    lighting: { keyIntensity: 0.5, backlight: 0.3, bloom: 0.1 },
    wet: { splashAmount: 0.3, rippleAmount: 0.35 },
  }),
  makePreset("overcast-rain", "Overcast Rain", "Steady daytime rain under a flat grey sky.", {
    rain: {
      amount: 0.8,
      dropSize: 1.8,
      sizeVariation: 0.6,
      windStrength: 2.0,
      windDirection: 10,
      gusts: 0.4,
      turbulence: 0.3,
      visibility: 1.0,
      shutterTime: 1 / 125,
    },
    atmosphere: {
      mistDensity: 0.18,
      overcast: 0.6,
      temperature: -0.15,
      saturation: 0.8,
      exposure: -0.15,
      softness: 0.35,
    },
    lighting: { ambient: 1.1, keyIntensity: 0.6, backlight: 0.35, bloom: 0.1 },
    wet: { splashAmount: 0.5, rippleAmount: 0.5 },
  }),
  makePreset("heavy-shower", "Heavy Shower", "Dense, wind-driven rain with long streaks and spray.", {
    rain: {
      amount: 1.7,
      dropSize: 2.6,
      sizeVariation: 0.7,
      fallSpeed: 1.05,
      windStrength: 4.0,
      windDirection: 15,
      gusts: 0.7,
      turbulence: 0.5,
      nearBalance: 0.9,
      midBalance: 1.2,
      farBalance: 1.0,
      visibility: 1.2,
      shutterTime: 1 / 60,
      depthOfField: 1.2,
    },
    atmosphere: { mistDensity: 0.3, nearHaze: 0.15, softness: 0.5, overcast: 0.5, saturation: 0.85, contrast: 0.97 },
    lighting: { keyIntensity: 0.8, backlight: 0.5, bloom: 0.12 },
    wet: { splashAmount: 0.9, rippleAmount: 0.8 },
  }),
  makePreset("backlit-night", "Backlit Night Rain", "Dark scene, strong backlight, glowing streaks and bloom.", {
    rain: {
      amount: 1.1,
      dropSize: 2.0,
      sizeVariation: 0.6,
      windStrength: 1.5,
      gusts: 0.35,
      visibility: 1.1,
      shutterTime: 1 / 60,
      depthOfField: 1.5,
      focusDistance: 3,
    },
    atmosphere: {
      mistDensity: 0.22,
      mistColor: "#6f7a8a",
      exposure: -0.4,
      contrast: 1.1,
      saturation: 0.9,
      temperature: -0.1,
      overcast: 0.1,
    },
    lighting: {
      ambient: 0.5,
      keyDepth: 0.9,
      keyColor: "#ffd9a8",
      keyIntensity: 2.2,
      backlight: 0.9,
      highlightThreshold: 0.75,
      bloom: 0.32,
    },
    wet: { splashAmount: 0.6, rippleAmount: 0.6, highlight: 0.9 },
  }),
  makePreset("misty-rain", "Misty Rain", "Light rain lost in dense, softly drifting mist.", {
    rain: {
      amount: 0.45,
      dropSize: 1.1,
      sizeVariation: 0.5,
      windStrength: 0.8,
      turbulence: 0.5,
      visibility: 0.7,
      shutterTime: 1 / 100,
    },
    atmosphere: {
      mistDensity: 0.42,
      mistColor: "#c2c8cf",
      nearHaze: 0.3,
      farHaze: 1.0,
      softness: 0.7,
      drift: 0.5,
      overcast: 0.5,
      saturation: 0.75,
      contrast: 0.9,
    },
    lighting: { keyIntensity: 0.45, backlight: 0.5, highlightThreshold: 0.75, bloom: 0.2 },
    wet: { splashAmount: 0.3, rippleAmount: 0.4 },
  }),
  makePreset("rain-on-glass", "Rain on Glass", "The scene seen through a wet window, with rain behind it.", {
    rain: {
      amount: 0.5,
      dropSize: 1.6,
      visibility: 0.7,
      depthOfField: 2.0,
      focusDistance: 6,
      shutterTime: 1 / 100,
    },
    atmosphere: { mistDensity: 0.08, overcast: 0.25, softness: 0.3 },
    glass: {
      enabled: true,
      coverage: 0.65,
      dropletSize: 2.2,
      sizeVariation: 0.6,
      refraction: 0.75,
      highlight: 0.5,
      edgeSoftness: 0.3,
      slideSpeed: 0.5,
      trailAmount: 0.6,
      coalescence: 0.7,
      fog: 0.45,
    },
    lighting: { keyIntensity: 0.7, backlight: 0.4, bloom: 0.15 },
  }),
];
