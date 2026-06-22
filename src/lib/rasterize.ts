// Rasterize an SVG string to a PNG Blob entirely in the browser.
//
// The share card (src/lib/shareCard.ts) has no external image refs or
// webfonts, so the canvas is never tainted and toBlob() works without CORS
// issues. We render at `scale`× for crisp output on high-DPI screens.

export async function svgToPng(
  svg: string,
  width: number,
  height: number,
  scale = 2,
): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);
    return await canvasToBlob(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to render the share image."));
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Canvas PNG export failed.")),
      "image/png",
    );
  });
}
