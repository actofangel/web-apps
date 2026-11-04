import { DEFAULT_SETTINGS, type PreviewQuality, type SectionKey, type Settings } from "../state/settings";
import { Slider } from "./controls";

export type MaskTarget = "none" | "wet" | "protect";

export interface MaskToolState {
  target: MaskTarget;
  mode: "paint" | "erase";
  /** Brush diameter in screen (CSS) pixels. */
  size: number;
  softness: number;
  overlay: boolean;
}

export interface ImageInfo {
  name: string;
  width: number;
  height: number;
  size: number;
  type: string;
  downscaled: boolean;
  texW: number;
  texH: number;
}

export interface PanelContext {
  settings: Settings;
  update: <K extends SectionKey>(section: K, patch: Partial<Settings[K]>) => void;
  setQuality: (q: PreviewQuality) => void;
  image: ImageInfo | null;
  compSize: { w: number; h: number };
  fps: number;
  onReplaceImage: () => void;
  onResetEffects: () => void;
  onFit: () => void;
  onActualSize: () => void;
  maskTool: MaskToolState;
  setMaskTool: (patch: Partial<MaskToolState>) => void;
  maskUndo: (t: MaskTarget) => void;
  maskRedo: (t: MaskTarget) => void;
  maskClear: (t: MaskTarget) => void;
  maskCanUndo: (t: MaskTarget) => boolean;
  maskCanRedo: (t: MaskTarget) => boolean;
  maskHasPaint: (t: MaskTarget) => boolean;
  hasDepth: boolean;
  onImportDepth: (file: File) => void;
  onClearDepth: () => void;
  depthOverlay: boolean;
  setDepthOverlay: (v: boolean) => void;
  showLightGuide: boolean;
  setShowLightGuide: (v: boolean) => void;
  showHorizonGuide: boolean;
  setShowHorizonGuide: (v: boolean) => void;
  onNewSeed: () => void;
  exporting: boolean;
  exportDims: { w: number; h: number; note: string | null };
  onExport: () => void;
  videoSupported: boolean;
  recording: boolean;
  recordingSeconds: number;
  onToggleVideoRecording: () => void;
  onSaveProject: () => void;
  onLoadProject: (file: File) => void;
  maxTextureSize: number;
}

export interface SliderDef<K extends SectionKey> {
  key: keyof Settings[K] & string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  tip: string;
  format?: (v: number) => string;
}

export function SectionSliders<K extends SectionKey>({ section, defs, ctx, disabled }: { section: K; defs: SliderDef<K>[]; ctx: PanelContext; disabled?: boolean }) {
  const values = ctx.settings[section] as unknown as Record<string, number>;
  const defaults = DEFAULT_SETTINGS[section] as unknown as Record<string, number>;
  return (
    <>
      {defs.map((d) => (
        <Slider
          key={d.key}
          label={d.label}
          value={values[d.key]}
          defaultValue={defaults[d.key]}
          min={d.min}
          max={d.max}
          step={d.step}
          unit={d.unit}
          tip={d.tip}
          format={d.format}
          disabled={disabled}
          onChange={(v) => ctx.update(section, { [d.key]: v } as unknown as Partial<Settings[K]>)}
        />
      ))}
    </>
  );
}

export const shutterFormat = (v: number) => `1/${Math.round(1 / Math.max(v, 1e-4))} s`;
