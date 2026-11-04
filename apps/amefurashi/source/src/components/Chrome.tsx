import { useRef } from "react";
import { PRESETS } from "../state/presets";
import { Button } from "./controls";
import type { CompareMode } from "./Viewport";
import { cn } from "../utils/cn";

export function Toolbar(p: {
  hasImage: boolean;
  zoom: number;
  onOpen: () => void;
  onFit: () => void;
  onActualSize: () => void;
  presetId: string;
  onPreset: (id: string) => void;
  compareMode: CompareMode;
  setCompareMode: (m: CompareMode) => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
  onCleanPreview: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}) {
  return (
    <div className="h-11 shrink-0 flex items-center gap-2 px-3 border-b border-zinc-800 bg-zinc-950/95 text-zinc-200">
      <div className="flex items-center gap-2 mr-2">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-gradient-to-br from-sky-300 to-sky-600" />
        <span className="font-semibold tracking-wide text-[13px]">Amefurashi</span>
      </div>
      <Button onClick={p.onOpen} title="Open an image (JPEG, PNG, WebP)">{p.hasImage ? "Replace Image" : "Open Image"}</Button>
      <select
        className="select-input max-w-[170px]"
        aria-label="Preset"
        value={p.presetId}
        onChange={(e) => p.onPreset(e.target.value)}
        disabled={!p.hasImage}
        title="Weather presets change rain, atmosphere, glass and lighting — never your masks or depth guide"
      >
        <option value="">Preset…</option>
        {PRESETS.map((pr) => (
          <option key={pr.id} value={pr.id} title={pr.description}>
            {pr.name}
          </option>
        ))}
      </select>
      <div className="hidden sm:flex items-center gap-1 ml-1">
        <Button onClick={p.onFit} disabled={!p.hasImage} title="Fit to window (F)">Fit</Button>
        <Button onClick={p.onActualSize} disabled={!p.hasImage} title="100% view (1)">100%</Button>
        <span className="text-[11px] text-zinc-500 tabular-nums w-12 text-right">{Math.round(p.zoom * 100)}%</span>
      </div>
      <div className="hidden md:flex items-center gap-1 ml-1">
        <Button active={p.compareMode === "split"} disabled={!p.hasImage} onClick={() => p.setCompareMode(p.compareMode === "split" ? "off" : "split")} title="Before/after split wipe">Compare</Button>
        <button
          type="button"
          className="btn"
          disabled={!p.hasImage}
          title="Press and hold to see the original image (or hold B)"
          onPointerDown={p.onHoldStart}
          onPointerUp={p.onHoldEnd}
          onPointerLeave={p.onHoldEnd}
        >
          Hold Original
        </button>
      </div>
      <div className="flex-1" />
      <Button onClick={p.onCleanPreview} disabled={!p.hasImage} title="Distraction-free preview (Tab). Esc to exit.">Clean Preview</Button>
      <Button onClick={p.onToggleSidebar} className="lg:hidden" active={p.sidebarOpen} title="Show or hide the editing panels">Controls</Button>
    </div>
  );
}

export function PlaybackBar(p: {
  playing: boolean;
  time: number;
  onTogglePlay: () => void;
  onSetTime: (t: number) => void;
  onStep: (dir: 1 | -1) => void;
  onNewSeed: () => void;
  onCapture: () => void;
  exporting: boolean;
  hasImage: boolean;
  exportDims: { w: number; h: number };
}) {
  const max = Math.max(60, Math.ceil(p.time / 30) * 30);
  return (
    <div className="h-12 shrink-0 flex items-center gap-2 px-3 border-t border-zinc-800 bg-zinc-950/95 text-zinc-200">
      <Button onClick={p.onTogglePlay} disabled={!p.hasImage} title="Play / Pause (Space). Pausing freezes every animated layer." className="w-16 justify-center">
        {p.playing ? "❚❚ Pause" : "▶ Play"}
      </Button>
      <Button onClick={() => p.onStep(-1)} disabled={!p.hasImage} title="Step back one frame (1/60 s) — ,">◀</Button>
      <Button onClick={() => p.onStep(1)} disabled={!p.hasImage} title="Step forward one frame (1/60 s) — .">▶</Button>
      <span className="text-[11px] font-mono text-zinc-400 w-[72px] text-right tabular-nums">{p.time.toFixed(3)} s</span>
      <input
        type="range"
        className="range-input flex-1 min-w-[80px]"
        min={0}
        max={max}
        step={1 / 60}
        value={Math.min(p.time, max)}
        onChange={(e) => p.onSetTime(parseFloat(e.target.value))}
        disabled={!p.hasImage}
        title="Timeline. Every layer is a deterministic function of time and seed, so any moment can be revisited exactly."
      />
      <input
        type="number"
        className="num-input w-[74px] hidden sm:block"
        min={0}
        step={0.01}
        value={Number(p.time.toFixed(3))}
        onChange={(e) => p.onSetTime(Math.max(0, parseFloat(e.target.value) || 0))}
        disabled={!p.hasImage}
        aria-label="Time in seconds"
      />
      <Button onClick={p.onNewSeed} disabled={!p.hasImage} title="New random seed (N)">New Seed</Button>
      <Button variant="primary" onClick={p.onCapture} disabled={!p.hasImage || p.exporting} title={`Export the current frame as a ${p.exportDims.w}×${p.exportDims.h} PNG`}>
        {p.exporting ? "Rendering…" : "Capture Frame"}
      </Button>
    </div>
  );
}

export function UploadScreen(p: { onFiles: (files: FileList) => void; onDemo: () => void; error: string | null; busy: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none">
      <div className="pointer-events-auto max-w-md w-full rounded-xl border border-zinc-800 bg-zinc-900/90 backdrop-blur p-6 text-center shadow-2xl">
        <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-gradient-to-br from-sky-400/30 to-sky-700/30 border border-sky-500/40 flex items-center justify-center text-sky-200 text-xl">☂</div>
        <h1 className="text-lg font-semibold text-zinc-100">Amefurashi</h1>
        <p className="mt-1 text-[13px] text-zinc-400">Turn a photograph into a convincing rainy scene and export high-resolution stills.</p>
        <div className="mt-5 rounded-lg border border-dashed border-zinc-700 p-6 text-[13px] text-zinc-300">
          Drag & drop an image here
          <div className="mt-1 text-[11px] text-zinc-500">JPEG · PNG · WebP — processed locally in your browser, nothing is uploaded.</div>
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button variant="primary" onClick={() => ref.current?.click()} disabled={p.busy}>{p.busy ? "Loading…" : "Choose Image"}</Button>
            <Button onClick={p.onDemo} disabled={p.busy} title="Load a bundled sample photo to explore the tool">Try Demo Image</Button>
          </div>
          <input
            ref={ref}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) p.onFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
        {p.error && <p className="mt-3 text-[12px] text-red-300">{p.error}</p>}
        <p className="mt-4 text-[11px] text-zinc-500">Upload → choose a preset → refine → pause at a beautiful moment → Capture Frame.</p>
      </div>
    </div>
  );
}

export function Toasts({ items, onDismiss }: { items: { id: number; text: string; tone: "error" | "info" }[]; onDismiss: (id: number) => void }) {
  return (
    <div className="absolute bottom-3 left-3 z-30 flex flex-col gap-2 max-w-sm">
      {items.map((t) => (
        <div key={t.id} className={cn("rounded-md border px-3 py-2 text-[12px] shadow-lg flex gap-2 items-start", t.tone === "error" ? "bg-red-950/90 border-red-800 text-red-100" : "bg-zinc-900/95 border-zinc-700 text-zinc-100")}>
          <span className="flex-1">{t.text}</span>
          <button className="text-zinc-400 hover:text-white" onClick={() => onDismiss(t.id)} aria-label="Dismiss">×</button>
        </div>
      ))}
    </div>
  );
}
