# PDF Editor with Image & Signature Overlay

A powerful, client-side PDF editor built with Next.js that allows you to overlay images and signatures onto PDF documents.

## Features

### 📄 PDF Management
- **Upload PDF**: Drag and drop or select any PDF file.
- **Preview**: View your PDF pages directly in the browser.
- **Download**: Generate and download the modified PDF with all overlays embedded.

### 🖼️ Image Overlay
- **Multi-Image Support**: Add multiple images to a single PDF page.
- **Drag & Drop**: Freely move images around the page.
- **Resize & Stretch**: 
  - **Corner Handles**: Resize proportionally.
  - **Side Handles**: Stretch images horizontally or vertically (unlocked aspect ratio).
  - **Visual Feedback**: Handles appear on selection and hide on deselect.
- **Delete**: Right-click context menu to remove images.

### ✍️ Signature Support
- **Smart Upload**: dedicated "Add Signature" button.
- **Auto-Background Removal**: Automatically detects and removes white backgrounds from uploaded signature images using client-side processing (Canvas API).
- **Privacy Focused**: All processing happens in your browser; no data is sent to a server.

## Tech Stack
- **Framework**: Next.js 14 (App Router)
- **PDF Processing**: `pdf-lib`
- **PDF Rendering**: `react-pdf`
- **Interactions**: `react-draggable`, `re-resizable`
- **Styling**: Vanilla CSS (Responsive & Modern)
- **Icons**: `lucide-react`

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost/3000) with your browser to see the result.

## How It Works

1. **Upload a PDF** - Click or drag-and-drop your PDF file
2. **Add Content**:
   - **Images**: Click "Add Image" to overlay images
   - **Signatures**: Click "Add Signature" to add a signature (white backgrounds automatically removed)
   - **Text**: Click "Add Text" to add custom text with a modern modal dialog
3. **Position & Edit**:
   - **Drag** any element to reposition it
   - **Resize** images by selecting them and dragging the corner/edge handles
   - **Edit Text**: Double-click text to edit it inline
4. **Download** - Click "Download PDF" to get your modified documentges.

## License

MIT
