'use client';

export async function convertPdfToImage(pdfBytes, pageNum = 1, format = 'png') {
    try {
        // Dynamically import pdfjs-dist to avoid SSR issues with DOMMatrix
        const pdfjsLib = await import('pdfjs-dist');

        // Configure worker
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
        }

        // Load the PDF document
        const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
        const pdf = await loadingTask.promise;

        // Get the page (pdfjs pages are 1-indexed)
        const page = await pdf.getPage(pageNum);

        // Set scale for better quality (2x for high DPI)
        const viewport = page.getViewport({ scale: 2 });

        // Create canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        // Render page to canvas
        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;

        // Convert to data URL
        const mimeType = format === 'jpeg' || format === 'jpg' ? 'image/jpeg' : 'image/png';
        return canvas.toDataURL(mimeType, 0.95);
    } catch (error) {
        console.error('Error converting PDF to image:', error);
        throw error;
    }
}
