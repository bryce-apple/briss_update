/**
 * Builds the "ghost" composite preview for a cluster.
 *
 * We render a sample of the cluster's pages on top of one another using a
 * "darken" blend, so the darkest pixel across all sampled pages wins. The
 * result is the visual signature of the group: text that appears in roughly the
 * same place on every page shows up solid, while page-specific content fades —
 * exactly the overlay Briss uses to help you pick a crop that works for all
 * pages at once.
 */
import type { Cluster } from "../types";
import type { PDFDocumentProxy } from "./pdfjs";

/** Cap how many pages we merge, so huge documents stay responsive. */
const MAX_SAMPLES = 40;
/** Target width (CSS px) of the generated preview image. */
const PREVIEW_WIDTH = 520;

/** Evenly spaced sample of indices, at most MAX_SAMPLES of them. */
function sample(indices: number[]): number[] {
  if (indices.length <= MAX_SAMPLES) return indices;
  const step = indices.length / MAX_SAMPLES;
  const out: number[] = [];
  for (let i = 0; i < MAX_SAMPLES; i++) out.push(indices[Math.floor(i * step)]);
  return out;
}

export async function renderClusterPreview(
  doc: PDFDocumentProxy,
  cluster: Cluster,
): Promise<HTMLCanvasElement> {
  const sampled = sample(cluster.pageIndices);

  const width = PREVIEW_WIDTH;
  const height = Math.max(1, Math.round(width / cluster.aspect));

  const composite = document.createElement("canvas");
  composite.width = width;
  composite.height = height;
  const cctx = composite.getContext("2d")!;
  // Start white so the darken blend has a sane baseline.
  cctx.fillStyle = "#ffffff";
  cctx.fillRect(0, 0, width, height);

  // Reused scratch canvas for rendering each page before blending.
  const scratch = document.createElement("canvas");
  scratch.width = width;
  scratch.height = height;
  const sctx = scratch.getContext("2d")!;

  for (const pageIndex of sampled) {
    const page = await doc.getPage(pageIndex + 1);
    const base = page.getViewport({ scale: 1 });
    const scale = width / base.width;
    const viewport = page.getViewport({ scale });

    // White background per page so transparent areas don't darken the stack.
    sctx.globalCompositeOperation = "source-over";
    sctx.fillStyle = "#ffffff";
    sctx.fillRect(0, 0, scratch.width, scratch.height);

    await page.render({ canvasContext: sctx, viewport }).promise;
    page.cleanup();

    // Keep the darkest pixel across the stack.
    cctx.globalCompositeOperation = "darken";
    cctx.drawImage(scratch, 0, 0);
  }

  return composite;
}
