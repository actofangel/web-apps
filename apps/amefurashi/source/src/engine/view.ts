/**
 * Preview view transform. `zoom` is CSS pixels per image pixel (1 = 100% view);
 * `panX/panY` offset the image centre from the viewport centre in CSS pixels (y down).
 * The view only affects on-screen display — never the exported composition.
 */
export interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
}

export interface ViewRect {
  /** CSS pixel rect of the displayed image inside the viewport (y down). */
  left: number;
  top: number;
  width: number;
  height: number;
}

export function computeViewRect(view: ViewState, vw: number, vh: number, imgW: number, imgH: number): ViewRect {
  const width = imgW * view.zoom;
  const height = imgH * view.zoom;
  return {
    left: vw / 2 + view.panX - width / 2,
    top: vh / 2 + view.panY - height / 2,
    width,
    height,
  };
}

export function fitZoom(vw: number, vh: number, imgW: number, imgH: number, padding = 24): number {
  const z = Math.min((vw - padding * 2) / imgW, (vh - padding * 2) / imgH);
  return Math.max(0.01, Math.min(z, 8));
}

/** Screen (CSS px, relative to viewport) → image UV with y up. */
export function screenToUV(rect: ViewRect, x: number, y: number): { u: number; v: number } {
  return { u: (x - rect.left) / rect.width, v: 1 - (y - rect.top) / rect.height };
}

/** Image UV (y up) → screen CSS px relative to the viewport. */
export function uvToScreen(rect: ViewRect, u: number, v: number): { x: number; y: number } {
  return { x: rect.left + u * rect.width, y: rect.top + (1 - v) * rect.height };
}

/** Zoom about a cursor position so the image point under the cursor stays fixed. */
export function zoomAround(
  view: ViewState,
  factor: number,
  cx: number,
  cy: number,
  vw: number,
  vh: number,
  imgW: number,
  imgH: number,
): ViewState {
  const rect = computeViewRect(view, vw, vh, imgW, imgH);
  const px = (cx - rect.left) / view.zoom;
  const py = (cy - rect.top) / view.zoom;
  const zoom = Math.max(0.02, Math.min(view.zoom * factor, 32));
  const left = cx - px * zoom;
  const top = cy - py * zoom;
  return {
    zoom,
    panX: left - vw / 2 + (imgW * zoom) / 2,
    panY: top - vh / 2 + (imgH * zoom) / 2,
  };
}
