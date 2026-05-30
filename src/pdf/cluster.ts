/**
 * Page clustering — the heart of what makes Briss "crop many pages at once."
 *
 * Like the original ClusterManager, we bucket pages by their visual shape so
 * that, say, all the left-hand pages of a scanned book end up in one group and
 * all the right-hand pages in another. Pages in the same bucket are previewed
 * together and share crop rectangles.
 *
 * The bucket key is (rounded display width, rounded display height, parity).
 * Display size already accounts for rotation. Parity (odd/even page number)
 * matters because facing-page scans alternate content position even when the
 * page size is identical.
 */
import type { Cluster, PageInfo } from "../types";
import type { PDFDocumentProxy } from "./pdfjs";

/** Read size + rotation metadata for every page. */
export async function readPageInfos(doc: PDFDocumentProxy): Promise<PageInfo[]> {
  const infos: PageInfo[] = [];
  for (let i = 0; i < doc.numPages; i++) {
    const page = await doc.getPage(i + 1);
    // viewport at scale 1 gives CSS-pixel == PDF-point dimensions, rotation
    // already applied to width/height.
    const vp = page.getViewport({ scale: 1 });
    const rotation = ((page.rotate % 360) + 360) % 360;
    // vp.width/height are post-rotation; recover the pre-rotation box so the
    // export step (which works in unrotated user space) has what it needs.
    const rotated = rotation === 90 || rotation === 270;
    infos.push({
      index: i,
      width: rotated ? vp.height : vp.width,
      height: rotated ? vp.width : vp.height,
      rotation,
    });
    page.cleanup();
  }
  return infos;
}

/** Group page infos into clusters by visual shape and parity. */
export function clusterPages(infos: PageInfo[]): Cluster[] {
  const buckets = new Map<string, PageInfo[]>();

  for (const info of infos) {
    const rotated = info.rotation === 90 || info.rotation === 270;
    const dispW = Math.round(rotated ? info.height : info.width);
    const dispH = Math.round(rotated ? info.width : info.height);
    const parity = info.index % 2 === 0 ? "odd" : "even"; // page 1 (index 0) = odd
    const key = `${dispW}x${dispH}:${info.rotation}:${parity}`;
    let list = buckets.get(key);
    if (!list) buckets.set(key, (list = []));
    list.push(info);
  }

  const clusters: Cluster[] = [];
  let n = 0;
  for (const [key, list] of buckets) {
    const first = list[0];
    const rotated = first.rotation === 90 || first.rotation === 270;
    const dispW = Math.round(rotated ? first.height : first.width);
    const dispH = Math.round(rotated ? first.width : first.height);
    const parity = first.index % 2 === 0 ? "Odd" : "Even";
    clusters.push({
      id: `cluster-${n++}`,
      key,
      label: `${parity} pages · ${dispW}×${dispH}${first.rotation ? ` · ${first.rotation}°` : ""}`,
      pageIndices: list.map((p) => p.index),
      aspect: dispW / dispH,
      rects: [],
    });
  }

  // Largest groups first — the user usually cares about the bulk content pages.
  clusters.sort((a, b) => b.pageIndices.length - a.pageIndices.length);
  return clusters;
}
