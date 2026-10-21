'use client';

import { useEffect, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { ArrowLeft, ArrowRight, FileImage, ImagePlus, X } from 'lucide-react';
import ToolShell from '@/app/components/ToolShell';
import { auth } from '@/lib/firebase/config';
import { logToolAction } from '@/lib/history';
import { downloadPdfBytes, formatFileSize } from '@/app/utils/files';
import { toEmbeddableImage } from '@/app/utils/imageNormalize';
import { moveItem, useReorder } from '@/app/utils/useReorder';

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/bmp';

const PAGE_SIZES = {
    fit: null,
    a4: [595.28, 841.89],
    letter: [612, 792],
};

const MARGINS = { none: 0, small: 20, large: 48 };

export default function JpgToPdfPage() {
    const [images, setImages] = useState([]);
    const [pageSize, setPageSize] = useState('a4');
    const [orientation, setOrientation] = useState('auto');
    const [margin, setMargin] = useState('small');
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState('');
    const addInputRef = useRef(null);
    const imagesRef = useRef(images);
    const { itemProps, stateClass } = useReorder((from, to) => setImages((prev) => moveItem(prev, from, to)));

    useEffect(() => {
        imagesRef.current = images;
    }, [images]);

    // Release preview URLs when leaving the page.
    useEffect(() => () => imagesRef.current.forEach((img) => URL.revokeObjectURL(img.url)), []);

    const handleFiles = (newFiles) => {
        setError('');
        setResult('');
        const validFiles = newFiles.filter((file) => file.type.startsWith('image/'));
        if (validFiles.length !== newFiles.length) {
            setError('Some files were skipped because they are not images.');
        }
        setImages((prev) => [
            ...prev,
            ...validFiles.map((file) => ({ id: crypto.randomUUID(), file, name: file.name, url: URL.createObjectURL(file) })),
        ]);
    };

    const removeImage = (id) => {
        setImages((prev) => {
            const removed = prev.find((img) => img.id === id);
            if (removed) URL.revokeObjectURL(removed.url);
            return prev.filter((img) => img.id !== id);
        });
    };

    const reset = () => {
        images.forEach((img) => URL.revokeObjectURL(img.url));
        setImages([]);
        setError('');
        setResult('');
    };

    const convertToPDF = async () => {
        if (!images.length) return;

        try {
            setIsProcessing(true);
            setError('');
            setResult('');

            const pdfDoc = await PDFDocument.create();

            for (const imgObj of images) {
                let image;
                try {
                    image = await toEmbeddableImage(imgObj.file);
                } catch {
                    throw new Error(`"${imgObj.name}" could not be read as an image.`);
                }
                const embedded = image.kind === 'png' ? await pdfDoc.embedPng(image.bytes) : await pdfDoc.embedJpg(image.bytes);
                const { width: imgW, height: imgH } = embedded.scale(1);

                const preset = PAGE_SIZES[pageSize];
                if (!preset) {
                    const page = pdfDoc.addPage([imgW, imgH]);
                    page.drawImage(embedded, { x: 0, y: 0, width: imgW, height: imgH });
                    continue;
                }

                const landscape = orientation === 'landscape' || (orientation === 'auto' && imgW > imgH);
                const [pw, ph] = landscape ? [preset[1], preset[0]] : preset;
                const m = MARGINS[margin];
                const scale = Math.min((pw - m * 2) / imgW, (ph - m * 2) / imgH);
                const w = imgW * scale;
                const h = imgH * scale;
                const page = pdfDoc.addPage([pw, ph]);
                page.drawImage(embedded, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
            }

            downloadPdfBytes(await pdfDoc.save(), `images_${images.length}.pdf`);
            setResult(`Created a ${images.length}-page PDF — downloaded.`);

            const user = auth.currentUser;
            if (user) {
                logToolAction(user.uid, 'jpg-to-pdf', 'Image to PDF', `converted_${images.length}_images.pdf`);
            }
        } catch (err) {
            console.error(err);
            setError(err.message || 'An error occurred while converting images to PDF.');
        } finally {
            setIsProcessing(false);
        }
    };

    const totalSize = images.reduce((sum, img) => sum + img.file.size, 0);

    return (
        <ToolShell
            toolId="jpg-to-pdf"
            stage={images.length ? 'work' : 'select'}
            error={error}
            onReset={reset}
            dropzone={{
                accept: IMAGE_ACCEPT,
                multiple: true,
                onFiles: handleFiles,
                title: 'Select images',
                hint: 'JPG, PNG, WebP, GIF or BMP — drop as many as you like',
                icon: ImagePlus,
            }}
            workspaceTitle={`${images.length} ${images.length === 1 ? 'image' : 'images'}`}
            workspaceSubtitle={`${formatFileSize(totalSize)} · drag to reorder pages`}
            workspaceActions={
                <>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => addInputRef.current?.click()}>
                        <ImagePlus size={15} /> Add images
                    </button>
                    <input
                        ref={addInputRef}
                        type="file"
                        accept={IMAGE_ACCEPT}
                        multiple
                        hidden
                        onChange={(e) => {
                            handleFiles(Array.from(e.target.files || []));
                            e.target.value = '';
                        }}
                    />
                </>
            }
            panel={{
                subtitle: 'Page layout',
                body: (
                    <>
                        <div className="field">
                            <span className="field-label">Page size</span>
                            <div className="segmented" role="group" aria-label="Page size">
                                <button type="button" aria-pressed={pageSize === 'a4'} onClick={() => setPageSize('a4')}>A4</button>
                                <button type="button" aria-pressed={pageSize === 'letter'} onClick={() => setPageSize('letter')}>Letter</button>
                                <button type="button" aria-pressed={pageSize === 'fit'} onClick={() => setPageSize('fit')}>Fit image</button>
                            </div>
                        </div>
                        {pageSize !== 'fit' ? (
                            <>
                                <div className="field">
                                    <span className="field-label">Orientation</span>
                                    <div className="segmented" role="group" aria-label="Orientation">
                                        <button type="button" aria-pressed={orientation === 'auto'} onClick={() => setOrientation('auto')}>Auto</button>
                                        <button type="button" aria-pressed={orientation === 'portrait'} onClick={() => setOrientation('portrait')}>Portrait</button>
                                        <button type="button" aria-pressed={orientation === 'landscape'} onClick={() => setOrientation('landscape')}>Landscape</button>
                                    </div>
                                </div>
                                <div className="field">
                                    <span className="field-label">Margin</span>
                                    <div className="segmented" role="group" aria-label="Margin">
                                        <button type="button" aria-pressed={margin === 'none'} onClick={() => setMargin('none')}>None</button>
                                        <button type="button" aria-pressed={margin === 'small'} onClick={() => setMargin('small')}>Small</button>
                                        <button type="button" aria-pressed={margin === 'large'} onClick={() => setMargin('large')}>Large</button>
                                    </div>
                                </div>
                            </>
                        ) : null}
                    </>
                ),
                result,
                action: { label: 'Convert to PDF', icon: FileImage, busyLabel: 'Converting…', onClick: convertToPDF, busy: isProcessing },
            }}
        >
            <div className="image-grid">
                {images.map((img, index) => (
                    <div key={img.id} className={`image-tile ${stateClass(index)}`} {...itemProps(index)}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.url} alt={img.name} draggable={false} />
                        <span className="image-tile-name">{index + 1}. {img.name}</span>
                        <div className="page-tile-tools">
                            <button type="button" className="tile-btn" onClick={() => setImages((prev) => moveItem(prev, index, index - 1))} disabled={index === 0} aria-label="Move earlier">
                                <ArrowLeft size={14} />
                            </button>
                            <button type="button" className="tile-btn" onClick={() => setImages((prev) => moveItem(prev, index, index + 1))} disabled={index === images.length - 1} aria-label="Move later">
                                <ArrowRight size={14} />
                            </button>
                            <button type="button" className="tile-btn danger" onClick={() => removeImage(img.id)} aria-label={`Remove ${img.name}`}>
                                <X size={14} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </ToolShell>
    );
}
