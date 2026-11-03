// Images added in the editor are resized (at most 1600 px on the long side) and re-encoded in the browser:
// WebP where the browser can encode it, otherwise JPEG for photos and PNG for graphics. Everything goes
// through a canvas, so an image file can't carry anything but pixels into the document.
export const MAX_SIDE = 1600;

export interface PreparedImage {
  data: Uint8Array;
  mediaType: "image/webp" | "image/jpeg" | "image/png";
  width: number;
  height: number;
  name: string;
}

export class ImageError extends Error {}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

async function decode(file: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  if ("createImageBitmap" in window && file.type !== "image/svg+xml")
    return createImageBitmap(file);
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  let source: CanvasImageSource & { width: number; height: number };
  try {
    source = await decode(file);
  } catch {
    throw new ImageError("This image can't be read. Use a PNG, JPEG, GIF, WebP or SVG file.");
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(source.width, source.height, 1));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageError("This browser can't process images.");
  ctx.drawImage(source, 0, 0, width, height);
  const graphic = /png|gif|svg/.test(file.type);
  let blob = await toBlob(canvas, "image/webp", 0.85);
  let mediaType: PreparedImage["mediaType"] = "image/webp";
  if (!blob || blob.type !== "image/webp") {
    mediaType = graphic ? "image/png" : "image/jpeg";
    blob = await toBlob(canvas, mediaType, 0.88);
  }
  if (!blob) throw new ImageError("This image couldn't be encoded.");
  const ext = mediaType === "image/webp" ? "webp" : mediaType === "image/png" ? "png" : "jpg";
  const stem = file.name.replace(/\.[^.]*$/, "") || "image";
  return {
    data: new Uint8Array(await blob.arrayBuffer()),
    mediaType,
    width,
    height,
    name: `${stem}.${ext}`,
  };
}
