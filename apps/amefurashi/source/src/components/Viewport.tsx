import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { RainEngine } from "../engine/RainEngine";
import { computeViewRect, screenToUV, uvToScreen, zoomAround, type ViewRect, type ViewState } from "../engine/view";
import type { Settings, SectionKey } from "../state/settings";
import type { ImageInfo, MaskToolState } from "./panelContext";
import { cn } from "../utils/cn";

export type CompareMode = "off" | "split" | "hold";

interface Props {
  engine: RainEngine | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  image: ImageInfo | null;
  view: ViewState;
  setView: (v: ViewState) => void;
  settings: Settings;
  update: <K extends SectionKey>(section: K, patch: Partial<Settings[K]>) => void;
  maskTool: MaskToolState;
  compareMode: CompareMode;
  splitPos: number;
  setSplitPos: (v: number) => void;
  showLightGuide: boolean;
  showHorizonGuide: boolean;
  cleanPreview: boolean;
  onDropFiles: (files: FileList) => void;
  onMaskChanged: () => void;
  onSizeChange: (w: number, h: number) => void;
  children?: React.ReactNode;
}

type Drag =
  | { kind: "pan"; startX: number; startY: number; panX: number; panY: number }
  | { kind: "paint" }
  | { kind: "light" }
  | { kind: "horizon"; startY: number; startH: number }
  | { kind: "tilt" }
  | { kind: "split" };

export function Viewport(p: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const pRef = useRef(p);
  pRef.current = p;

  // Track viewport size.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(1, r.width), h: Math.max(1, r.height) });
      pRef.current.onSizeChange(r.width, r.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Wheel zoom (non-passive so we can prevent page scroll).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const cur = pRef.current;
      if (!cur.image) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
      cur.setView(zoomAround(cur.view, factor, e.clientX - r.left, e.clientY - r.top, r.width, r.height, cur.image.width, cur.image.height));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const rect: ViewRect | null = p.image ? computeViewRect(p.view, size.w, size.h, p.image.width, p.image.height) : null;

  const local = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const paintAt = useCallback(
    (x: number, y: number) => {
      const cur = pRef.current;
      const eng = cur.engine;
      if (!eng || !cur.image || !rect) return;
      const mask = cur.maskTool.target === "wet" ? eng.wetMask : cur.maskTool.target === "protect" ? eng.protectMask : null;
      if (!mask) return;
      const { u, v } = screenToUV(rect, x, y);
      const radiusMask = (cur.maskTool.size / 2) * (mask.width / rect.width);
      mask.paint(u, v, radiusMask, cur.maskTool.softness, cur.maskTool.mode === "erase");
      eng.invalidate();
    },
    [rect],
  );

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    // Only pan/paint when the press lands on the canvas or the container itself — never on overlay UI
    // (capturing the pointer there would swallow button clicks).
    const target = e.target as HTMLElement;
    if (target !== e.currentTarget && target !== p.canvasRef.current) return;
    const { x, y } = local(e);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (p.maskTool.target !== "none" && p.image && e.button === 0) {
      const eng = p.engine;
      const mask = p.maskTool.target === "wet" ? eng?.wetMask : eng?.protectMask;
      mask?.beginStroke();
      setDrag({ kind: "paint" });
      paintAt(x, y);
      return;
    }
    setDrag({ kind: "pan", startX: x, startY: y, panX: p.view.panX, panY: p.view.panY });
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const { x, y } = local(e);
    // The cursor position is only needed for the brush outline; avoid re-rendering on every move otherwise.
    if (p.maskTool.target !== "none") setCursor({ x, y });
    if (!drag) return;
    if (drag.kind === "pan") {
      p.setView({ ...p.view, panX: drag.panX + (x - drag.startX), panY: drag.panY + (y - drag.startY) });
    } else if (drag.kind === "paint") {
      paintAt(x, y);
    } else if (drag.kind === "light" && rect) {
      const { u, v } = screenToUV(rect, x, y);
      p.update("lighting", { keyX: clamp01(u), keyY: clamp01(v) });
    } else if (drag.kind === "horizon" && rect) {
      const dv = -(y - drag.startY) / rect.height;
      p.update("wet", { horizonY: clamp01(drag.startH + dv) });
    } else if (drag.kind === "tilt" && rect) {
      const c = uvToScreen(rect, 0.5, p.settings.wet.horizonY);
      const ang = (Math.atan2(-(y - c.y), x - c.x) * 180) / Math.PI;
      p.update("wet", { tilt: Math.max(-30, Math.min(30, Math.round(ang * 2) / 2)) });
    } else if (drag.kind === "split" && rect) {
      p.setSplitPos(clamp01(screenToUV(rect, x, y).u));
    }
  };

  const endDrag = () => {
    if (drag?.kind === "paint") {
      const eng = p.engine;
      const mask = p.maskTool.target === "wet" ? eng?.wetMask : eng?.protectMask;
      mask?.endStroke();
      p.onMaskChanged();
    }
    setDrag(null);
  };

  const startGuideDrag = (d: Drag | ((e: ReactPointerEvent) => Drag)) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (ref.current as HTMLElement).setPointerCapture(e.pointerId);
    setDrag(typeof d === "function" ? d(e) : d);
  };

  const light = rect ? uvToScreen(rect, p.settings.lighting.keyX, p.settings.lighting.keyY) : null;
  const horizon = rect ? uvToScreen(rect, 0.5, p.settings.wet.horizonY) : null;
  const tilt = p.settings.wet.tilt;
  const splitX = rect ? rect.left + p.splitPos * rect.width : 0;
  const painting = p.maskTool.target !== "none";
  const showGuides = !p.cleanPreview && p.image;

  return (
    <div
      ref={ref}
      className={cn("relative flex-1 min-w-0 min-h-0 overflow-hidden bg-[#0e0e10] select-none touch-none", painting ? "cursor-none" : drag?.kind === "pan" ? "cursor-grabbing" : "cursor-grab")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={() => setCursor(null)}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length) p.onDropFiles(e.dataTransfer.files);
      }}
    >
      <canvas ref={p.canvasRef} className="absolute inset-0 w-full h-full block" />

      {/* Guides (DOM overlays; never part of the rendered artwork) */}
      {showGuides && rect && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none" width={size.w} height={size.h}>
          {p.showHorizonGuide && horizon && (
            <g transform={`translate(${horizon.x} ${horizon.y}) rotate(${-tilt})`}>
              <line x1={-rect.width} x2={rect.width} y1={0} y2={0} stroke="rgba(56,189,248,0.85)" strokeWidth={1.5} strokeDasharray="8 6" />
              <rect x={-rect.width} y={-8} width={rect.width * 2} height={16} fill="transparent" className="pointer-events-auto cursor-ns-resize" onPointerDown={startGuideDrag((e) => ({ kind: "horizon", startY: local(e).y, startH: p.settings.wet.horizonY }))} />
              <circle cx={rect.width * 0.42} cy={0} r={7} fill="#0ea5e9" stroke="#fff" strokeWidth={1.5} className="pointer-events-auto cursor-ew-resize" onPointerDown={startGuideDrag({ kind: "tilt" })}>
                <title>Drag to tilt the ground plane</title>
              </circle>
              <text x={-rect.width * 0.45} y={-6} fill="rgba(186,230,253,0.9)" fontSize={11}>ground horizon</text>
            </g>
          )}
          {p.showLightGuide && light && (
            <g transform={`translate(${light.x} ${light.y})`} className="pointer-events-auto cursor-move" onPointerDown={startGuideDrag({ kind: "light" })}>
              <circle r={22} fill="rgba(253,224,71,0.08)" stroke="rgba(253,224,71,0.6)" strokeWidth={1} />
              <circle r={7} fill="#facc15" stroke="#fff" strokeWidth={1.5} />
              {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
                <line key={a} x1={0} y1={-11} x2={0} y2={-16} stroke="#facc15" strokeWidth={1.5} transform={`rotate(${a})`} />
              ))}
              <text x={26} y={4} fill="rgba(254,240,138,0.9)" fontSize={11}>key light</text>
              <title>Drag onto the main light source in the photo</title>
            </g>
          )}
        </svg>
      )}

      {/* Before/after split handle */}
      {p.compareMode === "split" && rect && !p.cleanPreview && (
        <div className="absolute top-0 bottom-0 w-6 -ml-3 cursor-col-resize" style={{ left: splitX }} onPointerDown={startGuideDrag({ kind: "split" })}>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white text-black text-[10px] px-1.5 py-0.5 shadow">⇔</div>
          <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] text-white/80 whitespace-nowrap">before | after</div>
        </div>
      )}

      {/* Brush cursor */}
      {painting && cursor && (
        <div
          className="absolute rounded-full border border-white/90 pointer-events-none mix-blend-difference"
          style={{ left: cursor.x - p.maskTool.size / 2, top: cursor.y - p.maskTool.size / 2, width: p.maskTool.size, height: p.maskTool.size, boxShadow: "0 0 0 1px rgba(0,0,0,0.6)" }}
        />
      )}
      {painting && !p.cleanPreview && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 rounded-md bg-zinc-900/85 border border-zinc-700 px-3 py-1 text-[11px] text-zinc-200 pointer-events-none">
          {p.maskTool.mode === "erase" ? "Erasing" : "Painting"} {p.maskTool.target === "wet" ? "wet-surface" : "protection"} mask · [ ] brush size · X swap · Esc done
        </div>
      )}

      {dragOver && (
        <div className="absolute inset-0 border-2 border-dashed border-sky-400 bg-sky-500/10 flex items-center justify-center pointer-events-none">
          <div className="rounded-md bg-zinc-900/90 px-4 py-2 text-sm text-sky-200">Drop image to load</div>
        </div>
      )}
      {p.children}
    </div>
  );
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}
