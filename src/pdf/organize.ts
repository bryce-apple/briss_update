/**
 * Page-organizer export: build a new PDF from a plan that says which source
 * pages to keep, in what order, and with what added rotation. Deleting a page is
 * simply leaving it out of the plan; reordering is reordering the plan; rotating
 * is a non-zero `rotate` (added to whatever rotation the page already has).
 *
 * This is independent of the crop pipeline — the Organize tool is its own thing.
 */
import { PDFDocument, degrees } from "pdf-lib";

export interface PagePlan {
  /** Zero-based index of the page in the source document. */
  srcIndex: number;
  /** Degrees to add to the page's existing rotation (0/90/180/270). */
  rotate: number;
}

export async function exportOrganizedPdf(
  sourceBytes: ArrayBuffer,
  plan: PagePlan[],
): Promise<Uint8Array> {
  const src = await PDFDocument.load(sourceBytes);
  const out = await PDFDocument.create();

  // copyPages preserves the given order (and duplicates, though we don't use
  // them here), so this handles reordering for free.
  const copied = await out.copyPages(
    src,
    plan.map((p) => p.srcIndex),
  );

  copied.forEach((page, i) => {
    const add = ((plan[i].rotate % 360) + 360) % 360;
    if (add) {
      const current = page.getRotation().angle;
      page.setRotation(degrees((current + add) % 360));
    }
    out.addPage(page);
  });

  return out.save();
}
