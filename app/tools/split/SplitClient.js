'use client';

import { useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import { Document } from 'react-pdf';
import { Split } from 'lucide-react';
import '@/app/utils/pdfWorker';
import ToolShell from '@/app/components/ToolShell';
import LazyPage from '@/app/components/ui/LazyPage';
import { auth } from '@/lib/firebase/config';
import { logToolAction } from '@/lib/history';
import { downloadBlob, downloadPdfBytes, formatFileSize, isPdfFile, stripExtension } from '@/app/utils/files';

const MODES = [
    { value: 'range', title: 'Extract a range', detail: 'Save selected pages as one PDF' },
    { value: 'each', title: 'Split every page', detail: 'One PDF per page, in a ZIP' },
];

export default function SplitPdfPage() {
    const [file, setFile] = useState(null);
    const [totalPages, setTotalPages] = useState(0);
    const [startPage, setStartPage] = useState(1);
    const [endPage, setEndPage] = useState(1);
    const [mode, setMode] = useState('range');
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
            setStartPage(1);
            setEndPage(pages);
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

    const rangeValid = startPage >= 1 && endPage <= totalPages && startPage <= endPage;

    const splitPDF = async () => {
        if (!file) return;
        if (mode === 'range' && !rangeValid) {
            setError('Invalid page range.');
            return;
        }

        try {
            setIsProcessing(true);
            setError('');
            setResult('');

            const originalPdf = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
            const baseName = stripExtension(file.name);

            if (mode === 'range') {
                const newPdf = await PDFDocument.create();
                const indices = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage - 1 + i);
                (await newPdf.copyPages(originalPdf, indices)).forEach((page) => newPdf.addPage(page));
                downloadPdfBytes(await newPdf.save(), `${baseName}_pages_${startPage}-${endPage}.pdf`);
                setResult(`Extracted ${indices.length} ${indices.length === 1 ? 'page' : 'pages'} — downloaded.`);
            } else {
                const zip = new JSZip();
                for (let i = 0; i < totalPages; i += 1) {
                    const single = await PDFDocument.create();
                    const [page] = await single.copyPages(originalPdf, [i]);
                    single.addPage(page);
                    zip.file(`${baseName}_page_${String(i + 1).padStart(String(totalPages).length, '0')}.pdf`, await single.save());
                }
                downloadBlob(await zip.generateAsync({ type: 'blob' }), `${baseName}_pages.zip`);
                setResult(`Created ${totalPages} PDFs — ZIP downloaded.`);
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

    const inRange = (n) => mode === 'each' || (n >= startPage && n <= endPage);

    return (
        <ToolShell
            toolId="split-pdf"
            stage={file ? 'work' : 'select'}
            error={error}
            onReset={reset}
            dropzone={{ accept: 'application/pdf,.pdf', onFiles: handleFiles, title: 'Select a PDF', hint: 'or drop it here' }}
            workspaceTitle={file?.name}
            workspaceSubtitle={file ? `${totalPages} pages · ${formatFileSize(file.size)}` : null}
            panel={{
                subtitle: 'Choose how to split',
                body: (
                    <>
                        <div className="option-list" role="group" aria-label="Split mode">
                            {MODES.map((m) => (
                                <button key={m.value} type="button" className="option-card" aria-pressed={mode === m.value} onClick={() => setMode(m.value)}>
                                    <span className="option-dot" />
                                    <span><strong>{m.title}</strong><span>{m.detail}</span></span>
                                </button>
                            ))}
                        </div>
                        {mode === 'range' ? (
                            <div className="panel-row">
                                <div className="field">
                                    <label className="field-label" htmlFor="split-from">From page</label>
                                    <input id="split-from" className="input" type="number" min={1} max={totalPages} value={startPage} onChange={(e) => setStartPage(Number(e.target.value))} />
                                </div>
                                <div className="field">
                                    <label className="field-label" htmlFor="split-to">To page</label>
                                    <input id="split-to" className="input" type="number" min={1} max={totalPages} value={endPage} onChange={(e) => setEndPage(Number(e.target.value))} />
                                </div>
                            </div>
                        ) : null}
                        {mode === 'range' && !rangeValid ? <span className="error-text">Enter a range between 1 and {totalPages}.</span> : null}
                    </>
                ),
                result,
                action: {
                    label: mode === 'range' ? 'Extract pages' : 'Split into files',
                    icon: Split,
                    busyLabel: 'Splitting…',
                    onClick: splitPDF,
                    disabled: mode === 'range' && !rangeValid,
                    busy: isProcessing,
                },
            }}
        >
            {file ? (
                <Document file={file} loading={<div className="skeleton" style={{ height: 240 }} />} onLoadError={() => setError('Could not preview this PDF.')}>
                    <div className="page-grid">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                            <button
                                key={n}
                                type="button"
                                className={`page-tile ${inRange(n) ? '' : 'is-removed'}`}
                                onClick={() => {
                                    if (mode !== 'range') return;
                                    // Click extends the range toward the clicked page.
                                    if (n < startPage) setStartPage(n);
                                    else if (n > endPage) setEndPage(n);
                                    else if (n - startPage < endPage - n) setStartPage(n);
                                    else setEndPage(n);
                                }}
                                style={{ border: inRange(n) ? '1px solid var(--accent)' : undefined, background: inRange(n) ? 'var(--accent-soft)' : undefined }}
                                aria-pressed={inRange(n)}
                                aria-label={`Page ${n}`}
                            >
                                <div className="page-tile-frame">
                                    <div className="page-tile-sheet"><LazyPage pageNumber={n} width={130} /></div>
                                </div>
                                <span className="page-tile-label">Page {n}</span>
                            </button>
                        ))}
                    </div>
                </Document>
            ) : null}
        </ToolShell>
    );
}
