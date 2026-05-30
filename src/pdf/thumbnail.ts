/**
 * Renders a single PDF page to a canvas for the Organize view's thumbnail grid.
 * (The Crop view stacks pages into one ghost preview; here we want each page on
 * its own so you can see exactly which one you're deleting or moving.)
 */
import type { PDFDocumentProxy } from "./pdfjs";

export async function renderPageThumb(
  doc: PDFDocumentProxy,
  pageIndex: number,
  targetWidth: number,
  extraRotation = 0,
): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageIndex + 1);
  // Combine the page's own rotation with any the user applied in the organizer,
  // so the thumbnail renders upright at the correct aspect ratio.
  const rotation = (((page.rotate + extraRotation) % 360) + 360) % 360;
  const base = page.getViewport({ scale: 1, rotation });
  const scale = targetWidth / base.width;
  const viewport = page.getViewport({ scale, rotation });

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport }).promise;
  page.cleanup();
  return canvas;
}
