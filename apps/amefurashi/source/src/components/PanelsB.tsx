import { useEffect, useState } from "react";
import { DEFAULT_SETTINGS, type ExportMode } from "../state/settings";
import { Button, ColorField, Note, Row, Section, Select, Slider, Toggle } from "./controls";
import { SectionSliders, type MaskTarget, type PanelContext, type SliderDef } from "./panelContext";
import { FileButton } from "./Panels";

// --------------------------------------------------------------------------- Mask editor (shared)

export function MaskEditor({ ctx, target, hint }: { ctx: PanelContext; target: Exclude<MaskTarget, "none">; hint: string }) {
  const t = ctx.maskTool;
  const active = t.target === target;
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-2 space-y-1.5">
      <Row>
        <Button variant={active ? "primary" : "default"} onClick={() => ctx.setMaskTool({ target: active ? "none" : target, overlay: true })} title={active ? "Stop painting and return to pan/zoom" : "Paint this mask on the image"}>
          {active ? "Done Painting" : "Edit Mask"}
        </Button>
        <Button active={active && t.mode === "paint"} disabled={!active} onClick={() => ctx.setMaskTool({ mode: "paint" })} title="Paint (add to the mask)">Paint</Button>
        <Button active={active && t.mode === "erase"} disabled={!active} onClick={() => ctx.setMaskTool({ mode: "erase" })} title="Erase (remove from the mask)">Erase</Button>
      </Row>
      <Slider label="Brush Size" value={t.size} min={4} max={400} step={1} unit="px" onChange={(v) => ctx.setMaskTool({ size: v })} tip="Brush diameter in screen pixels ([ and ] keys)." defaultValue={80} />
      <Slider label="Feathering" value={t.softness} min={0} max={1} step={0.01} onChange={(v) => ctx.setMaskTool({ softness: v })} tip="Brush edge softness." defaultValue={0.6} />
      <Row>
        <Toggle label="Overlay Preview" checked={t.overlay && (active || t.target === "none")} onChange={(v) => ctx.setMaskTool({ overlay: v, target: v ? target : t.target })} tip="Show the mask as a colored overlay (preview only, never exported)." />
      </Row>
      <Row>
        <Button disabled={!ctx.maskCanUndo(target)} onClick={() => ctx.maskUndo(target)} title="Undo last stroke (Ctrl/Cmd+Z while painting)">Undo</Button>
        <Button disabled={!ctx.maskCanRedo(target)} onClick={() => ctx.maskRedo(target)} title="Redo (Ctrl/Cmd+Shift+Z)">Redo</Button>
        <Button variant="danger" disabled={!ctx.maskHasPaint(target)} onClick={() => ctx.maskClear(target)} title="Clear the whole mask">Clear Mask</Button>
      </Row>
      <Note>{hint}</Note>
    </div>
  );
}

// --------------------------------------------------------------------------- Wet Surfaces

const WET_DEFS: SliderDef<"wet">[] = [
  { key: "wetness", label: "Wetness", min: 0, max: 1, step: 0.01, tip: "Darkens and saturates the surface like a water film; scales reflections and highlights." },
  { key: "reflection", label: "Reflection Strength", min: 0, max: 1, step: 0.01, tip: "Strength of the screen-space reflection (mirrored about the horizon guide). An artistic approximation, not a physical reconstruction." },
  { key: "roughness", label: "Roughness", min: 0, max: 1, step: 0.01, tip: "Rough water/asphalt: broader highlights, streakier and dimmer reflections." },
  { key: "reflectionBlur", label: "Reflection Blur", min: 0, max: 1, step: 0.01, tip: "Extra blur of the reflected image." },
  { key: "rippleAmount", label: "Ripple Amount", min: 0, max: 1, step: 0.01, tip: "Density and strength of expanding rain rings distorting the reflection." },
  { key: "rippleScale", label: "Ripple Scale", min: 0.2, max: 3, step: 0.01, tip: "Size of the ripple rings on the ground plane." },
  { key: "splashAmount", label: "Splash Amount", min: 0, max: 1.5, step: 0.01, tip: "Splash crowns on the wet surface. Frequency also scales with Rain Amount." },
  { key: "highlight", label: "Highlight Intensity", min: 0, max: 2, step: 0.01, tip: "Key-light glare on the water film." },
  { key: "maskFeather", label: "Mask Feather", min: 0, max: 1, step: 0.01, tip: "Softens the mask edge when it is applied." },
];
const GROUND_DEFS: SliderDef<"wet">[] = [
  { key: "horizonY", label: "Horizon Height", min: 0, max: 1, step: 0.005, tip: "Ground-plane guide: horizon line height (0 = bottom, 1 = top). Orients ripples and mirrors reflections. Drag the line in the preview." },
  { key: "tilt", label: "Ground Tilt", min: -30, max: 30, step: 0.5, unit: "°", tip: "Rotation of the horizon guide." },
];

export function WetPanel({ ctx }: { ctx: PanelContext }) {
  const w = ctx.settings.wet;
  return (
    <Section
      title="Wet Surfaces"
      enabled={w.enabled}
      onEnabledChange={(v) => {
        ctx.update("wet", { enabled: v });
        if (v) ctx.setShowHorizonGuide(true);
      }}
      badge={w.enabled ? "" : "off"}
    >
      <MaskEditor ctx={ctx} target="wet" hint="Paint the surfaces that should look wet (streets, pavements, tables). Effects stay inside the mask." />
      {w.enabled && !ctx.maskHasPaint("wet") && <Note tone="warn">The wet mask is empty — paint an area to see the effect.</Note>}
      <Toggle label="Show Ground Guide" checked={ctx.showHorizonGuide} onChange={ctx.setShowHorizonGuide} tip="Show the draggable horizon line (preview only)." />
      <SectionSliders section="wet" defs={GROUND_DEFS} ctx={ctx} />
      <SectionSliders section="wet" defs={WET_DEFS} ctx={ctx} disabled={!w.enabled} />
      <Note>Reflections are derived from the photo itself and mirrored about the horizon guide — a screen-space approximation. Splashes only appear inside the mask.</Note>
    </Section>
  );
}

// --------------------------------------------------------------------------- Lighting

const LIGHT_A: SliderDef<"lighting">[] = [
  { key: "ambient", label: "Ambient Light", min: 0, max: 2, step: 0.01, tip: "Diffuse environment light on drops and mist (uses the photo's average brightness)." },
  { key: "keyX", label: "Key Light X", min: 0, max: 1, step: 0.005, tip: "Horizontal position of the key light guide (0 = left)." },
  { key: "keyY", label: "Key Light Y", min: 0, max: 1, step: 0.005, tip: "Vertical position of the key light guide (0 = bottom)." },
  { key: "keyDepth", label: "Key Light Depth", min: -1, max: 1, step: 0.01, tip: "−1 = light behind the camera (front light), +1 = light behind the scene (back light)." },
];
const LIGHT_B: SliderDef<"lighting">[] = [
  { key: "keyIntensity", label: "Key Light Intensity", min: 0, max: 5, step: 0.01, tip: "Strength of the key light on rain, splashes, mist glow and wet highlights." },
  { key: "backlight", label: "Backlight Strength", min: 0, max: 1.5, step: 0.01, tip: "Boosts the forward-scattering lobe: drops between you and the light glow brighter." },
  { key: "highlightThreshold", label: "Highlight Threshold", min: 0.2, max: 1.5, step: 0.01, tip: "Linear brightness above which pixels contribute to bloom." },
  { key: "bloom", label: "Bloom Amount", min: 0, max: 1, step: 0.01, tip: "Soft glow around sufficiently bright highlights." },
];

export function LightingPanel({ ctx }: { ctx: PanelContext }) {
  const l = ctx.settings.lighting;
  return (
    <Section title="Lighting" onOpenChange={(o) => ctx.setShowLightGuide(o)}>
      <Toggle label="Show Light Guide" checked={ctx.showLightGuide} onChange={ctx.setShowLightGuide} tip="Draggable key-light marker in the preview (never exported)." />
      <SectionSliders section="lighting" defs={LIGHT_A} ctx={ctx} />
      <ColorField label="Key Light Color" value={l.keyColor} defaultValue={DEFAULT_SETTINGS.lighting.keyColor} onChange={(v) => ctx.update("lighting", { keyColor: v })} tip="Color of the key light." />
      <SectionSliders section="lighting" defs={LIGHT_B} ctx={ctx} />
      <Note>Drag the light marker onto the brightest light source in the photo. Streak brightness follows a forward-peaked phase function of the angle between each drop's view ray and the light — a practical approximation.</Note>
    </Section>
  );
}

// --------------------------------------------------------------------------- Camera / depth

const CAM_A: SliderDef<"camera">[] = [
  { key: "fov", label: "Vertical Field of View", min: 20, max: 110, step: 0.5, unit: "°", tip: "Virtual camera used to project the rain volume. Match the photo's lens roughly (24 mm ≈ 73°, 50 mm ≈ 27° full-frame vertical)." },
];
const CAM_B: SliderDef<"camera">[] = [
  { key: "depthNear", label: "Depth Range Near", min: 0.1, max: 5, step: 0.05, unit: "m", tip: "Scene depth mapped to the nearest depth value." },
  { key: "depthFar", label: "Depth Range Far", min: 5, max: 200, step: 0.5, unit: "m", tip: "Scene depth mapped to the farthest depth value." },
  { key: "gradientHorizon", label: "Gradient Horizon", min: 0.02, max: 1, step: 0.005, tip: "Approximate depth gradient (used when no depth map is loaded): near at the bottom, far at this height and above." },
];
const CAM_C: SliderDef<"camera">[] = [
  { key: "foregroundRainVisibility", label: "Rain over Protected Areas", min: 0, max: 1, step: 0.01, tip: "How much rain remains visible over the protection mask." },
  { key: "protectNearDistance", label: "Keep Near Rain Within", min: 0.3, max: 5, step: 0.1, unit: "m", tip: "Rain closer than this stays fully visible in front of protected subjects." },
];

export function CameraPanel({ ctx }: { ctx: PanelContext }) {
  const c = ctx.settings.camera;
  return (
    <Section title="Camera">
      <SectionSliders section="camera" defs={CAM_A} ctx={ctx} />
      <div className="text-[11px] font-medium text-zinc-400 pt-1">Depth Guide</div>
      <Row>
        <FileButton label={ctx.hasDepth ? "Replace Depth Map" : "Import Depth Map"} accept="image/png,image/jpeg,image/webp" onFile={ctx.onImportDepth} title="Grayscale depth image matching this photo. White = near by default (toggle Invert if your map uses white = far)." />
        {ctx.hasDepth && <Button variant="danger" onClick={ctx.onClearDepth}>Remove</Button>}
      </Row>
      <Toggle label="Invert Depth" checked={c.depthInvert} onChange={(v) => ctx.update("camera", { depthInvert: v })} tip="Flip the depth map convention." />
      <Toggle label="Show Depth Guide" checked={ctx.depthOverlay} onChange={ctx.setDepthOverlay} tip="Visualize the depth used for mist and occlusion (red = near, blue = far). Preview only." />
      <SectionSliders section="camera" defs={CAM_B} ctx={ctx} />
      <Note>
        {ctx.hasDepth
          ? "Rain behind the depth surface is occluded; mist attenuates with depth. Depth maps are user-provided — there is no automatic depth estimation."
          : "No depth map loaded: mist uses an explicitly approximate vertical gradient. Rain is not occluded by the gradient; use the protection mask for subjects."}
      </Note>
      <div className="text-[11px] font-medium text-zinc-400 pt-1">Subject Protection</div>
      <MaskEditor ctx={ctx} target="protect" hint="Paint people or foreground objects that rain should mostly fall behind. This is an artistic control, not scene geometry." />
      <SectionSliders section="camera" defs={CAM_C} ctx={ctx} />
    </Section>
  );
}

// --------------------------------------------------------------------------- Export

/** Integer field that commits on blur / Enter, so clearing the field while typing does not snap to 1. */
function DimInput({ value, max, label, onCommit }: { value: number; max: number; label: string; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Math.round(Number(text));
    if (Number.isFinite(n) && n >= 1) onCommit(n);
    else setText(String(value));
  };
  return (
    <input
      type="number"
      className="num-input w-20"
      value={text}
      min={1}
      max={max}
      onChange={(ev) => setText(ev.target.value)}
      onBlur={commit}
      onKeyDown={(ev) => {
        if (ev.key === "Enter") (ev.target as HTMLInputElement).blur();
      }}
      aria-label={label}
    />
  );
}

export function ExportPanel({ ctx }: { ctx: PanelContext }) {
  const e = ctx.settings.export;
  const img = ctx.image;
  const aspect = img ? img.width / img.height : 16 / 9;
  const setW = (w: number) => {
    w = Math.max(1, Math.round(w));
    ctx.update("export", e.lockAspect ? { width: w, height: Math.max(1, Math.round(w / aspect)) } : { width: w });
  };
  const setH = (h: number) => {
    h = Math.max(1, Math.round(h));
    ctx.update("export", e.lockAspect ? { height: h, width: Math.max(1, Math.round(h * aspect)) } : { height: h });
  };
  return (
    <Section title="Export" defaultOpen>
      <Select<ExportMode>
        label="Output Size"
        value={e.mode}
        onChange={(m) =>
          // Entering Custom starts from the image's own size, so the aspect lock begins correct.
          ctx.update("export", m === "custom" && img && e.mode !== "custom" ? { mode: m, width: img.texW, height: img.texH } : { mode: m })
        }
        options={[
          { value: "preview", label: `Preview size (${ctx.compSize.w}×${ctx.compSize.h})` },
          { value: "original", label: img ? `Original image size (${img.texW}×${img.texH})` : "Original image size" },
          { value: "custom", label: "Custom" },
        ]}
        tip="Export renders the frozen scene at this resolution through the same pipeline as the preview."
      />
      {e.mode === "custom" && (
        <>
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] text-zinc-400">W</label>
            <DimInput value={e.width} max={ctx.maxTextureSize} onCommit={setW} label="Export width" />
            <label className="text-[11px] text-zinc-400">H</label>
            <DimInput value={e.height} max={ctx.maxTextureSize} onCommit={setH} label="Export height" />
          </div>
          <Toggle label="Lock Aspect Ratio" checked={e.lockAspect} onChange={(v) => ctx.update("export", { lockAspect: v, height: v ? Math.max(1, Math.round(e.width / aspect)) : e.height })} tip="Keep the image aspect. If unlocked and the aspect differs, the image is letterboxed — never cropped or stretched." />
        </>
      )}
      <div className="text-[11px] text-zinc-300">
        Output: <span className="font-mono">{ctx.exportDims.w} × {ctx.exportDims.h}</span> px PNG
      </div>
      {ctx.exportDims.note && <Note tone="warn">{ctx.exportDims.note}</Note>}
      <Button variant="primary" onClick={ctx.onExport} disabled={!img || ctx.exporting} className="w-full justify-center" title="Render the current (paused) frame at the output size and download a PNG">
        {ctx.exporting ? "Rendering…" : "Capture Current Frame (PNG)"}
      </Button>
      <Note>Limits: {ctx.maxTextureSize} px per side on this GPU, 60 MP total. Larger requests are refused with a message instead of producing a blank file.</Note>
      <div className="text-[11px] font-medium text-zinc-400 pt-2">Video</div>
      <Button
        variant={ctx.recording ? "danger" : "default"}
        onClick={ctx.onToggleVideoRecording}
        disabled={!img || !ctx.videoSupported}
        className="w-full justify-center"
        title="Record the animated composition at 30 fps and download a WebM video"
      >
        {ctx.recording ? `■ Stop & Save Video (${ctx.recordingSeconds.toFixed(1)} s)` : "● Record Video (WebM)"}
      </Button>
      <Note>
        Records the clean composition at 30 fps with no audio, at the preview render size ({ctx.compSize.w}×{ctx.compSize.h}; set by Preview Quality). Zoom, pan, guides and mask overlays are not recorded. Preview Quality changes wait until recording stops.
      </Note>
      {!ctx.videoSupported && <Note tone="warn">This browser does not support canvas video recording. Try a current Chrome, Edge, or Firefox release.</Note>}
      <div className="text-[11px] font-medium text-zinc-400 pt-2">Project</div>
      <Toggle label="Embed Source Image" checked={e.embedImageInProject} onChange={(v) => ctx.update("export", { embedImageInProject: v })} tip="Store the image inside the project file (larger file, but self-contained). Otherwise you will be asked for the matching image on load." />
      <Row>
        <Button onClick={ctx.onSaveProject} disabled={!img} title="Save settings, seed, frozen time, masks and depth guide as JSON">Save Project</Button>
        <FileButton label="Load Project" accept="application/json,.json" onFile={ctx.onLoadProject} title="Load an Amefurashi project file (older Rain Atelier projects also load)" />
      </Row>
    </Section>
  );
}
