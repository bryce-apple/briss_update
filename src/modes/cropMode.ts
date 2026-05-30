/**
 * Crop mode — the Briss-style workflow: load a PDF, cluster similar pages,
 * show a stacked ghost preview per group, draw crop rectangles (two = split),
 * and export a cropped PDF. Fully self-contained: it builds and owns its DOM.
 */
import { loadPdf } from "../pdf/pdfjs";
import { readPageInfos, clusterPages } from "../pdf/cluster";
import { renderClusterPreview } from "../pdf/preview";
import { exportCroppedPdf } from "../pdf/export";
import { CropEditor } from "../ui/cropEditor";
import { createFileZone, downloadPdf, looksLikePdf, makeButton } from "../ui/widgets";
import type { Cluster, NormRect } from "../types";

const HINT = `<p>Drop a PDF here, or <span class="link" data-pick>choose a file</span>.</p>
  <p class="hint">Pages of the same size are stacked into one ghost preview. Draw one or
  more crop rectangles per group — two rectangles split each page in two (great for book scans).</p>`;

export function createCropMode(): HTMLElement {
  const root = document.createElement("section");
  root.className = "mode";

  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  const statusEl = document.createElement("div");
  statusEl.className = "status";
  statusEl.hidden = true;
  const clustersEl = document.createElement("div");
  clustersEl.className = "clusters";

  let sourceBytes: ArrayBuffer | null = null;
  let clusters: Cluster[] = [];
  let sourceName = "document";
  let rectClipboard: NormRect[] | null = null;

  const { openButton, zone } = createFileZone(HINT, (file) => void handleFile(file));
  const exportBtn = makeButton("Crop & Download", "btn primary", () => void doExport());
  exportBtn.disabled = true;
  toolbar.append(openButton, exportBtn);
  root.append(toolbar, zone, statusEl, clustersEl);

  function setStatus(msg: string, busy = false): void {
    statusEl.hidden = false;
    statusEl.textContent = msg;
    statusEl.classList.toggle("busy", busy);
  }

  function updateExportState(): void {
    exportBtn.disabled = !sourceBytes || !clusters.some((c) => c.rects.length > 0);
  }

  async function handleFile(file: File): Promise<void> {
    if (!looksLikePdf(file)) {
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
      zone.hidden = true;

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

    const tools = document.createElement("div");
    tools.className = "cluster-tools";
    const del = makeButton("Delete selected", "btn small", () => editor.deleteSelected());
    const copy = makeButton("Copy rects", "btn small", () => {
      rectClipboard = editor.getRects();
      setStatus(
        rectClipboard.length
          ? `Copied ${rectClipboard.length} rectangle${
              rectClipboard.length === 1 ? "" : "s"
            }. Paste onto another group.`
          : "This group has no rectangles to copy yet.",
      );
    });
    const paste = makeButton("Paste rects", "btn small", () => {
      if (!rectClipboard || rectClipboard.length === 0) {
        setStatus("Nothing copied yet — use Copy rects on a group first.");
        return;
      }
      editor.setRects(rectClipboard);
      setStatus(
        `Pasted ${rectClipboard.length} rectangle${rectClipboard.length === 1 ? "" : "s"}.`,
      );
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
      downloadPdf(bytes, `${sourceName}-cropped.pdf`);
      setStatus("Done — your cropped PDF has been downloaded.");
    } catch (err) {
      console.error(err);
      setStatus(`Export failed: ${(err as Error).message}`);
    } finally {
      updateExportState();
    }
  }

  return root;
}
