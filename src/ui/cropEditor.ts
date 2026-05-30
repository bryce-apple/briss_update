/**
 * Interactive crop-rectangle editor for a single cluster.
 *
 * Renders the cluster's ghost preview and lets the user draw, move, resize and
 * delete normalized crop rectangles on top of it. Everything outside the
 * rectangles is dimmed to show what will be cropped away. Rectangles are stored
 * back onto the cluster in normalized [0,1] coordinates so they apply to every
 * page in the group.
 */
import type { Cluster, NormRect } from "../types";

type Mode =
  | { kind: "idle" }
  | { kind: "draw"; rect: NormRect; startX: number; startY: number }
  | { kind: "move"; rect: NormRect; offX: number; offY: number }
  | { kind: "resize"; rect: NormRect; corner: Corner };

type Corner = "nw" | "ne" | "sw" | "se";
const HANDLE = 8; // px hit radius for corner handles

let rectCounter = 0;
const newId = () => `rect-${rectCounter++}`;

export class CropEditor {
  readonly element: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cluster: Cluster;
  private mode: Mode = { kind: "idle" };
  private selected: NormRect | null = null;
  private onChange: () => void;

  constructor(cluster: Cluster, preview: HTMLCanvasElement, onChange: () => void) {
    this.cluster = cluster;
    this.onChange = onChange;

    this.canvas = document.createElement("canvas");
    this.canvas.width = preview.width;
    this.canvas.height = preview.height;
    this.canvas.className = "crop-canvas";
    this.canvas.tabIndex = 0;
    this.ctx = this.canvas.getContext("2d")!;

    const stack = document.createElement("div");
    stack.className = "crop-stack";
    stack.style.aspectRatio = `${preview.width} / ${preview.height}`;
    stack.appendChild(preview);
    preview.className = "preview-img";
    stack.appendChild(this.canvas);
    this.element = stack;

    this.bind();
    this.draw();
  }

  /** Remove the currently selected rectangle, if any. */
  deleteSelected(): void {
    if (!this.selected) return;
    this.cluster.rects = this.cluster.rects.filter((r) => r !== this.selected);
    this.selected = null;
    this.draw();
    this.onChange();
  }

  // ---- geometry helpers (normalized <-> canvas px) ----

  private toNorm(ev: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: clamp01((ev.clientX - rect.left) / rect.width),
      y: clamp01((ev.clientY - rect.top) / rect.height),
    };
  }

  private cornerAt(p: { x: number; y: number }, r: NormRect): Corner | null {
    const W = this.canvas.getBoundingClientRect().width;
    const H = this.canvas.getBoundingClientRect().height;
    const near = (cx: number, cy: number) =>
      Math.abs((p.x - cx) * W) < HANDLE && Math.abs((p.y - cy) * H) < HANDLE;
    if (near(r.x, r.y)) return "nw";
    if (near(r.x + r.w, r.y)) return "ne";
    if (near(r.x, r.y + r.h)) return "sw";
    if (near(r.x + r.w, r.y + r.h)) return "se";
    return null;
  }

  private rectAt(p: { x: number; y: number }): NormRect | null {
    // Topmost first so later (visually on-top) rects win.
    for (let i = this.cluster.rects.length - 1; i >= 0; i--) {
      const r = this.cluster.rects[i];
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return r;
    }
    return null;
  }

  // ---- interaction ----

  private bind(): void {
    this.canvas.addEventListener("pointerdown", (ev) => this.onDown(ev));
    this.canvas.addEventListener("pointermove", (ev) => this.onMove(ev));
    this.canvas.addEventListener("pointerup", (ev) => this.onUp(ev));
    this.canvas.addEventListener("keydown", (ev) => {
      if (ev.key === "Delete" || ev.key === "Backspace") {
        ev.preventDefault();
        this.deleteSelected();
      }
    });
  }

  private onDown(ev: PointerEvent): void {
    this.canvas.setPointerCapture(ev.pointerId);
    this.canvas.focus();
    const p = this.toNorm(ev);

    // Resize handle on the selected rect takes priority.
    if (this.selected) {
      const corner = this.cornerAt(p, this.selected);
      if (corner) {
        this.mode = { kind: "resize", rect: this.selected, corner };
        return;
      }
    }

    const hit = this.rectAt(p);
    if (hit) {
      this.selected = hit;
      this.mode = { kind: "move", rect: hit, offX: p.x - hit.x, offY: p.y - hit.y };
      this.draw();
      return;
    }

    // Empty space → start a new rectangle.
    const rect: NormRect = { id: newId(), x: p.x, y: p.y, w: 0, h: 0 };
    this.cluster.rects.push(rect);
    this.selected = rect;
    this.mode = { kind: "draw", rect, startX: p.x, startY: p.y };
  }

  private onMove(ev: PointerEvent): void {
    const p = this.toNorm(ev);

    if (this.mode.kind === "idle") {
      // Cursor feedback.
      const overHandle = this.selected && this.cornerAt(p, this.selected);
      this.canvas.style.cursor = overHandle
        ? `${this.selected ? this.cornerAt(p, this.selected) : ""}-resize`
        : this.rectAt(p)
          ? "move"
          : "crosshair";
      return;
    }

    if (this.mode.kind === "draw") {
      const { rect, startX, startY } = this.mode;
      rect.x = Math.min(startX, p.x);
      rect.y = Math.min(startY, p.y);
      rect.w = Math.abs(p.x - startX);
      rect.h = Math.abs(p.y - startY);
    } else if (this.mode.kind === "move") {
      const { rect, offX, offY } = this.mode;
      rect.x = clamp01(p.x - offX, rect.w);
      rect.y = clamp01(p.y - offY, rect.h);
    } else if (this.mode.kind === "resize") {
      this.applyResize(this.mode.rect, this.mode.corner, p);
    }
    this.draw();
  }

  private onUp(ev: PointerEvent): void {
    try {
      this.canvas.releasePointerCapture(ev.pointerId);
    } catch {
      /* pointer was never captured */
    }
    if (this.mode.kind === "draw") {
      const r = this.mode.rect;
      // Discard accidental tiny rectangles.
      if (r.w < 0.01 || r.h < 0.01) {
        this.cluster.rects = this.cluster.rects.filter((x) => x !== r);
        this.selected = null;
      }
    }
    if (this.mode.kind !== "idle") this.onChange();
    this.mode = { kind: "idle" };
    this.draw();
  }

  private applyResize(rect: NormRect, corner: Corner, p: { x: number; y: number }): void {
    const right = rect.x + rect.w;
    const bottom = rect.y + rect.h;
    if (corner === "nw") {
      rect.x = Math.min(p.x, right);
      rect.y = Math.min(p.y, bottom);
      rect.w = right - rect.x;
      rect.h = bottom - rect.y;
    } else if (corner === "ne") {
      rect.y = Math.min(p.y, bottom);
      rect.w = Math.max(0, p.x - rect.x);
      rect.h = bottom - rect.y;
    } else if (corner === "sw") {
      rect.x = Math.min(p.x, right);
      rect.w = right - rect.x;
      rect.h = Math.max(0, p.y - rect.y);
    } else {
      rect.w = Math.max(0, p.x - rect.x);
      rect.h = Math.max(0, p.y - rect.y);
    }
  }

  // ---- rendering ----

  private draw(): void {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Dim everything, then punch out clear holes where the crop rects are.
    ctx.fillStyle = "rgba(20, 24, 33, 0.55)";
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "destination-out";
    for (const r of this.cluster.rects) {
      ctx.fillRect(r.x * W, r.y * H, r.w * W, r.h * H);
    }
    ctx.globalCompositeOperation = "source-over";

    // Outlines, labels and handles.
    this.cluster.rects.forEach((r, i) => {
      const x = r.x * W;
      const y = r.y * H;
      const w = r.w * W;
      const h = r.h * H;
      const isSel = r === this.selected;
      ctx.lineWidth = 2;
      ctx.strokeStyle = isSel ? "#22d3ee" : "#38bdf8";
      ctx.strokeRect(x, y, w, h);

      // Order badge — important because rect order == output page order.
      ctx.fillStyle = isSel ? "#22d3ee" : "#38bdf8";
      ctx.font = "bold 14px system-ui, sans-serif";
      ctx.fillText(String(i + 1), x + 6, y + 18);

      if (isSel) {
        for (const [cx, cy] of [
          [x, y],
          [x + w, y],
          [x, y + h],
          [x + w, y + h],
        ]) {
          ctx.fillStyle = "#0b1120";
          ctx.fillRect(cx - HANDLE / 2, cy - HANDLE / 2, HANDLE, HANDLE);
          ctx.strokeStyle = "#22d3ee";
          ctx.lineWidth = 2;
          ctx.strokeRect(cx - HANDLE / 2, cy - HANDLE / 2, HANDLE, HANDLE);
        }
      }
    });
  }
}

function clamp01(v: number, size = 0): number {
  return Math.max(0, Math.min(1 - size, v));
}
