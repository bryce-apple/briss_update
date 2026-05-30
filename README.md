# Briss Web

A browser-based reimagining of [Briss](https://briss.sourceforge.net/) (**BR**ight **I**mage **S**nippet **S**ire) — the classic tool for cropping many PDF pages at once by stacking similar pages into a single "ghost" preview and drawing crop areas over them.

Everything runs **entirely in your browser**. The PDF is read locally, cropped locally, and downloaded locally — nothing is ever uploaded to a server.

## How it works

1. **Open a PDF.** Pages are grouped ("clustered") by visual shape — size, rotation and odd/even position — just like the original Briss. The left- and right-hand pages of a scanned book land in their own groups.
2. **Read the ghost preview.** For each group, a sample of pages is rendered on top of one another with a *darken* blend, so content that repeats across pages (body text, page numbers) shows solid while page-specific content fades. This is the overlay you crop against.
3. **Draw crop rectangles.** Drag to draw, drag inside to move, drag the corners to resize, `Delete` to remove. A rectangle applies to **every page** in its group.
4. **Split pages (optional).** Draw **two** rectangles on a group and each source page is split into two output pages, in order — perfect for book scans where two facing pages were captured in one image.
5. **Crop & Download.** Each rectangle becomes an output page cropped via its PDF `CropBox`/`MediaBox`. Cropping is non-destructive: real text and vector content are preserved at full quality and the file stays small.

## Tech

- **[pdf.js](https://mozilla.github.io/pdf.js/)** — renders source pages for the previews.
- **[pdf-lib](https://pdf-lib.js.org/)** — writes the cropped output. MIT-licensed, which sidesteps the AGPL/iText licensing problem that stalled the original Briss.
- **[Vite](https://vitejs.dev/)** + vanilla TypeScript — no framework, fast to build on.

## Develop

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check + production build into dist/
npm run preview  # preview the production build
```

## Status

First working version. Implemented: clustering, ghost previews, multi-rectangle
crop editing, page splitting, non-destructive export.

Not yet implemented (candidates for next): auto-crop margin detection,
copy/paste rectangles between groups, and tuned handling of 90°/270° rotated
scans (the 0°/180° paths are exercised; rotated paths are best-effort).

## Source layout

```
src/
  main.ts            app wiring: file input, panels, export, download
  types.ts           data model (Cluster, NormRect, PageInfo)
  pdf/
    pdfjs.ts         pdf.js setup + loader
    cluster.ts       page metadata + clustering ("ClusterManager")
    preview.ts       stacked ghost-preview rendering
    export.ts        cropped PDF writer + page splitting ("CropManager")
  ui/
    cropEditor.ts    draw / move / resize crop rectangles
  styles.css
```
