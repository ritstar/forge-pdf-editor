'use client';

import { useRef, useState } from 'react';
import { PDFDocument } from '@cantoo/pdf-lib';
import { ImagePlus, Stamp, Type, X } from 'lucide-react';
import ToolShell from '@/app/components/ToolShell';
import PagePreview from '@/app/components/ui/PagePreview';
import { auth } from '@/lib/firebase/config';
import { logToolAction } from '@/lib/history';
import { downloadPdfBytes, formatFileSize, isPdfFile, stripExtension } from '@/app/utils/files';
import { toEmbeddableImage } from '@/app/utils/imageNormalize';
import { pageSet } from '@/app/utils/pageRanges';
import { applyWatermark } from '@/app/utils/stamping';
import { usePagePreview } from '@/app/utils/usePagePreview';

const COLORS = ['#808080', '#dc2626', '#2563eb', '#111827', '#16a34a'];
const ROTATIONS = [
    { value: 'diagonal', label: 'Diagonal' },
    { value: '0', label: '0°' },
    { value: '45', label: '45°' },
    { value: '-45', label: '−45°' },
    { value: '90', label: '90°' },
];
const POSITIONS = ['top-left', 'top-center', 'top-right', 'middle-left', 'center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'];

export default function WatermarkPage() {
    const [file, setFile] = useState(null);
    const [totalPages, setTotalPages] = useState(0);
    const [kind, setKind] = useState('text');
    const [text, setText] = useState('CONFIDENTIAL');
    const [family, setFamily] = useState('sans');
    const [bold, setBold] = useState(true);
    const [color, setColor] = useState(COLORS[0]);
    const [opacity, setOpacity] = useState(0.25);
    const [autoSize, setAutoSize] = useState(true);
    const [size, setSize] = useState(48);
    const [image, setImage] = useState(null);
    const [imageScale, setImageScale] = useState(0.4);
    const [rotation, setRotation] = useState('diagonal');
    const [layout, setLayout] = useState('single');
    const [position, setPosition] = useState('center');
    const [behind, setBehind] = useState(false);
    const [pagesText, setPagesText] = useState('');
    const [previewPage, setPreviewPage] = useState(0);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState('');
    const imageInputRef = useRef(null);

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
            setPreviewPage(0);
        } catch (err) {
            console.error(err);
            setError('Could not read the PDF file. It might be corrupted.');
        }
    };

    const chooseImage = async (selected) => {
        if (!selected) return;
        try {
            const embeddable = await toEmbeddableImage(selected);
            setImage({ ...embeddable, type: embeddable.kind, name: selected.name, url: URL.createObjectURL(selected) });
            setKind('image');
            setResult('');
        } catch {
            setError('That image could not be read. Try a PNG or JPG.');
        }
    };

    const options = {
        kind,
        text,
        family,
        bold,
        color,
        opacity,
        size: autoSize ? 'auto' : size,
        rotation: rotation === 'diagonal' ? 'diagonal' : Number(rotation),
        layout,
        position,
        behind,
        image: image ? { bytes: image.bytes, type: image.type } : null,
        imageScale,
    };
    const { pages: selectedPages, error: pagesError } = pageSet(pagesText, Math.max(totalPages, 1));
    const ready = kind === 'text' ? Boolean(text.trim()) : Boolean(image);

    const preview = usePagePreview({
        file,
        pageIndex: previewPage,
        key: JSON.stringify({ ...options, image: image?.name, pagesText }),
        apply: (doc, indices, sourceIndex) => (selectedPages.has(sourceIndex) && ready ? applyWatermark(doc, indices, options) : null),
    });

    const processPDF = async () => {
        if (!file || !ready || pagesError) return;

        try {
            setIsProcessing(true);
            setError('');
            setResult('');

            const pdfDoc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
            const indices = [...selectedPages].sort((a, b) => a - b);
            await applyWatermark(pdfDoc, indices, options);

            downloadPdfBytes(await pdfDoc.save(), `${stripExtension(file.name)}_watermarked.pdf`);
            setResult(`Watermarked ${indices.length} ${indices.length === 1 ? 'page' : 'pages'} — downloaded.`);

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

    return (
        <ToolShell
            toolId="watermark"
            stage={file ? 'work' : 'select'}
            error={error}
            onReset={() => { setFile(null); setError(''); setResult(''); }}
            dropzone={{ accept: 'application/pdf,.pdf', onFiles: handleFiles, title: 'Select a PDF', hint: 'or drop it here' }}
            workspaceTitle="Preview"
            workspaceSubtitle={file ? `${file.name} · ${totalPages} pages · ${formatFileSize(file.size)}` : null}
            panel={{
                subtitle: 'Text or image, any position',
                body: (
                    <>
                        <div className="segmented" role="group" aria-label="Watermark type">
                            <button type="button" aria-pressed={kind === 'text'} onClick={() => setKind('text')}><Type size={14} /> Text</button>
                            <button type="button" aria-pressed={kind === 'image'} onClick={() => (image ? setKind('image') : imageInputRef.current?.click())}><ImagePlus size={14} /> Image</button>
                        </div>
                        <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { chooseImage(e.target.files?.[0]); e.target.value = ''; }} />

                        {kind === 'text' ? (
                            <>
                                <div className="field">
                                    <label className="field-label" htmlFor="wm-text">Text</label>
                                    <input id="wm-text" className="input" value={text} maxLength={80} onChange={(e) => setText(e.target.value)} placeholder="e.g. CONFIDENTIAL" />
                                </div>
                                <div className="panel-row">
                                    <div className="segmented" role="group" aria-label="Font">
                                        {[['sans', 'Sans'], ['serif', 'Serif'], ['mono', 'Mono']].map(([value, label]) => (
                                            <button key={value} type="button" aria-pressed={family === value} onClick={() => setFamily(value)}>{label}</button>
                                        ))}
                                    </div>
                                    <button type="button" className={`btn btn-secondary btn-sm ${bold ? 'is-active' : ''}`} aria-pressed={bold} onClick={() => setBold((v) => !v)} style={{ flex: '0 0 auto', fontWeight: 700 }}>B</button>
                                </div>
                                <div className="field">
                                    <span className="field-label">Color</span>
                                    <div className="color-swatches">
                                        {COLORS.map((hex) => (
                                            <button key={hex} type="button" className="swatch" style={{ background: hex }} aria-pressed={color === hex} aria-label={`Color ${hex}`} onClick={() => setColor(hex)} />
                                        ))}
                                        <input type="color" className="color-input" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Custom color" />
                                    </div>
                                </div>
                                <div className="field">
                                    <div className="field-label-row">
                                        <label className="field-label" htmlFor="wm-size">Size · {autoSize ? 'fit page' : `${size} pt`}</label>
                                        <label className="check-row small"><input type="checkbox" checked={autoSize} onChange={(e) => setAutoSize(e.target.checked)} /> Auto</label>
                                    </div>
                                    <input id="wm-size" type="range" min="8" max="160" step="1" value={size} disabled={autoSize} onChange={(e) => setSize(Number(e.target.value))} />
                                </div>
                            </>
                        ) : (
                            <>
                                {image ? (
                                    <div className="file-item">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={image.url} alt="" className="wm-thumb" />
                                        <div className="file-item-body"><strong>{image.name}</strong></div>
                                        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => imageInputRef.current?.click()} aria-label="Choose another image"><ImagePlus size={15} /></button>
                                        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => { setImage(null); setKind('text'); }} aria-label="Remove image"><X size={15} /></button>
                                    </div>
                                ) : null}
                                <div className="field">
                                    <label className="field-label" htmlFor="wm-scale">Width · {Math.round(imageScale * 100)}% of page</label>
                                    <input id="wm-scale" type="range" min="0.05" max="1" step="0.01" value={imageScale} onChange={(e) => setImageScale(Number(e.target.value))} />
                                </div>
                            </>
                        )}

                        <div className="field">
                            <label className="field-label" htmlFor="wm-opacity">Opacity · {Math.round(opacity * 100)}%</label>
                            <input id="wm-opacity" type="range" min="0.05" max="1" step="0.05" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
                        </div>
                        <div className="field">
                            <span className="field-label">Rotation</span>
                            <div className="segmented" role="group" aria-label="Rotation">
                                {ROTATIONS.map((r) => (
                                    <button key={r.value} type="button" aria-pressed={rotation === r.value} onClick={() => setRotation(r.value)}>{r.label}</button>
                                ))}
                            </div>
                        </div>
                        <div className="field">
                            <span className="field-label">Placement</span>
                            <div className="segmented" role="group" aria-label="Layout">
                                <button type="button" aria-pressed={layout === 'single'} onClick={() => setLayout('single')}>Once</button>
                                <button type="button" aria-pressed={layout === 'tile'} onClick={() => setLayout('tile')}>Tiled</button>
                            </div>
                            {layout === 'single' ? (
                                <div className="position-grid nine" role="group" aria-label="Position">
                                    {POSITIONS.map((p) => (
                                        <button key={p} type="button" aria-pressed={position === p} aria-label={p.replace('-', ' ')} onClick={() => setPosition(p)} />
                                    ))}
                                </div>
                            ) : null}
                        </div>
                        <div className="field">
                            <label className="field-label" htmlFor="wm-pages">Pages</label>
                            <input id="wm-pages" className="input" value={pagesText} onChange={(e) => setPagesText(e.target.value)} placeholder={`All ${totalPages} pages — or e.g. 1-3, odd`} aria-invalid={Boolean(pagesError)} />
                            {pagesError ? <span className="error-text">{pagesError}</span> : null}
                        </div>
                        <label className="check-row">
                            <input type="checkbox" checked={behind} onChange={(e) => setBehind(e.target.checked)} />
                            Put it behind the page content
                        </label>
                    </>
                ),
                result,
                action: {
                    label: 'Add watermark',
                    icon: Stamp,
                    busyLabel: 'Applying…',
                    onClick: processPDF,
                    disabled: !ready || Boolean(pagesError),
                    busy: isProcessing,
                },
            }}
        >
            {file ? (
                <PagePreview
                    preview={preview}
                    page={previewPage}
                    pageCount={totalPages}
                    onPage={(p) => setPreviewPage(Math.max(0, Math.min(totalPages - 1, p)))}
                    note={!selectedPages.has(previewPage) && !pagesError ? 'This page is not watermarked with the pages you chose.' : behind ? 'Behind content: hidden where the page has a solid background (like scans).' : null}
                />
            ) : null}
        </ToolShell>
    );
}
