# Forge PDF Editor

Forge PDF Editor is a client-side PDF editor built with Next.js. It supports page-by-page editing with text, images, and signatures, then exports a clean final PDF.

## Live App

- Production: https://forge-pdf-editor.vercel.app

## Features

### PDF Workflow
- Upload PDF via file picker or drag and drop
- Multi-page navigation (Previous/Next + range slider)
- Page-aware editing (elements are stored per page)

### Editing Tools
- Add text blocks
- Add image overlays
- Add signatures with automatic white-background removal (PNG output)
- Drag and resize overlays directly on the canvas
- Select layers from a per-page layers panel
- Duplicate and delete selected elements
- Clear current page or clear all pages

### Text Controls
- Inline text editing (double-click)
- Text panel editing
- Font size adjustment
- Text color picker
- Bold toggle

### Productivity
- Undo / Redo buttons
- Keyboard shortcuts:
  - `Ctrl/Cmd + Z` undo
  - `Ctrl/Cmd + Shift + Z` redo
  - Arrow keys to nudge selected element
  - `Delete/Backspace` to remove selected element

### Export
- Download full edited PDF
- Export current page as PNG
- Export current page as JPG

## Tech Stack

- Next.js 16 (App Router)
- React 19
- `react-pdf` + `pdfjs-dist` for PDF rendering
- `pdf-lib` for PDF generation
- Vanilla CSS (custom responsive UI)
- `lucide-react` icons

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Build

```bash
npm run build
npm run start
```

## Notes

- All edits happen client-side in the browser.
- Source PDFs and overlays are not uploaded to any app backend.

## License

MIT
