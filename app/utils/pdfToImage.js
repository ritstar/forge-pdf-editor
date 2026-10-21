'use client';

import { pdfjs } from './pdfWorker';

export function canvasToBlob(canvas, mimeType, quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode image'))),
            mimeType,
            quality,
        );
    });
}

// Renders one page and returns an image Blob. Uses toBlob rather than toDataURL, which is
// synchronous, blocks the main thread and inflates memory by ~33% with base64.
export async function renderPdfPageToBlob(pdf, pageNum, { scale = 2, format = 'png', quality = 0.92 } = {}) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const context = canvas.getContext('2d');

    const isJpeg = format === 'jpeg' || format === 'jpg';
    if (isJpeg) {
        // JPEG has no alpha; without a fill, transparent areas turn black.
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
    }

    await page.render({ canvasContext: context, viewport }).promise;
    page.cleanup();

    const blob = await canvasToBlob(canvas, isJpeg ? 'image/jpeg' : 'image/png', quality);
    canvas.width = 0;
    canvas.height = 0;
    return blob;
}

export async function convertPdfToImage(pdfBytes, pageNum = 1, format = 'png') {
    const pdf = await pdfjs.getDocument({ data: pdfBytes }).promise;
    try {
        return await renderPdfPageToBlob(pdf, pageNum, { format, quality: 0.95 });
    } finally {
        pdf.destroy();
    }
}
