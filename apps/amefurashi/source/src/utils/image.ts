export interface LoadedImage {
  /** Texture source (≤ maxEdge per side). */
  canvas: HTMLCanvasElement;
  /** Natural dimensions after EXIF orientation. */
  width: number;
  height: number;
  name: string;
  type: string;
  size: number;
  /** True when the GPU texture had to be downscaled from the natural size. */
  downscaled: boolean;
}

const SUPPORTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const SUPPORTED_EXT = /\.(jpe?g|png|webp)$/i;

export function isSupportedImageFile(file: File): boolean {
  return SUPPORTED_TYPES.includes(file.type) || (file.type === "" && SUPPORTED_EXT.test(file.name));
}

async function decodeBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      // Browsers apply EXIF orientation with "from-image" (the default in current browsers).
      return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    } catch {
      /* fall through to <img> decoding */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("decode failed"));
      img.src = url;
    });
    // <img> honours EXIF orientation via the default CSS image-orientation: from-image.
    return img;
  } finally {
    // Revoked after drawing (see caller) — keep alive until then.
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

/**
 * Decode a JPEG/PNG/WebP file into a canvas, honouring EXIF orientation and preserving aspect ratio.
 * @param maxEdge GPU texture limit; larger images are downscaled for rendering (disclosed to the user).
 */
export async function loadImageFile(file: File, maxEdge: number): Promise<LoadedImage> {
  if (!isSupportedImageFile(file)) {
    throw new Error(`"${file.name}" is not a supported image. Please use a JPEG, PNG, or WebP file.`);
  }
  let src: ImageBitmap | HTMLImageElement;
  try {
    src = await decodeBitmap(file);
  } catch {
    throw new Error(`"${file.name}" could not be decoded. The file may be corrupted or use an unsupported variant.`);
  }
  const w = src instanceof HTMLImageElement ? src.naturalWidth : src.width;
  const h = src instanceof HTMLImageElement ? src.naturalHeight : src.height;
  if (!w || !h) throw new Error(`"${file.name}" decoded to an empty image.`);
  const s = Math.min(1, maxEdge / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * s));
  const ch = Math.max(1, Math.round(h * s));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create a 2D canvas for the image.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, cw, ch);
  if ("close" in src) src.close();
  return { canvas, width: w, height: h, name: file.name, type: file.type || "image/*", size: file.size, downscaled: s < 1 };
}

/** Decode a grayscale depth guide into a canvas (red channel is used by the shaders). */
export async function loadDepthFile(file: File, maxEdge = 2048): Promise<HTMLCanvasElement> {
  const img = await loadImageFile(file, maxEdge);
  return img.canvas;
}

export function dataURLToCanvas(url: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d")!.drawImage(img, 0, 0);
      resolve(c);
    };
    img.onerror = () => reject(new Error("Could not decode embedded image data."));
    img.src = url;
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser time to start the download before releasing the object URL.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
