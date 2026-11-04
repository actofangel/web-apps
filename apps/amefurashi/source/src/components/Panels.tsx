import { useRef } from "react";
import { DEFAULT_SETTINGS, type PreviewQuality } from "../state/settings";
import { Button, ColorField, Note, Row, Section, Select, Slider, Toggle } from "./controls";
import { SectionSliders, shutterFormat, type PanelContext, type SliderDef } from "./panelContext";
import { formatBytes } from "../utils/image";

// --------------------------------------------------------------------------- Image

export function ImagePanel({ ctx }: { ctx: PanelContext }) {
  const img = ctx.image;
  return (
    <Section title="Image" defaultOpen>
      {img ? (
        <div className="text-[11px] text-zinc-400 space-y-0.5">
          <div className="truncate text-zinc-300" title={img.name}>{img.name}</div>
          <div>
            {img.width} × {img.height} px · {formatBytes(img.size)}
          </div>
          {img.downscaled && (
            <Note tone="warn">
              This GPU limits textures to {ctx.maxTextureSize} px per side. Rendering and export use a {img.texW} × {img.texH} version.
            </Note>
          )}
          <div>
            Preview render: {ctx.compSize.w} × {ctx.compSize.h} px
            {ctx.fps > 0 ? ` · ~${Math.round(ctx.fps)} fps` : ""}
          </div>
        </div>
      ) : (
        <Note>No image loaded.</Note>
      )}
      <Row className="pt-1">
        <Button onClick={ctx.onReplaceImage} title="Load a different image (JPEG, PNG, WebP). Effect settings are kept; masks and depth guides are image-specific and will be cleared.">
          Replace Image
        </Button>
        <Button onClick={ctx.onResetEffects} variant="danger" title="Reset every effect setting to its default. Masks and depth guides are kept.">
          Reset All Effects
        </Button>
      </Row>
      <Row>
        <Button onClick={ctx.onFit} title="Fit the image to the window">Fit to Window</Button>
        <Button onClick={ctx.onActualSize} title="Show the image at 100% (one image pixel per CSS pixel)">100% View</Button>
      </Row>
      <Select<PreviewQuality>
        label="Preview Quality"
        value={ctx.settings.quality}
        onChange={ctx.setQuality}
        tip="Preview render resolution cap (long edge): Low 1280, Balanced 1920, High 2880. Never affects export size or effect settings."
        options={[
          { value: "low", label: "Low (fast)" },
          { value: "balanced", label: "Balanced" },
          { value: "high", label: "High" },
        ]}
      />
      <Note>Zoom with the mouse wheel, drag to pan. Zoom and pan never change the exported composition.</Note>
    </Section>
  );
}

// --------------------------------------------------------------------------- Rain

const RAIN_DEFS: SliderDef<"rain">[] = [
  { key: "amount", label: "Rain Amount", min: 0, max: 2, step: 0.01, tip: "Relative density of the rain volume (scales the particle count). Artistic value — not calibrated to mm/h." },
  { key: "dropSize", label: "Drop Size", min: 0.3, max: 5, step: 0.05, unit: "mm", tip: "Mean drop diameter. Sets terminal velocity (Atlas et al. 1973) and projected streak width." },
  { key: "sizeVariation", label: "Size Variation", min: 0, max: 1, step: 0.01, tip: "0 = all drops the same size, 1 = exponential (Marshall–Palmer-shaped) spread around the mean." },
  { key: "fallSpeed", label: "Fall Speed ×", min: 0.3, max: 2, step: 0.01, tip: "Multiplier on physical terminal velocity (1.0 = physical)." },
  { key: "windDirection", label: "Wind Direction", min: 0, max: 360, step: 1, unit: "°", tip: "0° blows to the right, 90° away from the camera, 180° left, 270° toward the camera." },
  { key: "windStrength", label: "Wind Strength", min: 0, max: 12, step: 0.1, unit: "m/s", tip: "Horizontal wind speed. Slants streaks according to projected velocity." },
  { key: "gusts", label: "Gusts", min: 0, max: 1, step: 0.01, tip: "Slow, deterministic variation of wind strength over time." },
  { key: "turbulence", label: "Turbulence", min: 0, max: 1, step: 0.01, tip: "Per-drop lateral wobble; breaks up synchronized motion." },
  { key: "nearBalance", label: "Near Rain", min: 0, max: 2, step: 0.01, tip: "Weight of the near band (0.25–1.5 m): large, defocused streaks." },
  { key: "midBalance", label: "Mid Rain", min: 0, max: 2, step: 0.01, tip: "Weight of the mid band (1.5–6 m)." },
  { key: "farBalance", label: "Far Rain", min: 0, max: 2, step: 0.01, tip: "Weight of the far band (6–22 m): fine, faint streaks that fade into haze." },
  { key: "visibility", label: "Rain Visibility", min: 0, max: 3, step: 0.01, tip: "Artistic gain on streak opacity, applied after the exposure-based physical estimate." },
  { key: "shutterTime", label: "Shutter Time", min: 0.001, max: 0.0667, step: 0.0005, unit: "s", tip: "Exposure time. Streak length = projected velocity × shutter; longer exposures also make streaks fainter.", format: shutterFormat },
  { key: "lengthMultiplier", label: "Streak Length ×", min: 0.25, max: 3, step: 0.01, tip: "Artistic multiplier on streak length, separate from the physical shutter derivation." },
  { key: "focusDistance", label: "Focus Distance", min: 0.3, max: 30, step: 0.1, unit: "m", tip: "Focus plane of the virtual camera. Drops away from it are defocused." },
  { key: "depthOfField", label: "Depth of Field", min: 0, max: 3, step: 0.01, tip: "Defocus strength (0 = pinhole). Near drops become soft, dim streaks." },
  { key: "occlusion", label: "Background Occlusion", min: 0, max: 1, step: 0.01, tip: "How much a streak replaces the background (1 = physical blend) versus adding light (0 = additive glow)." },
];

export function RainPanel({ ctx }: { ctx: PanelContext }) {
  const r = ctx.settings.rain;
  return (
    <Section title="Rain" enabled={r.enabled} onEnabledChange={(v) => ctx.update("rain", { enabled: v })} defaultOpen>
      <SectionSliders section="rain" defs={RAIN_DEFS} ctx={ctx} disabled={!r.enabled} />
      <div className="flex items-center justify-between gap-2 pt-1" title="Seed of the deterministic rain field. The same seed and time always produce the same frame.">
        <span className="text-[12px] text-zinc-300">Random Seed</span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            className="num-input w-20"
            value={r.seed}
            min={0}
            step={1}
            onChange={(e) => ctx.update("rain", { seed: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
            aria-label="Random seed"
          />
          <Button onClick={ctx.onNewSeed} title="Pick a new random seed">New</Button>
        </div>
      </div>
      <Note>Physical: drop size, terminal velocity, wind and shutter. Artistic: amount, visibility, balance, DOF strength.</Note>
    </Section>
  );
}

// --------------------------------------------------------------------------- Atmosphere

const ATMO_A: SliderDef<"atmosphere">[] = [
  { key: "mistDensity", label: "Mist Density", min: 0, max: 1.5, step: 0.01, tip: "Overall mist amount. Attenuates with the depth guide (depth map or the approximate gradient)." },
];
const ATMO_B: SliderDef<"atmosphere">[] = [
  { key: "nearHaze", label: "Near Haze", min: 0, max: 1, step: 0.01, tip: "Mist strength at the nearest depth." },
  { key: "farHaze", label: "Far Haze", min: 0, max: 1, step: 0.01, tip: "Mist strength at the farthest depth." },
  { key: "softness", label: "Atmospheric Softness", min: 0, max: 1, step: 0.01, tip: "Blurs fine detail where mist is dense, preserving structure at moderate settings." },
  { key: "drift", label: "Mist Drift", min: 0, max: 1, step: 0.01, tip: "Slow, subtle spatial variation of the mist that drifts over time." },
  { key: "overcast", label: "Overcast Amount", min: 0, max: 1, step: 0.01, tip: "Flat, cool overcast tone treatment (highlight compression, desaturation, shadow lift). Does not render clouds." },
  { key: "exposure", label: "Exposure", min: -3, max: 3, step: 0.05, unit: "EV", tip: "Exposure offset in stops, applied to the whole composition." },
  { key: "contrast", label: "Contrast", min: 0.5, max: 1.5, step: 0.01, tip: "Contrast around middle grey." },
  { key: "temperature", label: "Color Temperature", min: -1, max: 1, step: 0.01, tip: "Cool (−) to warm (+) white balance shift. A grade, not a reconstruction of the original lighting." },
  { key: "saturation", label: "Saturation", min: 0, max: 2, step: 0.01, tip: "Color saturation." },
];

export function AtmospherePanel({ ctx }: { ctx: PanelContext }) {
  const a = ctx.settings.atmosphere;
  return (
    <Section title="Atmosphere" enabled={a.enabled} onEnabledChange={(v) => ctx.update("atmosphere", { enabled: v })}>
      <SectionSliders section="atmosphere" defs={ATMO_A} ctx={ctx} disabled={!a.enabled} />
      <ColorField label="Mist Color" value={a.mistColor} defaultValue={DEFAULT_SETTINGS.atmosphere.mistColor} onChange={(v) => ctx.update("atmosphere", { mistColor: v })} tip="Color of the mist, lit by ambient and key light." />
      <SectionSliders section="atmosphere" defs={ATMO_B} ctx={ctx} disabled={!a.enabled} />
      <Note>Without a depth map the mist uses an approximate vertical depth gradient (Camera → Depth Guide). Exposure, contrast, temperature and saturation always apply.</Note>
    </Section>
  );
}

// --------------------------------------------------------------------------- Glass

const GLASS_DEFS: SliderDef<"glass">[] = [
  { key: "coverage", label: "Droplet Coverage", min: 0, max: 1, step: 0.01, tip: "Fraction of the glass covered by droplets." },
  { key: "dropletSize", label: "Droplet Size", min: 0.5, max: 6, step: 0.05, unit: "%", tip: "Droplet radius as a percentage of image height." },
  { key: "sizeVariation", label: "Size Variation", min: 0, max: 1, step: 0.01, tip: "Random spread of droplet sizes." },
  { key: "refraction", label: "Refraction Strength", min: 0, max: 1.5, step: 0.01, tip: "How strongly droplets bend the scene behind them (inverted lens look)." },
  { key: "highlight", label: "Highlight Strength", min: 0, max: 1.5, step: 0.01, tip: "Specular highlight from the key light direction." },
  { key: "edgeSoftness", label: "Edge Softness", min: 0, max: 1, step: 0.01, tip: "Softness of the droplet outline." },
  { key: "slideSpeed", label: "Sliding Speed", min: 0, max: 1.5, step: 0.01, tip: "Speed of large droplets running down the glass (0 = none)." },
  { key: "trailAmount", label: "Trail Amount", min: 0, max: 1, step: 0.01, tip: "Small droplets left behind by sliding drops; they shrink away over time." },
  { key: "coalescence", label: "Coalescence", min: 0, max: 1, step: 0.01, tip: "Neighbouring droplets bridge and merge; sliding drops absorb droplets in their path and grow." },
  { key: "fog", label: "Glass Fog", min: 0, max: 1, step: 0.01, tip: "Slight blur of the scene between droplets (a damp pane)." },
];

export function GlassPanel({ ctx }: { ctx: PanelContext }) {
  const g = ctx.settings.glass;
  return (
    <Section title="Glass" enabled={g.enabled} onEnabledChange={(v) => ctx.update("glass", { enabled: v })} badge={g.enabled ? "" : "off"}>
      <SectionSliders section="glass" defs={GLASS_DEFS} ctx={ctx} disabled={!g.enabled} />
      <Note>Rain on Glass refracts the composed scene (image, rain, mist, bloom). It is independent from the falling rain.</Note>
    </Section>
  );
}

// --------------------------------------------------------------------------- shared: file button

export function FileButton({ label, accept, onFile, title }: { label: string; accept: string; onFile: (f: File) => void; title?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button onClick={() => ref.current?.click()} title={title}>{label}</Button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </>
  );
}

export { Slider, Toggle };
