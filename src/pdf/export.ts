/**
 * Writes the cropped output PDF with pdf-lib (the original Briss used iText's
 * CropManager for this; pdf-lib is the MIT-licensed browser equivalent).
 *
 * For every source page we look up the cluster it belongs to and emit one output
 * page per crop rectangle, cropped to that rectangle. Two rectangles on a
 * book-scan cluster therefore turn each two-up source page into two single
 * output pages, in left-to-right (rectangle) order. A cluster with no rectangles
 * passes its pages through untouched so nothing is silently dropped.
 *
 * Cropping is done by narrowing the page's CropBox/MediaBox — non-destructive,
 * so real text and vector content are preserved at full quality and the file
 * stays small. The underlying content outside the box is simply not shown.
 */
import { PDFDocument } from "pdf-lib";
import type { Cluster, NormRect } from "../types";

interface UserRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Convert a normalized display-space rectangle (top-left origin) into a PDF
 * user-space rectangle (bottom-left origin) within the page's visible box,
 * accounting for page rotation.
 */
export function toUserRect(
  cb: { x: number; y: number; width: number; height: number },
  rotation: number,
  r: NormRect,
): UserRect {
  // Display-space corners (a: left→right, b: top→bottom), both in [0, 1].
  const a0 = r.x;
  const a1 = r.x + r.w;
  const b0 = r.y;
  const b1 = r.y + r.h;

  // Map a display corner to user-normalized (u: left→right, v: bottom→top).
  const mapCorner = (a: number, b: number): [number, number] => {
    switch (((rotation % 360) + 360) % 360) {
      case 90:
        return [b, a];
      case 180:
        return [1 - a, b];
      case 270:
        return [1 - b, 1 - a];
      default: // 0
        return [a, 1 - b];
    }
  };

  const corners = [mapCorner(a0, b0), mapCorner(a1, b0), mapCorner(a1, b1), mapCorner(a0, b1)];
  const us = corners.map((c) => c[0]);
  const vs = corners.map((c) => c[1]);
  const u0 = Math.min(...us);
  const u1 = Math.max(...us);
  const v0 = Math.min(...vs);
  const v1 = Math.max(...vs);

  return {
    x: cb.x + u0 * cb.width,
    y: cb.y + v0 * cb.height,
    width: (u1 - u0) * cb.width,
    height: (v1 - v0) * cb.height,
  };
}

/** Map every source page index to the cluster that owns it. */
function buildPageClusterMap(clusters: Cluster[]): Map<number, Cluster> {
  const map = new Map<number, Cluster>();
  for (const cluster of clusters) {
    for (const idx of cluster.pageIndices) map.set(idx, cluster);
  }
  return map;
}

export async function exportCroppedPdf(
  sourceBytes: ArrayBuffer,
  clusters: Cluster[],
): Promise<Uint8Array> {
  const src = await PDFDocument.load(sourceBytes);
  const out = await PDFDocument.create();
  const pageCluster = buildPageClusterMap(clusters);
  const total = src.getPageCount();

  // Build the output plan first: one entry per output page, in order. A page
  // with no rects passes through (rect = null); a page with N rects yields N
  // entries (the split).
  const plan: { srcIndex: number; rect: NormRect | null }[] = [];
  for (let i = 0; i < total; i++) {
    const rects = pageCluster.get(i)?.rects ?? [];
    if (rects.length === 0) {
      plan.push({ srcIndex: i, rect: null });
    } else {
      for (const rect of rects) plan.push({ srcIndex: i, rect });
    }
  }

  // Copy every needed page in a SINGLE call. pdf-lib de-duplicates shared
  // indirect objects (fonts, scanned images) across the whole copy — including
  // split duplicates — so the output stays close to the source size instead of
  // duplicating image data per page. Duplicated indices come back as distinct
  // page objects, so each can carry its own crop box.
  const copied = await out.copyPages(
    src,
    plan.map((p) => p.srcIndex),
  );

  copied.forEach((page, k) => {
    const rect = plan[k].rect;
    if (rect) {
      const cb = page.getCropBox();
      const user = toUserRect(cb, page.getRotation().angle, rect);
      page.setCropBox(user.x, user.y, user.width, user.height);
      page.setMediaBox(user.x, user.y, user.width, user.height);
    }
    out.addPage(page);
  });

  return out.save();
}
