# Rain Atelier

A browser application that turns a photograph into a convincing rainy scene and exports high‑resolution PNG stills.
Everything runs locally in the browser (Three.js + WebGL 2 shaders, React, TypeScript). No account, no upload, no remote API.

**Workflow:** Upload Image → Choose a Rain Preset → Refine the Atmosphere → Pause at a Beautiful Moment → Capture Frame (PNG)

---

## Launch

Requirements: Node.js 18+ and a browser with WebGL 2 (Chrome, Edge, Firefox, Safari 15+).

```bash
npm install          # dependencies are pinned (three 0.170.0, react 19, vite 7)
npm run dev          # development server → http://localhost:5173
npm run build        # production build → dist/index.html
npm run preview      # serve the production build
```

### Standalone file

The production build uses `vite-plugin-singlefile`: **`dist/index.html` is a single self‑contained file** (JavaScript, CSS,
and the bundled demo photo are inlined). It opens directly from disk (`file://…/dist/index.html`) with no CDN or network
access — this was verified in headless Chromium (see *Verification*). Nothing is fetched at runtime.

---

## Using the app

| Step | Where | Notes |
|---|---|---|
| Load an image | Upload screen, toolbar **Open Image**, or drag & drop anywhere | JPEG / PNG / WebP. EXIF orientation is applied, aspect ratio preserved. Unsupported or corrupt files are reported. |
| Choose a preset | Toolbar **Preset…** | Soft Drizzle · Overcast Rain · Heavy Shower · Backlit Night Rain · Misty Rain · Rain on Glass. Presets never touch masks, depth guides or the seed. |
| Refine | Right‑hand panels | Image · Rain · Atmosphere · Glass · Wet Surfaces · Lighting · Camera · Export. Every slider has a numeric input, tooltip and reset (↺ / double‑click). |
| Preview | Viewport | Wheel = zoom, drag = pan, **Fit** / **100%**, **Compare** (split wipe) or **Hold Original** (or hold **B**), **Clean Preview** (Tab; Esc exits). Zoom/pan never affect the export. |
| Freeze a moment | Bottom bar | **Play/Pause** (Space), timeline scrubber, numeric time, **Step Frame** (`,` / `.`), **New Seed** (N). Pausing freezes *every* animated layer. |
| Export | **Capture Frame** or Export panel | Preview size · Original image size · Custom W×H with aspect lock. Exact output dimensions are shown before export. |
| Save / load | Export panel | Versioned JSON project: settings, seed, frozen time, masks, depth guide, image identity; optionally the embedded image. |

Keyboard: Space play/pause · `,`/`.` step · F fit · 1 = 100% · Tab clean preview · Esc exit / stop painting · N new seed · B hold original · `[` `]` brush size · X swap paint/erase · Ctrl/Cmd+Z / Shift+Z undo/redo (while painting).

### Masks and guides

* **Wet Surfaces** and **Subject Protection** each have a mask editor: Paint / Erase, Brush Size, Feathering, Overlay Preview,
  Undo / Redo, Clear Mask. Masks are stored in image space, so they stay aligned after zooming, panning or resizing.
* **Ground guide** (dashed line): drag to move the horizon, drag the round handle to tilt. It orients ripples, splashes and the
  screen‑space reflection.
* **Key light guide** (yellow marker): drag onto the main light source. *Key Light Depth* moves the light behind the scene (+1,
  back light) or behind the camera (−1, front light).
* Guides and overlays are DOM/preview‑only and are never part of an export.

---

## Rendering pipeline

All passes run at the *composition* resolution in offscreen render targets (linear half‑float where supported), and only the
last display pass applies zoom/pan. Export runs the identical pipeline into dedicated targets at the requested size and reads
the pixels back — it is never a screenshot of the editor.

1. **Scene pass** – photo → masked wet surface (darkening, screen‑space reflection mirrored about the ground guide, procedural
   perspective ripples, key‑light glare) → depth‑dependent mist with softness and slow drift.
2. **Rain pass** – instanced streak quads (up to 65 536) whose position, size, velocity, defocus and brightness are computed
   in the vertex shader from `(instance id, seed, time)`. No per‑frame allocations, no CPU particle state.
3. **Splash pass** – instanced crowns on the wet mask, timed deterministically.
4. **Grade pass** – exposure, overcast tone treatment, white balance, contrast, saturation.
5. **Bloom** – threshold + separable blur at ¼ and ⅛ resolution.
6. **Final pass** – bloom composite, optional *Rain on Glass* refraction of the composed scene, sRGB encoding.
7. **Display pass** (preview only) – zoom/pan, before/after wipe, mask/depth overlays.

Pixel‑sized effects derive from the output resolution (virtual focal length in pixels, splash size ∝ height, bloom in
fractions of the frame), so preview and export match in composition, apparent rain size, blur and density.

### Determinism and playback

Every animated layer — rain, gusts, turbulence, mist drift, ripples, splashes, glass droplets, sliding and coalescence — is a
closed‑form function of `time` and `seed`. There is no history‑dependent simulation, so a project's frozen time + seed
reproduce a frame exactly, and rendering is frame‑rate independent by construction (time advances by real elapsed time,
capped at 0.1 s per frame so background tabs cannot jump).

---

## What is research‑informed and what is artistic

Research‑informed (Garg & Nayar, *Photorealistic Rendering of Rain Streaks*, 2006; *Vision and Rain*, 2007; Atlas et al.
1973; Marshall–Palmer):

* Streak length = projected drop velocity × exposure time (shutter). An *artistic* "Streak Length ×" is labelled separately.
* Streak opacity: a pixel sees a drop for only a fraction of the exposure, ≈ (drop width + 1 px) / (streak length + drop width
  + 1 px); longer exposures therefore give longer *and fainter* streaks. An artistic gain (*Rain Visibility*) is applied on top.
* Terminal velocity from drop diameter: `v = 9.65 − 10.3·exp(−0.6·D)` m/s (D in mm), with a Marshall–Palmer‑shaped
  exponential spread around the user's mean diameter.
* Drops are treated as refracting a wide environment and are typically brighter than their local background; the approximation
  samples a wide neighbourhood average and the global average of the photo plus a forward‑peaked (Henyey–Greenstein‑style)
  key‑light term, so brightness depends on the angle between each drop's view ray and the light rather than on the pixel
  behind it.
* Brightness variation along a streak is inspired by drop oscillation patterns in Garg & Nayar's streak appearance model.

Artistic approximations (not physical reconstructions):

* Depth of field per drop (`CoC ∝ |1/z − 1/z_focus|`, constant ≈ 35 mm at f/5.6 scaled by the control), the sub‑pixel
  coverage floor for far rain, the phase‑function constants, the "Background Occlusion" blend.
* Mist without a depth map uses an explicitly approximate vertical gradient (Camera → *Gradient Horizon*).
* Wet‑surface reflections are screen‑space mirrors of the photo about the ground guide; they do not reconstruct scene geometry.
* Glass droplets: procedural signed‑distance field with smooth‑min merging; sliding drops absorb static droplets in their path
  (which regrow) and grow as they go — a visible coalescence behaviour, not a fluid simulation.
* The overcast control is a tone treatment (highlight compression, desaturation, cool neutrals). No clouds are rendered.
* Colour grading does not reconstruct the original scene's lighting; a single photo does not provide scene geometry or lighting,
  which is why the light, ground and depth guides are manual.

Implemented paper methods: none are reproduced in full. The streak database, oscillation model and rendering equations of
Garg & Nayar are *not* implemented; only the geometric/exposure relations listed above.

---

## Limitations

* **Preview render size** is capped per quality level (Low 1280 / Balanced 1920 / High 2880 px long edge). The 100 % view of a
  larger photo therefore shows an upscaled preview; export always renders at full requested resolution.
* **Export limits:** each side ≤ the GPU's maximum texture size (shown in the Export panel, capped at 16 384), and ≤ 60 MP total.
  Images larger than 8192 px on the long edge (or the GPU limit) are downscaled for rendering, and the actual supported output
  size is disclosed in the Image and Export panels. Larger requests are refused with a message instead of producing a blank file.
* **No automatic depth estimation.** Depth maps must be supplied (grayscale; white = near by default, *Invert Depth* available).
  Without one, rain is not occluded (use the protection mask) and mist uses the approximate gradient.
* Rain is not occluded by the approximate gradient — only by an imported depth map and the protection mask.
* Wet‑surface reflections mirror about a single horizon line; objects standing on the surface are mirrored approximately.
* On GPUs without `EXT_color_buffer_float`, intermediate targets fall back to 8‑bit (possible banding in mist gradients).
* The glass layer's fragment shader is the most expensive pass; on integrated GPUs use *Low* preview quality while editing.
* `Export → Custom` with a different aspect ratio letterboxes the image (never crops or stretches).
* Project files store masks and the depth guide as PNG data URLs; the source image is embedded only when *Embed Source Image*
  is on. Otherwise the app asks for the matching image and warns if its dimensions differ.

---

## Verification

Automated end‑to‑end tests (`scripts/e2e-test.mjs`) run the production `dist/index.html` **opened via `file://`** in headless
Chromium 131 with SwiftShader WebGL 2. They generate landscape and portrait PNGs in‑page, upload them through the real file
input, drive the UI, intercept real download events and parse the PNG headers. Checked: direct‑file opening, demo load, shader
compilation (no program errors), PNG export at preview/original/custom sizes with exact dimensions, byte‑identical repeat
captures at the same time + seed, frame change with time and exact reproduction on return, presets and control changes
altering the output, oversize export refusal, wet‑mask painting + undo availability, project save/load, image replacement,
clean preview, and unsupported‑file reporting.

Run them yourself (requires Playwright): `npm i -D playwright && npx playwright install chromium && node scripts/e2e-test.mjs`.

Last run: **24 / 24 checks passed** (log in `test-output/e2e.log`). The only console output during the run is Chromium's
"GPU stall due to ReadPixels" performance note, which is inherent to synchronous pixel readback during export and is not an error.

Reported separately:

* **Browser testing** — headless Chromium only (Playwright 1.49 / Chromium 131). Firefox and Safari were not run here.
* **WebGL testing** — SwiftShader software WebGL 2 (`EXT_color_buffer_float` present); shaders compile without errors and the
  full pipeline (scene, rain, splash, grade, bloom, glass, display) renders. Real GPU drivers were not available in the sandbox.
* **Direct-file opening** — `dist/index.html` was loaded via `file://` and worked with no network access.
* **PNG download testing** — real `download` events were intercepted; files were saved and their IHDR chunks parsed: 1536×1024
  (preview/original), 800×800 (custom, letterboxed), 900×1600 (portrait original). Repeat captures at the same time + seed were
  byte-identical.

Not verified in this environment: real GPU drivers, Firefox/Safari, touch devices, and perceptual judgement beyond inspecting
exported frames and screenshots.
