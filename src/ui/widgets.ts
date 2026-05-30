/**
 * Small shared UI helpers used by both the Crop and Organize modes.
 */

/** Trigger a browser download of PDF bytes, fully client-side. */
export function downloadPdf(bytes: Uint8Array, filename: string): void {
  // Copy into a plain ArrayBuffer so the Blob constructor is happy across
  // TS lib versions (pdf-lib returns Uint8Array<ArrayBufferLike>).
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  const blob = new Blob([buf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Create a button element with a click handler. */
export function makeButton(
  label: string,
  className: string,
  onClick: () => void,
): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = className;
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

/** True if a dropped/selected file looks like a PDF. */
export function looksLikePdf(file: File): boolean {
  return !file.type || file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export interface FileZone {
  /** Hidden <input type=file>; also reachable via the open button and zone. */
  input: HTMLInputElement;
  /** "Open PDF…" button for a toolbar. */
  openButton: HTMLLabelElement;
  /** Large drop target with hint text, for the empty state. */
  zone: HTMLElement;
}

/**
 * Build a reusable file picker: a hidden input wired to an "Open PDF…" toolbar
 * button and a drag-and-drop zone, all calling `onFile` with the chosen file.
 */
export function createFileZone(hintHtml: string, onFile: (file: File) => void): FileZone {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/pdf,.pdf";
  input.hidden = true;
  input.addEventListener("change", () => {
    const f = input.files?.[0];
    if (f) onFile(f);
    input.value = ""; // allow re-picking the same file name
  });

  const openButton = document.createElement("label");
  openButton.className = "btn";
  openButton.textContent = "Open PDF…";
  openButton.appendChild(input);

  const zone = document.createElement("div");
  zone.className = "dropzone";
  zone.innerHTML = hintHtml;
  const pick = zone.querySelector<HTMLElement>("[data-pick]");
  pick?.addEventListener("click", () => input.click());

  for (const evt of ["dragover", "dragenter"]) {
    zone.addEventListener(evt, (e) => {
      e.preventDefault();
      zone.classList.add("dragging");
    });
  }
  for (const evt of ["dragleave", "drop"]) {
    zone.addEventListener(evt, (e) => {
      e.preventDefault();
      zone.classList.remove("dragging");
    });
  }
  zone.addEventListener("drop", (e) => {
    const f = (e as DragEvent).dataTransfer?.files?.[0];
    if (f) onFile(f);
  });

  return { input, openButton, zone };
}
