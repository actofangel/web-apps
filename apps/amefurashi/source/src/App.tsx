import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAX_IMAGE_EDGE, RainEngine } from "./engine/RainEngine";
import { fitZoom, type ViewState } from "./engine/view";
import { cloneSettings, DEFAULT_SETTINGS, randomSeed, type PreviewQuality, type SectionKey, type Settings } from "./state/settings";
import { PRESETS } from "./state/presets";
import { dataURLToCanvas, downloadBlob, isSupportedImageFile, loadDepthFile, loadImageFile } from "./utils/image";
import { parseProject, serializeProject, type ProjectFile } from "./utils/project";
import { Viewport, type CompareMode } from "./components/Viewport";
import { PlaybackBar, Toasts, Toolbar, UploadScreen } from "./components/Chrome";
import { AtmospherePanel, GlassPanel, ImagePanel, RainPanel } from "./components/Panels";
import { CameraPanel, ExportPanel, LightingPanel, WetPanel } from "./components/PanelsB";
import type { ImageInfo, MaskTarget, MaskToolState, PanelContext } from "./components/panelContext";
import { Button } from "./components/controls";
import { cn } from "./utils/cn";
import demoUrl from "./assets/demo.jpg";

interface Toast {
  id: number;
  text: string;
  tone: "error" | "info";
}

/** Timestamped output name in local time, e.g. amefurashi-soft-drizzle-20261105-013000-1920x1080.png */
function makeOutputFilename(presetId: string, width: number, height: number, ext: "png" | "webm"): string {
  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  return `amefurashi-${presetId || "custom"}-${stamp}-${width}x${height}.${ext}`;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<RainEngine | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(() => cloneSettings(DEFAULT_SETTINGS));
  const [image, setImage] = useState<ImageInfo | null>(null);
  const [view, setView] = useState<ViewState>({ zoom: 1, panX: 0, panY: 0 });
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [fps, setFps] = useState(0);
  const [maskTool, setMaskToolState] = useState<MaskToolState>({ target: "none", mode: "paint", size: 80, softness: 0.6, overlay: true });
  const [compareMode, setCompareMode] = useState<CompareMode>("off");
  const [splitPos, setSplitPos] = useState(0.5);
  const [holdOriginal, setHoldOriginal] = useState(false);
  const [cleanPreview, setCleanPreview] = useState(false);
  const [showLightGuide, setShowLightGuide] = useState(false);
  const [showHorizonGuide, setShowHorizonGuide] = useState(false);
  const [depthOverlay, setDepthOverlay] = useState(false);
  const [hasDepth, setHasDepth] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [exporting, setExporting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [presetId, setPresetId] = useState("");
  const [, setMaskVersion] = useState(0);
  const [pendingProject, setPendingProject] = useState<ProjectFile | null>(null);
  const [compSize, setCompSize] = useState({ w: 0, h: 0 });
  const vpSize = useRef({ w: 1, h: 1 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastId = useRef(1);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartedAtRef = useRef(0);

  const toast = useCallback((text: string, tone: "error" | "info" = "info") => {
    const id = toastId.current++;
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 12000 : 6000);
  }, []);

  // ---------------------------------------------------------------- engine lifecycle
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const eng = new RainEngine(canvas);
    engineRef.current = eng;
    if (!eng.ok) setEngineError(eng.error);
    eng.onTick = (t, f) => {
      setTime(t);
      setFps(f);
      setCompSize((c) => (c.w === eng.compW && c.h === eng.compH ? c : { w: eng.compW, h: eng.compH }));
    };
    eng.onContextLost = () => setEngineError(eng.error);
    return () => {
      eng.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.settings = settings;
    eng.invalidate();
  }, [settings]);

  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.view = view;
    eng.invalidateDisplay();
  }, [view]);

  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.playing = playing;
  }, [playing]);

  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const maskMode = maskTool.overlay && maskTool.target !== "none" ? maskTool.target : "none";
    eng.overlay = {
      mode: cleanPreview ? "none" : maskMode !== "none" ? maskMode : depthOverlay ? "depth" : "none",
      split: compareMode === "split" && !cleanPreview ? splitPos : -1,
      showOriginal: holdOriginal,
    };
    eng.invalidateDisplay();
  }, [maskTool, depthOverlay, compareMode, splitPos, holdOriginal, cleanPreview]);

  // ---------------------------------------------------------------- settings helpers
  const update = useCallback(<K extends SectionKey>(section: K, patch: Partial<Settings[K]>) => {
    setSettings((s) => ({ ...s, [section]: { ...s[section], ...patch } }));
  }, []);
  const setQuality = useCallback((q: PreviewQuality) => setSettings((s) => ({ ...s, quality: q })), []);

  const fitView = useCallback((img?: ImageInfo | null) => {
    const im = img ?? image;
    if (!im) return;
    setView({ zoom: fitZoom(vpSize.current.w, vpSize.current.h, im.width, im.height), panX: 0, panY: 0 });
  }, [image]);

  const actualSize = useCallback(() => setView({ zoom: 1, panX: 0, panY: 0 }), []);

  // ---------------------------------------------------------------- image loading
  const installImage = useCallback(
    (canvas: HTMLCanvasElement, info: ImageInfo) => {
      const eng = engineRef.current;
      if (!eng || !eng.ok) return;
      // A running recording belongs to the previous image: finish and save it first.
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") rec.stop();
      eng.setImage(canvas, info.width, info.height);
      setImage(info);
      setHasDepth(false);
      setDepthOverlay(false);
      setMaskToolState((m) => ({ ...m, target: "none" }));
      setCompSize({ w: eng.compW, h: eng.compH });
      setView({ zoom: fitZoom(vpSize.current.w, vpSize.current.h, info.width, info.height), panX: 0, panY: 0 });
      setPlaying(true);
    },
    [],
  );

  const applyProjectData = useCallback(
    async (pf: ProjectFile) => {
      const eng = engineRef.current;
      if (!eng) return;
      setSettings(pf.settings);
      eng.settings = pf.settings;
      setPlaying(false);
      eng.playing = false;
      eng.setTime(pf.time);
      setTime(pf.time);
      try {
        if (pf.masks.wet && eng.wetMask) await eng.wetMask.loadFromDataURL(pf.masks.wet);
        if (pf.masks.protect && eng.protectMask) await eng.protectMask.loadFromDataURL(pf.masks.protect);
        if (pf.depth) {
          eng.setDepthMap(await dataURLToCanvas(pf.depth));
          setHasDepth(true);
        }
      } catch (e) {
        toast(`Project loaded, but a mask or depth guide could not be restored: ${(e as Error).message}`, "error");
      }
      setMaskVersion((v) => v + 1);
      eng.invalidate();
      toast(`Project restored at t = ${pf.time.toFixed(2)} s (paused).`);
    },
    [toast],
  );

  const loadFile = useCallback(
    async (file: File, projectToApply?: ProjectFile | null) => {
      const eng = engineRef.current;
      if (!eng || !eng.ok) return;
      setBusy(true);
      try {
        const loaded = await loadImageFile(file, Math.min(eng.maxTextureSize, MAX_IMAGE_EDGE));
        const info: ImageInfo = {
          name: loaded.name,
          width: loaded.width,
          height: loaded.height,
          size: loaded.size,
          type: loaded.type,
          downscaled: loaded.downscaled,
          texW: loaded.canvas.width,
          texH: loaded.canvas.height,
        };
        installImage(loaded.canvas, info);
        if (loaded.downscaled) toast(`The image exceeds this GPU's texture limit; rendering and export are capped at ${info.texW}×${info.texH}.`, "info");
        const pf = projectToApply ?? null;
        if (pf) {
          if (pf.image.width && (pf.image.width !== info.width || pf.image.height !== info.height)) {
            toast(`Warning: the project expects ${pf.image.width}×${pf.image.height} but this image is ${info.width}×${info.height}. Masks were stretched to fit.`, "error");
          }
          setPendingProject(null);
          await applyProjectData(pf);
        }
      } catch (e) {
        toast((e as Error).message, "error");
      } finally {
        setBusy(false);
      }
    },
    [installImage, applyProjectData, toast],
  );

  const loadProjectFile = useCallback(
    async (file: File) => {
      try {
        const pf = parseProject(await file.text());
        const eng = engineRef.current;
        if (pf.image.embedded) {
          const canvas = await dataURLToCanvas(pf.image.embedded);
          const info: ImageInfo = { name: pf.image.name, width: canvas.width, height: canvas.height, size: pf.image.size, type: pf.image.type, downscaled: false, texW: canvas.width, texH: canvas.height };
          installImage(canvas, info);
          await applyProjectData(pf);
        } else if (eng?.image && image && image.width === pf.image.width && image.height === pf.image.height) {
          await applyProjectData(pf);
          toast(`Applied the project to the current image (${image.name}); the project was saved with "${pf.image.name}".`);
        } else {
          setPendingProject(pf);
        }
      } catch (e) {
        toast((e as Error).message, "error");
      }
    },
    [applyProjectData, image, installImage, toast],
  );

  const onFiles = useCallback(
    (files: FileList) => {
      const arr = Array.from(files);
      const proj = arr.find((f) => f.name.toLowerCase().endsWith(".json"));
      if (proj) {
        void loadProjectFile(proj);
        return;
      }
      const img = arr.find(isSupportedImageFile) ?? arr[0];
      if (!img) return;
      void loadFile(img, pendingProject);
    },
    [loadFile, loadProjectFile, pendingProject],
  );

  const loadDemo = useCallback(async () => {
    try {
      setBusy(true);
      const res = await fetch(demoUrl);
      const blob = await res.blob();
      await loadFile(new File([blob], "demo.jpg", { type: "image/jpeg" }));
    } catch (e) {
      toast(`Could not load the demo image: ${(e as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  }, [loadFile, toast]);

  // ---------------------------------------------------------------- presets / reset / seed
  const applyPreset = useCallback((id: string) => {
    setPresetId(id);
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setSettings((s) => p.apply(s));
  }, []);

  const resetEffects = useCallback(() => {
    setSettings((s) => {
      const d = cloneSettings(DEFAULT_SETTINGS);
      return { ...d, export: s.export, quality: s.quality, rain: { ...d.rain, seed: s.rain.seed } };
    });
    setPresetId("");
  }, []);

  const newSeed = useCallback(() => update("rain", { seed: randomSeed() }), [update]);

  // ---------------------------------------------------------------- masks / depth
  const maskFor = useCallback((t: MaskTarget) => {
    const eng = engineRef.current;
    return t === "wet" ? eng?.wetMask ?? null : t === "protect" ? eng?.protectMask ?? null : null;
  }, []);
  const bumpMask = useCallback(() => {
    engineRef.current?.invalidate();
    setMaskVersion((v) => v + 1);
  }, []);
  const setMaskTool = useCallback((patch: Partial<MaskToolState>) => setMaskToolState((m) => ({ ...m, ...patch })), []);

  const importDepth = useCallback(
    async (file: File) => {
      const eng = engineRef.current;
      if (!eng || !image) return;
      try {
        const c = await loadDepthFile(file);
        const a1 = c.width / c.height;
        const a2 = image.width / image.height;
        if (Math.abs(a1 - a2) / a2 > 0.02) toast(`The depth map aspect (${c.width}×${c.height}) differs from the image; it will be stretched to fit.`, "error");
        eng.setDepthMap(c);
        setHasDepth(true);
        setDepthOverlay(true);
      } catch (e) {
        toast((e as Error).message, "error");
      }
    },
    [image, toast],
  );

  // ---------------------------------------------------------------- export
  const exportDims = useMemo(() => {
    const eng = engineRef.current;
    const e = settings.export;
    const maxEdge = eng?.maxTextureSize ?? 4096;
    let w = 0;
    let h = 0;
    let note: string | null = null;
    if (!image) return { w, h, note };
    if (e.mode === "preview") {
      w = compSize.w;
      h = compSize.h;
    } else if (e.mode === "original") {
      w = image.texW;
      h = image.texH;
      if (image.downscaled) note = `Original is ${image.width}×${image.height}; this GPU limits output to ${w}×${h}.`;
    } else {
      w = e.width;
      h = e.height;
      const ar = image.width / image.height;
      if (Math.abs(w / h - ar) / ar > 0.01) note = "Aspect differs from the image: the frame will be letterboxed (never cropped or stretched).";
      if (w > maxEdge || h > maxEdge) note = `Exceeds the GPU limit of ${maxEdge} px per side — export will be refused.`;
      else if (w * h > 60e6) note = "Exceeds the 60 MP export limit — export will be refused.";
    }
    return { w, h, note };
  }, [settings.export, image, compSize]);

  const doExport = useCallback(async () => {
    const eng = engineRef.current;
    if (!eng || !image || exporting) return;
    // Freeze the frame, except while a video is recording (pausing would stall the video).
    if (!recorderRef.current) {
      setPlaying(false);
      eng.playing = false;
    }
    setExporting(true);
    try {
      const blob = await eng.exportPNG(exportDims.w, exportDims.h);
      const filename = makeOutputFilename(presetId, exportDims.w, exportDims.h, "png");
      downloadBlob(blob, filename);
      toast(`Exported ${exportDims.w}×${exportDims.h} PNG as ${filename}.`);
    } catch (e) {
      toast(`Export failed: ${(e as Error).message}`, "error");
    } finally {
      setExporting(false);
    }
  }, [image, exporting, exportDims, presetId, toast]);

  const videoSupported = typeof MediaRecorder !== "undefined" && typeof HTMLCanvasElement !== "undefined" && "captureStream" in HTMLCanvasElement.prototype;

  const toggleVideoRecording = useCallback(() => {
    const active = recorderRef.current;
    if (active && active.state !== "inactive") {
      active.stop();
      return;
    }

    const eng = engineRef.current;
    if (!eng || !image) return;
    if (!videoSupported) {
      toast("Video recording is not supported by this browser. Try a current Chrome, Edge, or Firefox release.", "error");
      return;
    }
    // Record the clean composition at the preview render size (no zoom, pan, guides or mask overlays).
    const canvas = eng.startRecordingSurface();
    if (!canvas) {
      toast("Could not prepare the video recording surface.", "error");
      return;
    }
    const stream = canvas.captureStream(30);
    const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 12_000_000,
      });
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      eng.stopRecordingSurface();
      toast(`Could not start video recording: ${(error as Error).message}`, "error");
      return;
    }

    recordingChunksRef.current = [];
    recordingStreamRef.current = stream;
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordingChunksRef.current.push(event.data);
    };
    recorder.onerror = () => toast("Video recording stopped because the browser reported an encoding error.", "error");
    recorder.onstop = () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
      const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || "video/webm" });
      const filename = makeOutputFilename(presetId, canvas.width, canvas.height, "webm");
      engineRef.current?.stopRecordingSurface();
      if (blob.size > 0) {
        downloadBlob(blob, filename);
        toast(`Saved video as ${filename}.`);
      } else {
        toast("The browser produced an empty video recording.", "error");
      }
      recordingChunksRef.current = [];
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
      recorderRef.current = null;
      setRecording(false);
      setRecordingSeconds(0);
    };

    try {
      recorder.start(1000);
      recordingStartedAtRef.current = performance.now();
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((performance.now() - recordingStartedAtRef.current) / 1000);
      }, 200);
      setRecordingSeconds(0);
      setRecording(true);
      setPlaying(true);
      eng.playing = true;
      toast("Video recording started. Stop recording to download the WebM file.");
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      eng.stopRecordingSurface();
      recorderRef.current = null;
      recordingStreamRef.current = null;
      toast(`Could not start video recording: ${(error as Error).message}`, "error");
    }
  }, [image, presetId, toast, videoSupported]);

  const saveProject = useCallback(() => {
    const eng = engineRef.current;
    if (!eng || !image || !eng.image) return;
    const json = serializeProject({
      settings,
      time: eng.time,
      image: { name: image.name, width: image.width, height: image.height, size: image.size, type: image.type },
      embedCanvas: settings.export.embedImageInProject ? eng.image.source : null,
      wetMask: eng.wetMask?.toDataURL() ?? null,
      protectMask: eng.protectMask?.toDataURL() ?? null,
      depth: eng.depth ? eng.depth.canvas.toDataURL("image/png") : null,
    });
    downloadBlob(new Blob([json], { type: "application/json" }), `${image.name.replace(/\.[^.]+$/, "")}.rainproject.json`);
    toast(settings.export.embedImageInProject ? "Project saved with the source image embedded." : "Project saved (source image not embedded — you will be asked for it on load).");
  }, [image, settings, toast]);

  // ---------------------------------------------------------------- keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return; // e.g. a focused switch already handled Space/Enter
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      const eng = engineRef.current;
      const meta = e.ctrlKey || e.metaKey;
      // Leave browser/system shortcuts (Cmd+N, Ctrl+F, Cmd+1 …) alone; only Cmd/Ctrl+Z is ours.
      if ((meta || e.altKey) && !(meta && (e.key === "z" || e.key === "Z"))) return;
      if (e.key === " ") {
        e.preventDefault();
        if (image) setPlaying((p) => !p);
      } else if (e.key === "Escape") {
        if (maskTool.target !== "none") setMaskTool({ target: "none" });
        else if (cleanPreview) setCleanPreview(false);
      } else if (e.key === "Tab" && image) {
        e.preventDefault();
        setCleanPreview((c) => !c);
      } else if (e.key === "f" || e.key === "F") fitView();
      else if (e.key === "1") actualSize();
      else if (e.key === "n" || e.key === "N") newSeed();
      else if (e.key === "b" || e.key === "B") setHoldOriginal(true);
      else if (e.key === "," || e.key === ".") {
        if (eng) {
          setPlaying(false);
          eng.playing = false;
          eng.setTime(eng.time + (e.key === "." ? 1 : -1) / 60);
          setTime(eng.time);
        }
      } else if (e.key === "[" || e.key === "]") {
        setMaskTool({ size: Math.max(4, Math.min(400, Math.round(maskTool.size * (e.key === "]" ? 1.2 : 1 / 1.2)))) });
      } else if ((e.key === "x" || e.key === "X") && maskTool.target !== "none") {
        setMaskTool({ mode: maskTool.mode === "paint" ? "erase" : "paint" });
      } else if (meta && (e.key === "z" || e.key === "Z") && maskTool.target !== "none") {
        e.preventDefault();
        const m = maskFor(maskTool.target);
        if (e.shiftKey) m?.redo();
        else m?.undo();
        bumpMask();
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === "b" || e.key === "B") setHoldOriginal(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
    };
  }, [image, maskTool, cleanPreview, fitView, actualSize, newSeed, setMaskTool, maskFor, bumpMask]);

  // ---------------------------------------------------------------- panel context
  const ctx: PanelContext = {
    settings,
    update,
    setQuality,
    image,
    compSize,
    fps,
    onReplaceImage: () => fileInputRef.current?.click(),
    onResetEffects: resetEffects,
    onFit: () => fitView(),
    onActualSize: actualSize,
    maskTool,
    setMaskTool,
    maskUndo: (t) => {
      maskFor(t)?.undo();
      bumpMask();
    },
    maskRedo: (t) => {
      maskFor(t)?.redo();
      bumpMask();
    },
    maskClear: (t) => {
      maskFor(t)?.clear();
      bumpMask();
    },
    maskCanUndo: (t) => maskFor(t)?.canUndo ?? false,
    maskCanRedo: (t) => maskFor(t)?.canRedo ?? false,
    maskHasPaint: (t) => maskFor(t)?.hasPaint ?? false,
    hasDepth,
    onImportDepth: (f) => void importDepth(f),
    onClearDepth: () => {
      engineRef.current?.setDepthMap(null);
      setHasDepth(false);
      setDepthOverlay(false);
    },
    depthOverlay,
    setDepthOverlay,
    showLightGuide,
    setShowLightGuide,
    showHorizonGuide,
    setShowHorizonGuide,
    onNewSeed: newSeed,
    exporting,
    exportDims,
    onExport: () => void doExport(),
    videoSupported,
    recording,
    recordingSeconds,
    onToggleVideoRecording: toggleVideoRecording,
    onSaveProject: saveProject,
    onLoadProject: (f) => void loadProjectFile(f),
    maxTextureSize: engineRef.current?.maxTextureSize ?? 4096,
  };

  const sidebar = (
    <aside
      className={cn(
        "bg-zinc-950 border-zinc-800 overflow-y-auto text-zinc-200 shrink-0",
        "lg:static lg:block lg:w-[340px] lg:border-l lg:max-h-none",
        sidebarOpen ? "absolute inset-x-0 bottom-0 z-20 max-h-[55vh] border-t shadow-2xl" : "hidden",
      )}
    >
      <ImagePanel ctx={ctx} />
      <RainPanel ctx={ctx} />
      <AtmospherePanel ctx={ctx} />
      <GlassPanel ctx={ctx} />
      <WetPanel ctx={ctx} />
      <LightingPanel ctx={ctx} />
      <CameraPanel ctx={ctx} />
      <ExportPanel ctx={ctx} />
      <div className="px-3 py-3 text-[10px] text-zinc-600 leading-snug">
        Physical controls carry units (mm, m/s, s, m, °); everything else is artistic. Rain, mist, droplets, ripples and splashes are closed-form functions of time and seed, so a saved frame is exactly reproducible.
      </div>
    </aside>
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden">
      {!cleanPreview && (
        <Toolbar
          hasImage={!!image}
          zoom={view.zoom}
          onOpen={() => fileInputRef.current?.click()}
          onFit={() => fitView()}
          onActualSize={actualSize}
          presetId={presetId}
          onPreset={applyPreset}
          compareMode={compareMode}
          setCompareMode={setCompareMode}
          onHoldStart={() => setHoldOriginal(true)}
          onHoldEnd={() => setHoldOriginal(false)}
          onCleanPreview={() => setCleanPreview(true)}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((s) => !s)}
        />
      )}
      <div className="flex-1 flex min-h-0 relative">
        <Viewport
          engine={engineRef.current}
          canvasRef={canvasRef}
          image={image}
          view={view}
          setView={setView}
          settings={settings}
          update={update}
          maskTool={maskTool}
          compareMode={compareMode}
          splitPos={splitPos}
          setSplitPos={setSplitPos}
          showLightGuide={showLightGuide}
          showHorizonGuide={showHorizonGuide || (settings.wet.enabled && maskTool.target === "wet")}
          cleanPreview={cleanPreview}
          onDropFiles={onFiles}
          onMaskChanged={bumpMask}
          onSizeChange={(w, h) => {
            vpSize.current = { w, h };
            engineRef.current?.invalidateDisplay();
          }}
        >
          {engineError && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="max-w-md rounded-lg border border-red-900 bg-red-950/80 p-5 text-sm text-red-100">
                <div className="font-semibold mb-1">Rendering unavailable</div>
                {engineError}
              </div>
            </div>
          )}
          {!engineError && !image && <UploadScreen onFiles={onFiles} onDemo={() => void loadDemo()} error={null} busy={busy} />}
          {pendingProject && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-6">
              <div className="max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-5 text-[13px] text-zinc-200 space-y-3">
                <div className="font-semibold">This project needs its source image</div>
                <div className="text-zinc-400">
                  The project was saved without an embedded image. Please choose <span className="text-zinc-200">{pendingProject.image.name}</span> ({pendingProject.image.width}×{pendingProject.image.height}).
                </div>
                <div className="flex gap-2">
                  <Button variant="primary" onClick={() => fileInputRef.current?.click()}>Choose Image</Button>
                  {image && image.width === pendingProject.image.width && image.height === pendingProject.image.height && (
                    <Button onClick={() => { const pf = pendingProject; setPendingProject(null); void applyProjectData(pf); }}>Use Current Image</Button>
                  )}
                  <Button onClick={() => setPendingProject(null)}>Cancel</Button>
                </div>
              </div>
            </div>
          )}
          {cleanPreview && (
            <button className="absolute top-3 right-3 btn opacity-70 hover:opacity-100" onClick={() => setCleanPreview(false)} title="Exit clean preview (Esc)">
              Exit Preview
            </button>
          )}
          {busy && image && <div className="absolute top-3 left-3 rounded bg-zinc-900/90 px-2 py-1 text-[11px]">Loading…</div>}
        </Viewport>
        {!cleanPreview && sidebar}
      </div>
      {!cleanPreview && (
        <PlaybackBar
          playing={playing}
          time={time}
          onTogglePlay={() => setPlaying((p) => !p)}
          onSetTime={(t) => {
            const eng = engineRef.current;
            if (!eng) return;
            setPlaying(false);
            eng.playing = false;
            eng.setTime(t);
            setTime(t);
          }}
          onStep={(dir) => {
            const eng = engineRef.current;
            if (!eng) return;
            setPlaying(false);
            eng.playing = false;
            eng.setTime(eng.time + dir / 60);
            setTime(eng.time);
          }}
          onNewSeed={newSeed}
          onCapture={() => void doExport()}
          exporting={exporting}
          hasImage={!!image}
          exportDims={exportDims}
        />
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <Toasts items={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </div>
  );
}
