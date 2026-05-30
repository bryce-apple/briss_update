/**
 * Organize mode — a standalone page manager (independent of cropping): load a
 * PDF, see every page as a thumbnail, then delete pages you don't want, drag to
 * reorder, and rotate individual pages. Export writes a new PDF reflecting those
 * edits. Re-upload a cropped PDF here to clean it up, or vice versa.
 */
import { loadPdf, type PDFDocumentProxy } from "../pdf/pdfjs";
import { renderPageThumb } from "../pdf/thumbnail";
import { exportOrganizedPdf, type PagePlan } from "../pdf/organize";
import { createFileZone, downloadPdf, looksLikePdf, makeButton } from "../ui/widgets";

const HINT = `<p>Drop a PDF here, or <span class="link" data-pick>choose a file</span>.</p>
  <p class="hint">See every page as a thumbnail, then delete pages, drag to reorder, and
  rotate individual pages. Then export a tidied-up PDF.</p>`;

const THUMB_WIDTH = 200;

interface PageState {
  srcIndex: number;
  rotate: number;
  deleted: boolean;
  card: HTMLDivElement;
  frame: HTMLDivElement;
  numberEl: HTMLSpanElement;
}

export function createOrganizeMode(): HTMLElement {
  const root = document.createElement("section");
  root.className = "mode";

  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  const statusEl = document.createElement("div");
  statusEl.className = "status";
  statusEl.hidden = true;
  const grid = document.createElement("div");
  grid.className = "thumb-grid";

  let sourceBytes: ArrayBuffer | null = null;
  let doc: PDFDocumentProxy | null = null;
  let sourceName = "document";
  let pages: PageState[] = [];
  let dragSrc: number | null = null;

  const { openButton, zone } = createFileZone(HINT, (file) => void handleFile(file));
  const exportBtn = makeButton("Save organized PDF", "btn primary", () => void doExport());
  exportBtn.disabled = true;
  toolbar.append(openButton, exportBtn);
  root.append(toolbar, zone, statusEl, grid);

  function setStatus(msg: string, busy = false): void {
    statusEl.hidden = false;
    statusEl.textContent = msg;
    statusEl.classList.toggle("busy", busy);
  }

  function updateExportState(): void {
    const kept = pages.filter((p) => !p.deleted).length;
    exportBtn.disabled = !sourceBytes || kept === 0;
    if (sourceBytes) {
      const removed = pages.length - kept;
      setStatus(
        `${kept} page${kept === 1 ? "" : "s"} kept` +
          (removed ? `, ${removed} marked for deletion.` : ". Delete, reorder or rotate as needed."),
      );
    }
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
      doc = await loadPdf(sourceBytes);
      setStatus(`Rendering ${doc.numPages} page thumbnails…`, true);

      pages = [];
      grid.innerHTML = "";
      zone.hidden = true;

      for (let i = 0; i < doc.numPages; i++) {
        pages.push(await buildCard(i));
      }
      renderOrder();
      updateExportState();
    } catch (err) {
      console.error(err);
      setStatus(`Could not open that PDF: ${(err as Error).message}`);
    }
  }

  async function buildCard(srcIndex: number): Promise<PageState> {
    const card = document.createElement("div");
    card.className = "thumb-card";
    card.draggable = true;

    const frame = document.createElement("div");
    frame.className = "thumb-frame";
    const canvas = await renderPageThumb(doc!, srcIndex, THUMB_WIDTH);
    frame.appendChild(canvas);

    const bar = document.createElement("div");
    bar.className = "thumb-bar";
    const numberEl = document.createElement("span");
    numberEl.className = "thumb-num";

    const rotL = makeButton("⟲", "btn icon", () => rotate(state, -90));
    rotL.title = "Rotate left";
    const rotR = makeButton("⟳", "btn icon", () => rotate(state, 90));
    rotR.title = "Rotate right";
    const del = makeButton("🗑", "btn icon danger", () => toggleDelete(state));
    del.title = "Delete / restore page";
    bar.append(numberEl, rotL, rotR, del);

    card.append(frame, bar);

    const state: PageState = { srcIndex, rotate: 0, deleted: false, card, frame, numberEl };
    wireDrag(state);
    return state;
  }

  function wireDrag(state: PageState): void {
    const { card } = state;
    card.addEventListener("dragstart", (e) => {
      dragSrc = state.srcIndex;
      card.classList.add("dragging");
      e.dataTransfer?.setData("text/plain", String(state.srcIndex));
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    });
    card.addEventListener("dragend", () => {
      dragSrc = null;
      for (const p of pages) p.card.classList.remove("dragging", "drop-target");
    });
    card.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (dragSrc !== null && dragSrc !== state.srcIndex) card.classList.add("drop-target");
    });
    card.addEventListener("dragleave", () => card.classList.remove("drop-target"));
    card.addEventListener("drop", (e) => {
      e.preventDefault();
      card.classList.remove("drop-target");
      if (dragSrc !== null && dragSrc !== state.srcIndex) moveBefore(dragSrc, state.srcIndex);
    });
  }

  /** Move the page with srcIndex `from` to just before the page `to`. */
  function moveBefore(from: number, to: number): void {
    const fromIdx = pages.findIndex((p) => p.srcIndex === from);
    const moved = pages.splice(fromIdx, 1)[0];
    const toIdx = pages.findIndex((p) => p.srcIndex === to);
    pages.splice(toIdx, 0, moved);
    renderOrder();
  }

  function toggleDelete(state: PageState): void {
    state.deleted = !state.deleted;
    state.card.classList.toggle("deleted", state.deleted);
    updateExportState();
  }

  async function rotate(state: PageState, delta: number): Promise<void> {
    state.rotate = (((state.rotate + delta) % 360) + 360) % 360;
    const canvas = await renderPageThumb(doc!, state.srcIndex, THUMB_WIDTH, state.rotate);
    state.frame.replaceChildren(canvas);
  }

  /** Re-append cards in model order and refresh the page-number labels. */
  function renderOrder(): void {
    for (const p of pages) grid.appendChild(p.card);
    pages.forEach((p, i) => {
      p.numberEl.textContent = `Page ${i + 1}`;
    });
  }

  async function doExport(): Promise<void> {
    if (!sourceBytes) return;
    const plan: PagePlan[] = pages
      .filter((p) => !p.deleted)
      .map((p) => ({ srcIndex: p.srcIndex, rotate: p.rotate }));
    if (plan.length === 0) {
      setStatus("Every page is marked for deletion — nothing to save.");
      return;
    }
    exportBtn.disabled = true;
    setStatus("Building your organized PDF…", true);
    try {
      const bytes = await exportOrganizedPdf(sourceBytes.slice(0), plan);
      downloadPdf(bytes, `${sourceName}-organized.pdf`);
      setStatus(`Done — saved ${plan.length} page${plan.length === 1 ? "" : "s"}.`);
    } catch (err) {
      console.error(err);
      setStatus(`Export failed: ${(err as Error).message}`);
    } finally {
      updateExportState();
    }
  }

  return root;
}
