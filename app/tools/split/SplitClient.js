'use client';

import { useMemo, useState } from 'react';
import { PDFDocument } from '@cantoo/pdf-lib';
import { zipSync } from 'fflate';
import { Document } from 'react-pdf';
import { Split } from 'lucide-react';
import '@/app/utils/pdfWorker';
import ToolShell from '@/app/components/ToolShell';
import LazyPage from '@/app/components/ui/LazyPage';
import { auth } from '@/lib/firebase/config';
import { logToolAction } from '@/lib/history';
import { downloadBlob, downloadPdfBytes, formatFileSize, isPdfFile, stripExtension } from '@/app/utils/files';
import { formatPages, parseRanges, rangesToIndices } from '@/app/utils/pageRanges';

const MODES = [
    { value: 'ranges', title: 'By page ranges', detail: 'Type pages like 1-3, 5, 8-last' },
    { value: 'select', title: 'Pick pages', detail: 'Click the pages you want' },
    { value: 'every', title: 'Every N pages', detail: 'Equal parts, in a ZIP' },
];

// Tints that tell output files apart in the preview.
const PART_TINTS = ['var(--accent)', 'var(--cat-organize)', 'var(--cat-optimize)', 'var(--cat-convert-to)', 'var(--cat-edit)', 'var(--cat-convert-from)'];

async function buildPdf(source, indices) {
    const out = await PDFDocument.create();
    (await out.copyPages(source, indices)).forEach((page) => out.addPage(page));
    return out.save();
}

export default function SplitPdfPage() {
    const [file, setFile] = useState(null);
    const [totalPages, setTotalPages] = useState(0);
    const [mode, setMode] = useState('ranges');
    const [rangeText, setRangeText] = useState('');
    const [selected, setSelected] = useState(() => new Set());
    const [everyN, setEveryN] = useState(1);
    const [merge, setMerge] = useState(false);
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
            const pages = pdfDoc.getPageCount();
            setFile(selectedFile);
            setTotalPages(pages);
            setRangeText(pages > 1 ? `1-${Math.ceil(pages / 2)}, ${Math.ceil(pages / 2) + 1}-${pages}` : '1');
            setSelected(new Set());
            setEveryN(1);
        } catch (err) {
            console.error(err);
            setError('Could not read the PDF file. It might be corrupted or encrypted.');
        }
    };

    const reset = () => {
        setFile(null);
        setTotalPages(0);
        setError('');
        setResult('');
    };

    // The output files: each a label and the 0-based pages it holds.
    const plan = useMemo(() => {
        if (!totalPages) return { parts: [], error: '' };
        if (mode === 'ranges') {
            const { ranges, error: parseError } = parseRanges(rangeText, totalPages);
            if (parseError) return { parts: [], error: parseError };
            const parts = ranges.map((range) => ({
                label: range.from === range.to ? `page_${range.from}` : `pages_${range.from}-${range.to}`,
                indices: rangesToIndices([range]),
            }));
            return { parts: merge ? [{ label: 'pages_' + formatPages(parts.flatMap((p) => p.indices.map((i) => i + 1))).replace(/, /g, '_'), indices: parts.flatMap((p) => p.indices) }] : parts, error: '' };
        }
        if (mode === 'select') {
            const indices = [...selected].sort((a, b) => a - b);
            if (!indices.length) return { parts: [], error: 'Click at least one page.' };
            if (merge) return { parts: [{ label: `pages_${formatPages(indices.map((i) => i + 1)).replace(/, /g, '_')}`, indices }], error: '' };
            return { parts: indices.map((i) => ({ label: `page_${i + 1}`, indices: [i] })), error: '' };
        }
        const n = Math.max(1, Math.min(totalPages, Math.floor(Number(everyN)) || 1));
        const parts = [];
        for (let start = 0; start < totalPages; start += n) {
            const indices = Array.from({ length: Math.min(n, totalPages - start) }, (_, i) => start + i);
            parts.push({ label: indices.length === 1 ? `page_${start + 1}` : `pages_${start + 1}-${start + indices.length}`, indices });
        }
        return { parts, error: '' };
    }, [everyN, merge, mode, rangeText, selected, totalPages]);

    // Which output part each page lands in (first one wins), for the preview.
    const partOfPage = useMemo(() => {
        const map = new Map();
        plan.parts.forEach((part, index) => part.indices.forEach((page) => map.has(page) || map.set(page, index)));
        return map;
    }, [plan]);

    const splitPDF = async () => {
        if (!file || plan.error || !plan.parts.length) return;

        try {
            setIsProcessing(true);
            setError('');
            setResult('');

            const source = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
            const baseName = stripExtension(file.name);

            if (plan.parts.length === 1) {
                const [part] = plan.parts;
                downloadPdfBytes(await buildPdf(source, part.indices), `${baseName}_${part.label}.pdf`);
                setResult(`Saved ${part.indices.length} ${part.indices.length === 1 ? 'page' : 'pages'} as one PDF — downloaded.`);
            } else {
                const entries = {};
                const used = new Set();
                for (const part of plan.parts) {
                    let name = `${baseName}_${part.label}.pdf`;
                    for (let n = 2; used.has(name); n += 1) name = `${baseName}_${part.label}_${n}.pdf`;
                    used.add(name);
                    entries[name] = await buildPdf(source, part.indices);
                }
                // PDF streams are already compressed; storing (level 0) makes zipping near-instant.
                downloadBlob(new Blob([zipSync(entries, { level: 0 })], { type: 'application/zip' }), `${baseName}_split.zip`);
                setResult(`Created ${plan.parts.length} PDFs — ZIP downloaded.`);
            }

            const user = auth?.currentUser;
            if (user) {
                logToolAction(user.uid, 'split-pdf', 'Split PDF', file.name).catch(console.error);
            }
        } catch (err) {
            console.error('PDF Split Error:', err);
            setError(err.message || 'An error occurred while splitting the PDF.');
        } finally {
            setIsProcessing(false);
        }
    };

    const togglePage = (index) => {
        setResult('');
        if (mode === 'select') {
            setSelected((prev) => {
                const next = new Set(prev);
                if (next.has(index)) next.delete(index);
                else next.add(index);
                return next;
            });
        }
    };

    const outputs = plan.parts.length;
    const actionLabel = outputs > 1 ? `Split into ${outputs} files` : 'Extract pages';

    return (
        <ToolShell
            toolId="split-pdf"
            stage={file ? 'work' : 'select'}
            error={error}
            onReset={reset}
            dropzone={{ accept: 'application/pdf,.pdf', onFiles: handleFiles, title: 'Select a PDF', hint: 'or drop it here' }}
            workspaceTitle={file?.name}
            workspaceSubtitle={file ? `${totalPages} pages · ${formatFileSize(file.size)}${mode === 'select' ? ' · click pages to pick them' : ''}` : null}
            workspaceActions={mode === 'select' && file ? (
                <>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelected(new Set(Array.from({ length: totalPages }, (_, i) => i)))}>Select all</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())} disabled={!selected.size}>Clear</button>
                </>
            ) : null}
            panel={{
                subtitle: 'Choose how to split',
                body: (
                    <>
                        <div className="option-list" role="group" aria-label="Split mode">
                            {MODES.map((m) => (
                                <button key={m.value} type="button" className="option-card" aria-pressed={mode === m.value} onClick={() => { setMode(m.value); setResult(''); }}>
                                    <span className="option-dot" />
                                    <span><strong>{m.title}</strong><span>{m.detail}</span></span>
                                </button>
                            ))}
                        </div>
                        {mode === 'ranges' ? (
                            <div className="field">
                                <label className="field-label" htmlFor="split-ranges">Ranges</label>
                                <input
                                    id="split-ranges"
                                    className="input"
                                    value={rangeText}
                                    onChange={(e) => { setRangeText(e.target.value); setResult(''); }}
                                    placeholder="e.g. 1-3, 5, 8-last"
                                    aria-invalid={Boolean(plan.error)}
                                />
                                <span className="field-hint">Each range becomes its own PDF. Use “last” for the final page.</span>
                            </div>
                        ) : null}
                        {mode === 'every' ? (
                            <div className="field">
                                <label className="field-label" htmlFor="split-every">Pages per file</label>
                                <input id="split-every" className="input" type="number" min={1} max={totalPages} value={everyN} onChange={(e) => setEveryN(e.target.value)} />
                            </div>
                        ) : null}
                        {mode !== 'every' ? (
                            <label className="check-row">
                                <input type="checkbox" checked={merge} onChange={(e) => setMerge(e.target.checked)} />
                                Put everything in one PDF
                            </label>
                        ) : null}
                        {plan.error ? <span className="error-text">{plan.error}</span> : null}
                        {!plan.error && outputs ? (
                            <div className="summary-list">
                                <div><span>Output</span><strong>{outputs === 1 ? '1 PDF' : `${outputs} PDFs in a ZIP`}</strong></div>
                                <div><span>Pages</span><strong>{plan.parts.reduce((sum, p) => sum + p.indices.length, 0)}</strong></div>
                            </div>
                        ) : null}
                    </>
                ),
                result,
                action: {
                    label: actionLabel,
                    icon: Split,
                    busyLabel: 'Splitting…',
                    onClick: splitPDF,
                    disabled: Boolean(plan.error) || !outputs,
                    busy: isProcessing,
                },
            }}
        >
            {file ? (
                <Document file={file} loading={<div className="skeleton" style={{ height: 240 }} />} onLoadError={() => setError('Could not preview this PDF.')}>
                    <div className="page-grid">
                        {Array.from({ length: totalPages }, (_, i) => i).map((index) => {
                            const part = partOfPage.get(index);
                            const included = part !== undefined;
                            const tint = PART_TINTS[(part ?? 0) % PART_TINTS.length];
                            return (
                                <button
                                    key={index}
                                    type="button"
                                    className={`page-tile ${included ? 'is-included' : 'is-removed'}`}
                                    onClick={() => togglePage(index)}
                                    style={included ? { '--part': tint } : undefined}
                                    aria-pressed={included}
                                    aria-label={`Page ${index + 1}${included ? `, in file ${part + 1}` : ''}`}
                                    tabIndex={mode === 'select' ? 0 : -1}
                                    data-static={mode !== 'select' || undefined}
                                >
                                    <div className="page-tile-frame">
                                        <div className="page-tile-sheet"><LazyPage pageNumber={index + 1} width={130} /></div>
                                        {included && outputs > 1 ? <span className="badge page-tile-badge part-badge">File {part + 1}</span> : null}
                                    </div>
                                    <span className="page-tile-label">Page {index + 1}</span>
                                </button>
                            );
                        })}
                    </div>
                </Document>
            ) : null}
        </ToolShell>
    );
}
