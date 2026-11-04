import { DEFAULT_SETTINGS, type Settings } from "../state/settings";

export const PROJECT_VERSION = 1;

export interface ProjectFile {
  app: "amefurashi";
  version: number;
  savedAt: string;
  settings: Settings;
  /** Frozen time in seconds. All animated layers are closed-form functions of (time, seed),
   *  so time + seed fully reproduce the frame — there is no hidden simulation state. */
  time: number;
  image: {
    name: string;
    width: number;
    height: number;
    size: number;
    type: string;
    /** PNG data URL of the source (only when the user chose to embed). */
    embedded: string | null;
  };
  masks: { wet: string | null; protect: string | null };
  depth: string | null;
}

export interface ProjectImageInfo {
  name: string;
  width: number;
  height: number;
  size: number;
  type: string;
}

export function serializeProject(args: {
  settings: Settings;
  time: number;
  image: ProjectImageInfo;
  embedCanvas: HTMLCanvasElement | null;
  wetMask: string | null;
  protectMask: string | null;
  depth: string | null;
}): string {
  const file: ProjectFile = {
    app: "amefurashi",
    version: PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    settings: args.settings,
    time: args.time,
    image: { ...args.image, embedded: args.embedCanvas ? args.embedCanvas.toDataURL("image/png") : null },
    masks: { wet: args.wetMask, protect: args.protectMask },
    depth: args.depth,
  };
  return JSON.stringify(file);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Merge saved settings over defaults so older/partial files still load. */
function mergeSettings(saved: unknown): Settings {
  const out = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as Settings;
  if (!isObject(saved)) return out;
  for (const key of Object.keys(out) as (keyof Settings)[]) {
    const sv = saved[key];
    const dv = out[key];
    if (isObject(dv) && isObject(sv)) {
      const target = dv as unknown as Record<string, unknown>;
      for (const k of Object.keys(target)) {
        if (k in sv && typeof sv[k] === typeof target[k]) target[k] = sv[k];
      }
    } else if (typeof sv === typeof dv && sv !== undefined) {
      (out as unknown as Record<string, unknown>)[key] = sv;
    }
  }
  return out;
}

export function parseProject(text: string): ProjectFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("The project file is not valid JSON.");
  }
  // "rain-atelier" is the app id written by earlier builds; those files load unchanged.
  if (!isObject(raw) || (raw.app !== "amefurashi" && raw.app !== "rain-atelier")) throw new Error("This file is not an Amefurashi project.");
  const version = Number(raw.version);
  if (!Number.isFinite(version) || version > PROJECT_VERSION) {
    throw new Error(`Project version ${String(raw.version)} is newer than this build supports (v${PROJECT_VERSION}).`);
  }
  const image = isObject(raw.image) ? raw.image : {};
  const masks = isObject(raw.masks) ? raw.masks : {};
  return {
    app: "amefurashi",
    version,
    savedAt: typeof raw.savedAt === "string" ? raw.savedAt : "",
    settings: mergeSettings(raw.settings),
    time: typeof raw.time === "number" && Number.isFinite(raw.time) ? raw.time : 0,
    image: {
      name: typeof image.name === "string" ? image.name : "unknown",
      width: Number(image.width) || 0,
      height: Number(image.height) || 0,
      size: Number(image.size) || 0,
      type: typeof image.type === "string" ? image.type : "",
      embedded: typeof image.embedded === "string" ? image.embedded : null,
    },
    masks: {
      wet: typeof masks.wet === "string" ? masks.wet : null,
      protect: typeof masks.protect === "string" ? masks.protect : null,
    },
    depth: typeof raw.depth === "string" ? raw.depth : null,
  };
}
