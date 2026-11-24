'use client';

import { useState } from 'react';
import { PDFDocument } from '@cantoo/pdf-lib';
import { Hash } from 'lucide-react';
import ToolShell from '@/app/components/ToolShell';
import PagePreview from '@/app/components/ui/PagePreview';
import { auth } from '@/lib/firebase/config';
import { logToolAction } from '@/lib/history';
import { downloadPdfBytes, formatFileSize, isPdfFile, stripExtension } from '@/app/utils/files';
import { pageSet } from '@/app/utils/pageRanges';
import { applyPageNumbers, formatNumber, NUMBER_FORMATS } from '@/app/utils/stamping';
import { usePagePreview } from '@/app/utils/usePagePreview';

const POSITIONS = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'];
const MARGINS = [
    { value: 18, label: 'Narrow' },
    { value: 30, label: 'Normal' },
    { value: 48, label: 'Wide' },
];
const COLORS = ['#111827', '#475569', '#1d4ed8', '#b91c1c'];

export default function PageNumbersClient() {
    const [file, setFile] = useState(null);
    const [totalPages, setTotalPages] = useState(0);
    const [position, setPosition] = useState('bottom-center');
    const [template, setTemplate] = useState('{n}');
    const [custom, setCustom] = useState(false);
    const [first, setFirst] = useState(1);
    const [pagesText, setPagesText] = useState('');
    const [family, setFamily] = useState('sans');
    const [bold, setBold] = useState(false);
    const [size, setSize] = useState(11);
    const [color, setColor] = useState(COLORS[0]);
    const [margin, setMargin] = useState(30);
    const [mirror, setMirror] = useState(false);
    const [previewPage, setPreviewPage] = useState(0);
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
            setPreviewPage(0);
        } catch (err) {
            console.error(err);
            setError('Could not read the PDF file. It might be corrupted.');
        }
    };

    const { pages: chosen, error: pagesError } = pageSet(pagesText, Math.max(totalPages, 1));
    const numbered = [...chosen].sort((a, b) => a - b);
    const options = { template, position, first, family, bold, size, color, margin, mirror };
    const firstNumber = Number(first) || 1;

    const preview = usePagePreview({
        file,
        pageIndex: previewPage,
        key: JSON.stringify({ ...options, pagesText }),
        apply: (doc, indices, sourceIndex) => {
            const order = numbered.indexOf(sourceIndex);
            if (order < 0) return null;
            // The scratch page is page 1 of its own PDF; number it as it will be in the result.
            return applyPageNumbers(doc, indices, options, {
                numberOf: () => firstNumber + order,
                sourceIndexOf: () => sourceIndex,
                total: firstNumber + numbered.length - 1,
            });
        },
    });

    const processPDF = async () => {
        if (!file || pagesError || !numbered.length) return;

        try {
            setIsProcessing(true);
            setError('');
            setResult('');

            const pdfDoc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
            await applyPageNumbers(pdfDoc, numbered, options);

            downloadPdfBytes(await pdfDoc.save(), `${stripExtension(file.name)}_numbered.pdf`);
            setResult(`Numbered ${numbered.length} ${numbered.length === 1 ? 'page' : 'pages'} — downloaded.`);

            const user = auth?.currentUser;
            if (user) {
                logToolAction(user.uid, 'page-numbers', 'Add Page Numbers', file.name).catch(console.error);
            }
        } catch (err) {
            console.error(err);
            setError('An error occurred while processing the PDF.');
        } finally {
            setIsProcessing(false);
        }
    };

    const lastNumber = firstNumber + Math.max(numbered.length, 1) - 1;

    return (
        <ToolShell
            toolId="page-numbers"
            stage={file ? 'work' : 'select'}
            error={error}
            onReset={() => { setFile(null); setError(''); setResult(''); }}
            dropzone={{ accept: 'application/pdf,.pdf', onFiles: handleFiles, title: 'Select a PDF', hint: 'or drop it here' }}
            workspaceTitle="Preview"
            workspaceSubtitle={file ? `${file.name} · ${totalPages} pages · ${formatFileSize(file.size)}` : null}
            panel={{
                subtitle: 'Position, format and style',
                body: (
                    <>
                        <div className="field">
                            <span className="field-label">Position</span>
                            <div className="position-grid" role="group" aria-label="Position">
                                {POSITIONS.map((p) => (
                                    <button key={p} type="button" aria-pressed={position === p} aria-label={p.replace('-', ' ')} onClick={() => setPosition(p)} />
                                ))}
                            </div>
                            {!position.endsWith('center') ? (
                                <label className="check-row small">
                                    <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} />
                                    Mirror on even pages (for printed books)
                                </label>
                            ) : null}
                        </div>
                        <div className="field">
                            <label className="field-label" htmlFor="pn-format">Format</label>
                            <select
                                id="pn-format"
                                className="select"
                                value={custom ? 'custom' : template}
                                onChange={(e) => {
                                    if (e.target.value === 'custom') {
                                        setCustom(true);
                                    } else {
                                        setCustom(false);
                                        setTemplate(e.target.value);
                                    }
                                }}
                            >
                                {NUMBER_FORMATS.map((f) => (
                                    <option key={f.value} value={f.value}>{formatNumber(f.value, firstNumber, lastNumber)}</option>
                                ))}
                                <option value="custom">Custom…</option>
                            </select>
                            {custom ? (
                                <>
                                    <input className="input" value={template} onChange={(e) => setTemplate(e.target.value)} maxLength={60} aria-label="Custom format" />
                                    <span className="field-hint">Use {'{n}'} for the page number and {'{total}'} for the last number, e.g. “Report · {'{n}'}”.</span>
                                </>
                            ) : null}
                        </div>
                        <div className="panel-row">
                            <div className="field">
                                <label className="field-label" htmlFor="pn-start">First number</label>
                                <input id="pn-start" className="input" type="number" min={0} value={first} onChange={(e) => setFirst(Math.max(0, Number(e.target.value) || 0))} />
                            </div>
                            <div className="field">
                                <label className="field-label" htmlFor="pn-size">Size (pt)</label>
                                <input id="pn-size" className="input" type="number" min={6} max={36} value={size} onChange={(e) => setSize(Math.min(36, Math.max(6, Number(e.target.value) || 11)))} />
                            </div>
                        </div>
                        <div className="field">
                            <label className="field-label" htmlFor="pn-pages">Pages to number</label>
                            <input id="pn-pages" className="input" value={pagesText} onChange={(e) => setPagesText(e.target.value)} placeholder={`All ${totalPages} — or e.g. 2-last to skip a cover`} aria-invalid={Boolean(pagesError)} />
                            {pagesError ? <span className="error-text">{pagesError}</span> : null}
                        </div>
                        <div className="field">
                            <span className="field-label">Style</span>
                            <div className="panel-row">
                                <div className="segmented" role="group" aria-label="Font">
                                    {[['sans', 'Sans'], ['serif', 'Serif'], ['mono', 'Mono']].map(([value, label]) => (
                                        <button key={value} type="button" aria-pressed={family === value} onClick={() => setFamily(value)}>{label}</button>
                                    ))}
                                </div>
                                <button type="button" className={`btn btn-secondary btn-sm ${bold ? 'is-active' : ''}`} aria-pressed={bold} onClick={() => setBold((v) => !v)} style={{ flex: '0 0 auto', fontWeight: 700 }}>B</button>
                            </div>
                            <div className="color-swatches">
                                {COLORS.map((hex) => (
                                    <button key={hex} type="button" className="swatch" style={{ background: hex }} aria-pressed={color === hex} aria-label={`Color ${hex}`} onClick={() => setColor(hex)} />
                                ))}
                                <input type="color" className="color-input" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Custom color" />
                            </div>
                        </div>
                        <div className="field">
                            <span className="field-label">Margin</span>
                            <div className="segmented" role="group" aria-label="Margin">
                                {MARGINS.map((m) => (
                                    <button key={m.value} type="button" aria-pressed={margin === m.value} onClick={() => setMargin(m.value)}>{m.label}</button>
                                ))}
                            </div>
                        </div>
                    </>
                ),
                result,
                action: { label: 'Add page numbers', icon: Hash, busyLabel: 'Numbering…', onClick: processPDF, disabled: Boolean(pagesError) || !numbered.length, busy: isProcessing },
            }}
        >
            {file ? (
                <PagePreview
                    preview={preview}
                    page={previewPage}
                    pageCount={totalPages}
                    onPage={(p) => setPreviewPage(Math.max(0, Math.min(totalPages - 1, p)))}
                    note={!chosen.has(previewPage) && !pagesError ? 'This page is not numbered with the pages you chose.' : null}
                />
            ) : null}
        </ToolShell>
    );
}
