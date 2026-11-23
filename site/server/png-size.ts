export type PngSize = { width: number; height: number };

export function matchesImageRatio(box: Partial<PngSize> | undefined, size: PngSize) {
  if (!box?.width || !box.height || box.width <= 0 || box.height <= 0) return false;
  // Feishu rounds resized frames to whole pixels.
  return Math.abs(box.width * size.height - box.height * size.width) <=
    Math.max(size.width, size.height) / 2;
}

export async function readPngSize(image: Blob): Promise<PngSize | undefined> {
  const header = new DataView(await image.slice(0, 24).arrayBuffer());
  if (header.byteLength < 24 || header.getUint32(0) !== 0x89504e47 ||
      header.getUint32(4) !== 0x0d0a1a0a || header.getUint32(8) !== 13 ||
      header.getUint32(12) !== 0x49484452) return;
  const width = header.getUint32(16), height = header.getUint32(20);
  if (width && height && width <= 0x7fffffff && height <= 0x7fffffff) return { width, height };
}
