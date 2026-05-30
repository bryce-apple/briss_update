/**
 * Thin wrapper around pdf.js. pdf.js handles *rendering* source pages to a
 * canvas (so we can build the ghost previews); pdf-lib handles writing the
 * cropped output. We only configure the worker once here.
 */
import * as pdfjsLib from "pdfjs-dist";
// Vite resolves this to a hashed URL for the worker bundle.
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorker;

export type PDFDocumentProxy = pdfjsLib.PDFDocumentProxy;
export type PDFPageProxy = pdfjsLib.PDFPageProxy;

/** Load a PDF from raw bytes. The bytes stay entirely in the browser. */
export async function loadPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  // pdf.js transfers/consumes the buffer, so hand it a copy to keep the
  // original bytes intact for the pdf-lib export step.
  const task = pdfjsLib.getDocument({ data: data.slice(0) });
  return task.promise;
}
