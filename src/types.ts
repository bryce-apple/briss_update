/**
 * Core data model for Briss Web.
 *
 * Coordinates note: crop rectangles are stored as *normalized* values in the
 * range [0, 1] relative to the displayed (visual) page, with the origin at the
 * top-left, x increasing right and y increasing down — i.e. the same convention
 * as the on-screen canvas. Because they are normalized, one rectangle drawn on a
 * cluster's ghost preview applies to every page in that cluster regardless of
 * the exact pixel size we happened to render the preview at. The export step
 * converts these into PDF user-space coordinates (origin bottom-left, points).
 */

/** A normalized crop rectangle, top-left origin, values in [0, 1]. */
export interface NormRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Metadata about a single source page, gathered while loading. */
export interface PageInfo {
  /** Zero-based page index in the source document. */
  index: number;
  /** Visible width in PDF points (CropBox width), pre-rotation. */
  width: number;
  /** Visible height in PDF points (CropBox height), pre-rotation. */
  height: number;
  /** Page rotation in degrees, normalized to one of 0/90/180/270. */
  rotation: number;
}

/**
 * A group of pages that share the same visual shape (size + rotation + parity).
 * All pages in a cluster are previewed together and share the same set of crop
 * rectangles.
 */
export interface Cluster {
  id: string;
  /** Stable key used to bucket pages into this cluster. */
  key: string;
  /** Human-readable label, e.g. "Odd pages · 595×842". */
  label: string;
  /** Source page indices belonging to this cluster, in document order. */
  pageIndices: number[];
  /** Displayed aspect ratio (width / height) after rotation is applied. */
  aspect: number;
  /** Crop rectangles the user has drawn. */
  rects: NormRect[];
}
