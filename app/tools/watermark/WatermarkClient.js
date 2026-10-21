'use client';

import { useEffect, useRef, useState } from 'react';
import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import { Document } from 'react-pdf';
import { Stamp } from 'lucide-react';
import '@/app/utils/pdfWorker';
import ToolShell from '@/app/components/ToolShell';
import LazyPage from '@/app/components/ui/LazyPage';
import { makeTextEncoder } from '@/app/utils/pdfGenerator';
import { getPageFrame, visualToPdf } from '@/app/utils/pdfCoords';
import { auth } from '@/lib/firebase/config';
import { logToolAction } from '@/lib/history';
import { downloadPdfBytes, formatFileSize, isPdfFile, stripExtension } from '@/app/utils/files';

const COLORS = [
    { name: 'Gray', hex: '#808080', value: [0.5, 0.5, 0.5] },
    { name: 'Red', hex: '#dc2626', value: [0.86, 0.15, 0.15] },
    { name: 'Blue', hex: '#2563eb', value: [0.15, 0.39, 0.92] },
    { name: 'Black', hex: '#111827', value: [0.07, 0.09, 0.15] },
];

const PREVIEW_WIDTH = 340;

export default function WatermarkPage() {
    const [file, setFile] = useState(null);
    const [totalPages, setTotalPages] = useState(0);
    const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');
    const [opacity, setOpacity] = useState(0.25);
    const [color, setColor] = useState(COLORS[0]);
    const [previewSize, setPreviewSize] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState('');

    const handleFiles = async ([selectedFile]) => {
        setError('');
        setResult('');
        if (!isPdfFile(selectedFile)) {
            setError('Please select a valid PDF file.');
            return;
        }

        try {
            const pdfDoc = await PDFDocument.load(await selectedFile.arrayBuffer(), { ignoreEncryption: true });
            setFile(selectedFile);
            setTotalPages(pdfDoc.getPageCount());
        } catch (err) {
            console.error(err);
            setError('Could not read the PDF file. It might be corrupted.');
        }
    };

    const processPDF = async () => {
        if (!file || !watermarkText.trim()) return;

        try {
            setIsProcessing(true);
            setError('');
            setResult('');

            const pdfDoc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
            const helveticaFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

            // Helvetica only covers WinAnsi; unsupported characters would abort the export.
            const text = makeTextEncoder(helveticaFont)(watermarkText.trim());
            const widthAtOne = helveticaFont.widthOfTextAtSize(text, 1);

            pdfDoc.getPages().forEach((page) => {
                const frame = getPageFrame(page);
                // Scale the text to fit along the visible diagonal, whatever the page size.
                const diagonal = Math.hypot(frame.width, frame.height);
                const fontSize = Math.max(10, Math.min(72, (diagonal * 0.7) / widthAtOne));
                const textWidth = widthAtOne * fontSize;
                const capHeight = helveticaFont.heightAtSize(fontSize, { descender: false });

                // Read bottom-left to top-right as displayed; add /Rotate so rotated pages match.
                const angle = (Math.atan2(frame.height, frame.width) * 180) / Math.PI + frame.rotation;
                const rad = (angle * Math.PI) / 180;
                const center = visualToPdf(frame, frame.width / 2, frame.height / 2);

                page.drawText(text, {
                    // Shift from the center by half the rotated text box.
                    x: center.x - (textWidth / 2) * Math.cos(rad) + (capHeight / 2) * Math.sin(rad),
                    y: center.y - (textWidth / 2) * Math.sin(rad) - (capHeight / 2) * Math.cos(rad),
                    size: fontSize,
                    font: helveticaFont,
                    color: rgb(...color.value),
                    opacity: Number(opacity),
                    rotate: degrees(angle),
                });
            });

            downloadPdfBytes(await pdfDoc.save(), `${stripExtension(file.name)}_watermarked.pdf`);
            setResult(`Watermarked ${totalPages} ${totalPages === 1 ? 'page' : 'pages'} — downloaded.`);

            const user = auth?.currentUser;
            if (user) {
                logToolAction(user.uid, 'watermark', 'Add Watermark', file.name).catch(console.error);
            }
        } catch (err) {
            console.error(err);
            setError('An error occurred while processing the PDF.');
        } finally {
            setIsProcessing(false);
        }
    };

    // Approximate the output on the first page for instant feedback.
    const preview = previewSize ? (() => {
        const diagonal = Math.hypot(previewSize.width, previewSize.height);
        const angle = (Math.atan2(previewSize.height, previewSize.width) * 180) / Math.PI;
        const approxWidthAtOne = 0.62 * Math.max(1, watermarkText.trim().length);
        const fontSize = Math.max(6, Math.min(72 * (previewSize.width / 595), (diagonal * 0.7) / approxWidthAtOne));
        return { angle, fontSize };
    })() : null;

    return (
        <ToolShell
            toolId="watermark"
            stage={file ? 'work' : 'select'}
            error={error}
            onReset={() => { setFile(null); setError(''); setResult(''); setPreviewSize(null); }}
            dropzone={{ accept: 'application/pdf,.pdf', onFiles: handleFiles, title: 'Select a PDF', hint: 'or drop it here' }}
            workspaceTitle="Preview"
            workspaceSubtitle={file ? `${file.name} · ${totalPages} pages · ${formatFileSize(file.size)}` : null}
            panel={{
                subtitle: 'Applied to every page',
                body: (
                    <>
                        <div className="field">
                            <label className="field-label" htmlFor="wm-text">Watermark text</label>
                            <input id="wm-text" className="input" value={watermarkText} maxLength={60} onChange={(e) => setWatermarkText(e.target.value)} placeholder="e.g. CONFIDENTIAL" />
                        </div>
                        <div className="field">
                            <span className="field-label">Color</span>
                            <div className="color-swatches">
                                {COLORS.map((c) => (
                                    <button key={c.name} type="button" className="swatch" style={{ background: c.hex }} aria-pressed={color.name === c.name} aria-label={c.name} onClick={() => setColor(c)} />
                                ))}
                            </div>
                        </div>
                        <div className="field">
                            <label className="field-label" htmlFor="wm-opacity">Opacity · {Math.round(opacity * 100)}%</label>
                            <input id="wm-opacity" type="range" min="0.05" max="1" step="0.05" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
                        </div>
                    </>
                ),
                result,
                action: {
                    label: 'Add watermark',
                    icon: Stamp,
                    busyLabel: 'Applying…',
                    onClick: processPDF,
                    disabled: !watermarkText.trim(),
                    busy: isProcessing,
                },
            }}
        >
            {file ? (
                <div style={{ display: 'grid', placeItems: 'center', padding: '12px 0' }}>
                    <Document file={file} loading={<div className="skeleton" style={{ width: PREVIEW_WIDTH, height: 440 }} />}>
                        <div className="page-tile-sheet" style={{ position: 'relative' }}>
                            <LazyPage pageNumber={1} width={PREVIEW_WIDTH} />
                            <PreviewSizer onSize={setPreviewSize} />
                            {preview && watermarkText.trim() ? (
                                <div
                                    aria-hidden="true"
                                    style={{
                                        position: 'absolute',
                                        left: '50%',
                                        top: '50%',
                                        transform: `translate(-50%, -50%) rotate(${-preview.angle}deg)`,
                                        fontFamily: 'Helvetica, Arial, sans-serif',
                                        fontWeight: 700,
                                        fontSize: preview.fontSize,
                                        lineHeight: 1,
                                        whiteSpace: 'nowrap',
                                        color: color.hex,
                                        opacity,
                                        pointerEvents: 'none',
                                    }}
                                >
                                    {watermarkText.trim()}
                                </div>
                            ) : null}
                        </div>
                    </Document>
                    <p className="small muted" style={{ marginTop: 12 }}>Preview of page 1</p>
                </div>
            ) : null}
        </ToolShell>
    );
}

// Measures the rendered preview page so the overlay can match its proportions.
function PreviewSizer({ onSize }) {
    const ref = useRef(null);

    useEffect(() => {
        const sheet = ref.current?.parentElement;
        if (!sheet) return undefined;
        const observer = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;
            if (!width || height < 50) return;
            onSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
        });
        observer.observe(sheet);
        return () => observer.disconnect();
    }, [onSize]);

    return <span ref={ref} hidden />;
}
