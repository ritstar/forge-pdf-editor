'use client';

import { useState } from 'react';
import { PDFDocument } from '@cantoo/pdf-lib';
import { Document } from 'react-pdf';
import { ArrowLeft, ArrowRight, LayoutGrid, RotateCcw, Trash2, Undo2 } from 'lucide-react';
import '@/app/utils/pdfWorker';
import ToolShell from '@/app/components/ToolShell';
import LazyPage from '@/app/components/ui/LazyPage';
import { auth } from '@/lib/firebase/config';
import { logToolAction } from '@/lib/history';
import { downloadPdfBytes, formatFileSize, isPdfFile, stripExtension } from '@/app/utils/files';
import { moveItem, useReorder } from '@/app/utils/useReorder';

export default function OrganizeClient() {
    const [file, setFile] = useState(null);
    const [numPages, setNumPages] = useState(null);
    // Each snapshot is { order: number[], removed: number[], note: string }.
    const [state, setState] = useState({ order: [], removed: [] });
    const [undoStack, setUndoStack] = useState([]);
    const [log, setLog] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState('');

    const removed = new Set(state.removed);

    const commit = (next, note) => {
        setUndoStack((prev) => [...prev.slice(-99), state]);
        setState(next);
        setLog((prev) => [note, ...prev].slice(0, 50));
        setResult('');
    };

    const movePage = (from, to) => {
        if (to < 0 || to >= state.order.length || from === to) return;
        const page = state.order[from];
        commit({ ...state, order: moveItem(state.order, from, to) }, `Moved page ${page + 1} to position ${to + 1}`);
    };

    const toggleRemove = (pageIndex) => {
        const isRemoved = removed.has(pageIndex);
        commit(
            { ...state, removed: isRemoved ? state.removed.filter((p) => p !== pageIndex) : [...state.removed, pageIndex] },
            isRemoved ? `Restored page ${pageIndex + 1}` : `Removed page ${pageIndex + 1}`,
        );
    };

    const undo = () => {
        if (!undoStack.length) return;
        setState(undoStack[undoStack.length - 1]);
        setUndoStack((prev) => prev.slice(0, -1));
        setLog((prev) => prev.slice(1));
        setResult('');
    };

    const resetOrder = () => {
        commit({ order: Array.from({ length: numPages }, (_, i) => i), removed: [] }, 'Reset to original order');
    };

    const { itemProps, stateClass } = useReorder(movePage);

    const handleFiles = ([selectedFile]) => {
        setError('');
        setResult('');
        if (!isPdfFile(selectedFile)) {
            setError('Please select a valid PDF file.');
            return;
        }
        setFile(selectedFile);
        setNumPages(null);
        setState({ order: [], removed: [] });
        setUndoStack([]);
        setLog([]);
    };

    const keptCount = state.order.length - state.removed.length;
    const hasCustomOrder = state.order.some((pageIndex, idx) => pageIndex !== idx);
    const changed = hasCustomOrder || state.removed.length > 0;

    const organizePDF = async () => {
        if (!file || !numPages) return;
        if (!keptCount) {
            setError('You cannot remove every page. Keep at least one.');
            return;
        }

        try {
            setIsProcessing(true);
            setError('');

            const originalPdf = await PDFDocument.load(await file.arrayBuffer());
            const newPdf = await PDFDocument.create();
            const pagesToKeep = state.order.filter((pageIndex) => !removed.has(pageIndex));
            (await newPdf.copyPages(originalPdf, pagesToKeep)).forEach((page) => newPdf.addPage(page));

            downloadPdfBytes(await newPdf.save(), `${stripExtension(file.name)}_organized.pdf`);
            setResult(`Saved ${pagesToKeep.length} ${pagesToKeep.length === 1 ? 'page' : 'pages'} — downloaded.`);

            const user = auth.currentUser;
            if (user) {
                logToolAction(user.uid, 'organize-pdf', 'Organize PDF', file.name);
            }
        } catch (err) {
            console.error(err);
            setError(err?.name === 'EncryptedPDFError' ? 'This PDF is password protected. Unlock it first.' : 'An error occurred while organizing the PDF.');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <ToolShell
            toolId="organize-pdf"
            stage={file ? 'work' : 'select'}
            error={error}
            onReset={() => { setFile(null); setError(''); setResult(''); }}
            dropzone={{ accept: 'application/pdf,.pdf', onFiles: handleFiles, title: 'Select a PDF', hint: 'or drop it here' }}
            workspaceTitle={file?.name}
            workspaceSubtitle={file ? `${numPages ?? '…'} pages · ${formatFileSize(file.size)} · drag pages to reorder` : null}
            workspaceActions={
                <>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={undo} disabled={!undoStack.length || isProcessing}>
                        <Undo2 size={15} /> Undo
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={resetOrder} disabled={!changed || isProcessing}>
                        <RotateCcw size={15} /> Reset
                    </button>
                </>
            }
            panel={{
                subtitle: changed ? 'Unsaved changes' : 'Reorder or remove pages',
                body: (
                    <>
                        <div className="summary-list">
                            <div><span>Pages kept</span><strong>{numPages ? `${keptCount} of ${numPages}` : '—'}</strong></div>
                            <div><span>Removed</span><strong>{state.removed.length}</strong></div>
                            <div><span>Order</span><strong>{hasCustomOrder ? 'Custom' : 'Original'}</strong></div>
                        </div>
                        {log.length ? (
                            <div className="field">
                                <span className="field-label">Changes</span>
                                <div className="history-list">
                                    {log.map((entry, idx) => <p key={`${idx}-${entry}`}>{entry}</p>)}
                                </div>
                            </div>
                        ) : null}
                    </>
                ),
                result,
                action: { label: 'Save new PDF', icon: LayoutGrid, busyLabel: 'Saving…', onClick: organizePDF, disabled: !numPages || !keptCount, busy: isProcessing },
            }}
        >
            {file ? (
                <Document
                    file={file}
                    onLoadSuccess={({ numPages: n }) => {
                        setNumPages(n);
                        setState({ order: Array.from({ length: n }, (_, i) => i), removed: [] });
                    }}
                    onLoadError={() => setError('Failed to load PDF. It might be corrupted or encrypted.')}
                    loading={<div className="skeleton" style={{ height: 240 }} />}
                >
                    <div className="page-grid">
                        {state.order.map((pageIndex, position) => {
                            const isRemoved = removed.has(pageIndex);
                            return (
                                <div
                                    key={pageIndex}
                                    className={`page-tile ${isRemoved ? 'is-removed' : ''} ${stateClass(position)}`}
                                    {...itemProps(position)}
                                    style={{ cursor: 'grab' }}
                                >
                                    <div className="page-tile-frame">
                                        <div className="page-tile-sheet"><LazyPage pageNumber={pageIndex + 1} width={130} /></div>
                                        {isRemoved ? (
                                            <span className="removed-flag"><span className="badge" style={{ color: 'var(--danger)', borderColor: 'var(--danger-line)', background: 'var(--danger-soft)' }}>Removed</span></span>
                                        ) : null}
                                    </div>
                                    <div className="page-tile-tools">
                                        <button type="button" className="tile-btn" onClick={() => movePage(position, position - 1)} disabled={position === 0} aria-label="Move earlier">
                                            <ArrowLeft size={14} />
                                        </button>
                                        <button type="button" className="tile-btn" onClick={() => movePage(position, position + 1)} disabled={position === state.order.length - 1} aria-label="Move later">
                                            <ArrowRight size={14} />
                                        </button>
                                        <button type="button" className={`tile-btn danger ${isRemoved ? 'on' : ''}`} onClick={() => toggleRemove(pageIndex)} aria-label={isRemoved ? `Restore page ${pageIndex + 1}` : `Remove page ${pageIndex + 1}`} aria-pressed={isRemoved}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                    <span className="page-tile-label">
                                        {position + 1}
                                        {pageIndex !== position ? <span className="muted"> · was {pageIndex + 1}</span> : null}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </Document>
            ) : null}
        </ToolShell>
    );
}
