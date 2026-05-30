/**
 * Briss Web entry point — wires the file input, clustering, previews, crop
 * editors and export into a single page. No network, no backend: the PDF bytes
 * are read locally and the cropped result is generated and downloaded entirely
 * in the browser.
 */
import "./styles.css";
import { loadPdf } from "./pdf/pdfjs";
import { readPageInfos, clusterPages } from "./pdf/cluster";
import { renderClusterPreview } from "./pdf/preview";
import { exportCroppedPdf } from "./pdf/export";
import { CropEditor } from "./ui/cropEditor";
import type { Cluster, NormRect } from "./types";

const fileInput = document.getElementById("file-input") as HTMLInputElement;
const dropzone = document.getElementById("dropzone") as HTMLElement;
const clustersEl = document.getElementById("clusters") as HTMLElement;
const statusEl = document.getElementById("status") as HTMLElement;
const exportBtn = document.getElementById("export-btn") as HTMLButtonElement;

let sourceBytes: ArrayBuffer | null = null;
let clusters: Cluster[] = [];
let sourceName = "document.pdf";
const editors: CropEditor[] = [];
/** Cross-cluster clipboard for copy/paste of crop rectangles. */
let rectClipboard: NormRect[] | null = null;

function setStatus(msg: string, busy = false): void {
  statusEl.hidden = false;
  statusEl.textContent = msg;
  statusEl.classList.toggle("busy", busy);
}

function updateExportState(): void {
  const anyRects = clusters.some((c) => c.rects.length > 0);
  exportBtn.disabled = !sourceBytes || !anyRects;
}

async function handleFile(file: File): Promise<void> {
  if (file.type && file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
    setStatus(`"${file.name}" doesn't look like a PDF.`);
    return;
  }
  sourceName = file.name.replace(/\.pdf$/i, "");
  setStatus(`Reading ${file.name}…`, true);

  try {
    sourceBytes = await file.arrayBuffer();
    const doc = await loadPdf(sourceBytes);
    setStatus(`Analyzing ${doc.numPages} pages…`, true);

    const infos = await readPageInfos(doc);
    clusters = clusterPages(infos);

    clustersEl.innerHTML = "";
    editors.length = 0;
    dropzone.hidden = true;

    for (const cluster of clusters) {
      const preview = await renderClusterPreview(doc, cluster);
      clustersEl.appendChild(buildClusterPanel(cluster, preview));
    }

    setStatus(
      `${clusters.length} page group${clusters.length === 1 ? "" : "s"} found. ` +
        `Draw crop rectangles, then Crop & Download.`,
    );
    updateExportState();
  } catch (err) {
    console.error(err);
    setStatus(`Could not open that PDF: ${(err as Error).message}`);
  }
}

function buildClusterPanel(cluster: Cluster, preview: HTMLCanvasElement): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "cluster";

  const head = document.createElement("div");
  head.className = "cluster-head";
  head.innerHTML = `<span class="cluster-label">${cluster.label}</span>
    <span class="cluster-count">${cluster.pageIndices.length} page${
      cluster.pageIndices.length === 1 ? "" : "s"
    }</span>`;

  const editor = new CropEditor(cluster, preview, updateExportState);
  editors.push(editor);

  const tools = document.createElement("div");
  tools.className = "cluster-tools";

  const del = document.createElement("button");
  del.className = "btn small";
  del.textContent = "Delete selected";
  del.addEventListener("click", () => editor.deleteSelected());

  const copy = document.createElement("button");
  copy.className = "btn small";
  copy.textContent = "Copy rects";
  copy.addEventListener("click", () => {
    rectClipboard = editor.getRects();
    setStatus(
      rectClipboard.length
        ? `Copied ${rectClipboard.length} rectangle${rectClipboard.length === 1 ? "" : "s"}. Paste onto another group.`
        : "This group has no rectangles to copy yet.",
    );
  });

  const paste = document.createElement("button");
  paste.className = "btn small";
  paste.textContent = "Paste rects";
  paste.addEventListener("click", () => {
    if (!rectClipboard || rectClipboard.length === 0) {
      setStatus("Nothing copied yet — use Copy rects on a group first.");
      return;
    }
    editor.setRects(rectClipboard);
    setStatus(`Pasted ${rectClipboard.length} rectangle${rectClipboard.length === 1 ? "" : "s"}.`);
  });

  const hint = document.createElement("span");
  hint.className = "tool-hint";
  hint.textContent = "Drag to draw · drag inside to move · corners to resize · two rects = split";
  tools.append(del, copy, paste, hint);

  panel.append(head, editor.element, tools);
  return panel;
}

async function doExport(): Promise<void> {
  if (!sourceBytes) return;
  exportBtn.disabled = true;
  setStatus("Cropping and building your PDF…", true);
  try {
    const bytes = await exportCroppedPdf(sourceBytes.slice(0), clusters);
    // Copy into a plain ArrayBuffer so the Blob constructor is happy across
    // TS lib versions (pdf-lib returns Uint8Array<ArrayBufferLike>).
    const buf = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buf).set(bytes);
    const blob = new Blob([buf], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sourceName}-cropped.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Done — your cropped PDF has been downloaded.");
  } catch (err) {
    console.error(err);
    setStatus(`Export failed: ${(err as Error).message}`);
  } finally {
    updateExportState();
  }
}

// ---- wiring ----

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void handleFile(file);
});

exportBtn.addEventListener("click", () => void doExport());

["dragover", "dragenter"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add("dragging");
  }),
);
["dragleave", "drop"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragging");
  }),
);
dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (file) void handleFile(file);
});
