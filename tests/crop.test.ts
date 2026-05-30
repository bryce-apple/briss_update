/**
 * Headless tests for the browser-independent core: page clustering, the
 * normalized-rect → PDF-user-space crop math (incl. rotation), and the
 * multi-rectangle page-splitting export.
 *
 * The rotation math is checked against pdf.js's own `viewport.convertToPdfPoint`
 * as an independent oracle, so we're not just grading our own homework.
 */
import { describe, it, expect } from "vitest";
import { PDFDocument, degrees } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

import { clusterPages, readPageInfos } from "../src/pdf/cluster";
import { toUserRect, exportCroppedPdf } from "../src/pdf/export";
import type { NormRect } from "../src/types";

async function pdfjsDoc(bytes: Uint8Array) {
  return getDocument({ data: bytes }).promise;
}

describe("clusterPages", () => {
  it("splits identical pages into odd/even groups and separates by size", async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 4; i++) doc.addPage([595, 842]); // 4 portrait pages
    doc.addPage([1000, 700]); // one landscape (its own group)
    const bytes = await doc.save();

    const infos = await readPageInfos(await pdfjsDoc(bytes));
    const clusters = clusterPages(infos);

    // 595x842 odd, 595x842 even, 1000x700 odd => 3 groups.
    expect(clusters.length).toBe(3);
    const counts = clusters.map((c) => c.pageIndices.length).sort();
    expect(counts).toEqual([1, 2, 2]);

    // Pages 0 and 2 (odd) share a group; 1 and 3 (even) share another.
    const odd = clusters.find((c) => c.pageIndices.includes(0))!;
    expect(odd.pageIndices).toEqual([0, 2]);
    const even = clusters.find((c) => c.pageIndices.includes(1))!;
    expect(even.pageIndices).toEqual([1, 3]);
  });
});

describe("exportCroppedPdf — multi-rect splitting", () => {
  it("turns one two-up page into two cropped pages, in order", async () => {
    const src = await PDFDocument.create();
    src.addPage([600, 800]);
    const bytes = await src.save();

    const cluster = {
      id: "c0",
      key: "k",
      label: "l",
      pageIndices: [0],
      aspect: 600 / 800,
      rects: [
        { id: "r1", x: 0.0, y: 0.05, w: 0.5, h: 0.9 }, // left half
        { id: "r2", x: 0.5, y: 0.05, w: 0.5, h: 0.9 }, // right half
      ],
    };

    const out = await exportCroppedPdf(bytes.buffer.slice(0), [cluster]);
    const outDoc = await PDFDocument.load(out);
    expect(outDoc.getPageCount()).toBe(2);

    const m0 = outDoc.getPage(0).getMediaBox();
    const m1 = outDoc.getPage(1).getMediaBox();
    expect(m0).toMatchObject({ x: 0, width: 300, height: 720 });
    expect(m1).toMatchObject({ x: 300, width: 300, height: 720 });
    expect(m0.y).toBeCloseTo(40, 5);
  });

  it("passes pages through unchanged when a cluster has no rects", async () => {
    const src = await PDFDocument.create();
    src.addPage([300, 400]);
    const bytes = await src.save();
    const cluster = {
      id: "c",
      key: "k",
      label: "l",
      pageIndices: [0],
      aspect: 0.75,
      rects: [] as NormRect[],
    };
    const out = await exportCroppedPdf(bytes.buffer.slice(0), [cluster]);
    const outDoc = await PDFDocument.load(out);
    expect(outDoc.getPageCount()).toBe(1);
    expect(outDoc.getPage(0).getMediaBox()).toMatchObject({ width: 300, height: 400 });
  });
});

describe("toUserRect vs pdf.js geometry (rotation)", () => {
  const W = 400;
  const H = 600;
  const sampleRects: NormRect[] = [
    { id: "a", x: 0.0, y: 0.0, w: 0.5, h: 0.5 }, // top-left quadrant
    { id: "b", x: 0.25, y: 0.1, w: 0.5, h: 0.8 }, // centered column
    { id: "c", x: 0.6, y: 0.55, w: 0.35, h: 0.4 }, // bottom-right
  ];

  for (const rotation of [0, 90, 180, 270]) {
    it(`matches convertToPdfPoint at ${rotation}°`, async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([W, H]);
      if (rotation) page.setRotation(degrees(rotation));
      const bytes = await doc.save();

      const pdoc = await pdfjsDoc(bytes);
      const vp = (await pdoc.getPage(1)).getViewport({ scale: 1 });

      const cb = { x: 0, y: 0, width: W, height: H };
      for (const r of sampleRects) {
        // Oracle: convert all four display-pixel corners to PDF points,
        // then take the bounding box.
        const corners: [number, number][] = [
          [r.x, r.y],
          [r.x + r.w, r.y],
          [r.x + r.w, r.y + r.h],
          [r.x, r.y + r.h],
        ];
        const pts = corners.map(([a, b]) => vp.convertToPdfPoint(a * vp.width, b * vp.height));
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        const expected = {
          x: Math.min(...xs),
          y: Math.min(...ys),
          width: Math.max(...xs) - Math.min(...xs),
          height: Math.max(...ys) - Math.min(...ys),
        };

        const got = toUserRect(cb, rotation, r);
        expect(got.x).toBeCloseTo(expected.x, 4);
        expect(got.y).toBeCloseTo(expected.y, 4);
        expect(got.width).toBeCloseTo(expected.width, 4);
        expect(got.height).toBeCloseTo(expected.height, 4);
      }
    });
  }
});
