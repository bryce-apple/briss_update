/**
 * Headless tests for the Organize-mode export: deletion (omission), reordering
 * and per-page rotation. Pages are created with distinct widths so we can
 * identify them by width in the output.
 */
import { describe, it, expect } from "vitest";
import { PDFDocument, degrees } from "pdf-lib";
import { exportOrganizedPdf, type PagePlan } from "../src/pdf/organize";

async function makeDoc(widths: number[]): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  for (const w of widths) doc.addPage([w, 200]);
  const bytes = await doc.save();
  return bytes.buffer.slice(0) as ArrayBuffer;
}

const widths = (doc: PDFDocument) => doc.getPages().map((p) => Math.round(p.getMediaBox().width));

describe("exportOrganizedPdf", () => {
  it("keeps only the planned pages, in the planned order (delete + reorder)", async () => {
    const src = await makeDoc([101, 102, 103, 104, 105]);
    // Drop pages 102 and 104; reverse the rest.
    const plan: PagePlan[] = [
      { srcIndex: 4, rotate: 0 },
      { srcIndex: 2, rotate: 0 },
      { srcIndex: 0, rotate: 0 },
    ];
    const out = await PDFDocument.load(await exportOrganizedPdf(src, plan));
    expect(out.getPageCount()).toBe(3);
    expect(widths(out)).toEqual([105, 103, 101]);
  });

  it("adds rotation to the chosen pages", async () => {
    const src = await makeDoc([101, 102]);
    const plan: PagePlan[] = [
      { srcIndex: 0, rotate: 90 },
      { srcIndex: 1, rotate: 0 },
    ];
    const out = await PDFDocument.load(await exportOrganizedPdf(src, plan));
    expect(out.getPage(0).getRotation().angle).toBe(90);
    expect(out.getPage(1).getRotation().angle).toBe(0);
  });

  it("accumulates onto a page's existing rotation", async () => {
    const doc = await PDFDocument.create();
    const p = doc.addPage([101, 200]);
    p.setRotation(degrees(90));
    const src = (await doc.save()).buffer.slice(0) as ArrayBuffer;

    const out = await PDFDocument.load(
      await exportOrganizedPdf(src, [{ srcIndex: 0, rotate: 270 }]),
    );
    // 90 existing + 270 added = 360 ≡ 0.
    expect(out.getPage(0).getRotation().angle).toBe(0);
  });
});
