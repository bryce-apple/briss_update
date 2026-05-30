# Briss Web

A browser-based reimagining of [Briss](https://briss.sourceforge.net/) (**BR**ight **I**mage **S**nippet **S**ire) — the classic tool for cropping many PDF pages at once by stacking similar pages into a single "ghost" preview and drawing crop areas over them.

Everything runs **entirely in your browser**. The PDF is read locally, processed locally, and downloaded locally — nothing is ever uploaded to a server.

## Two tools, one page

A tab at the top switches between two independent tools. Each loads its own PDF and exports its own result — use them separately, in any order (you can re-open a cropped file in Organize, or vice versa).

- **Crop** — the Briss-style overlay cropping described below.
- **Organize** — a page manager: see every page as a thumbnail, then **delete** pages (covers, blanks), **drag to reorder**, and **rotate** individual pages, then save a tidied-up PDF.

## How cropping works

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
npm test         # run the headless test suite
```

## Tests

`npm test` runs a headless [Vitest](https://vitest.dev/) suite covering the
browser-independent core:

- **Clustering** — identical pages split into odd/even groups; differing sizes
  separate.
- **Page splitting** — two rectangles on one source page produce two correctly
  cropped output pages, in order; empty clusters pass through unchanged.
- **Rotation math** — the normalized-rect → PDF-user-space mapping is checked at
  **0°, 90°, 180° and 270°** against pdf.js's own `viewport.convertToPdfPoint`
  as an independent oracle.
- **Organize export** — page deletion (omission), reordering, and additive
  per-page rotation.

The visual preview rendering and pointer interactions require a real browser, so
they are covered by the production build + manual use rather than the headless
suite.

## Status

Implemented:

- **Crop tool** — clustering, ghost previews, multi-rectangle crop editing, page
  splitting (book scans), copy/paste of rectangles between groups,
  rotation-correct non-destructive export (verified for all four rotations).
- **Organize tool** — thumbnail grid, delete pages, drag-to-reorder, per-page
  rotate, export.

Not yet implemented (candidates for next): auto-crop margin detection, and
end-to-end verification driving the assembled UI in a headless browser (blocked
in the current sandbox by the browser-download network policy).

## Source layout

```
src/
  main.ts            app wiring + tab switching between the two tools
  types.ts           data model (Cluster, NormRect, PageInfo)
  modes/
    cropMode.ts      Crop tool: clustering, previews, crop editing, export
    organizeMode.ts  Organize tool: thumbnail grid, delete/reorder/rotate
  pdf/
    pdfjs.ts         pdf.js setup + loader
    cluster.ts       page metadata + clustering ("ClusterManager")
    preview.ts       stacked ghost-preview rendering
    thumbnail.ts     single-page thumbnail rendering (Organize)
    export.ts        cropped PDF writer + page splitting ("CropManager")
    organize.ts      reorder / delete / rotate PDF writer
  ui/
    cropEditor.ts    draw / move / resize crop rectangles
    widgets.ts       shared file-picker / download / button helpers
  styles.css
```
