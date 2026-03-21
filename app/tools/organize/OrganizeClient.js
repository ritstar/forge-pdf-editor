'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { PDFDocument } from 'pdf-lib';
import { Document, Page, pdfjs } from 'react-pdf';
import { auth } from '@/lib/firebase/config';
import { logToolAction } from '@/lib/history';
import { FilePlus2, LayoutGrid, Trash2, X, RefreshCw, ChevronUp, ChevronDown, Undo2 } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure PDF worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function OrganizePdfPage() {
    const [file, setFile] = useState(null);
    const [numPages, setNumPages] = useState(null);
    const [pageOrder, setPageOrder] = useState([]);
    const [deletedPages, setDeletedPages] = useState(new Set());
    const [changeHistory, setChangeHistory] = useState([]);
    const [undoStack, setUndoStack] = useState([]);
    const [draggedIndex, setDraggedIndex] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState('');
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef(null);
    const pageOrderRef = useRef([]);
    const deletedPagesRef = useRef(new Set());
    const changeHistoryRef = useRef([]);

    useEffect(() => {
        pageOrderRef.current = pageOrder;
    }, [pageOrder]);

    useEffect(() => {
        deletedPagesRef.current = deletedPages;
    }, [deletedPages]);

    useEffect(() => {
        changeHistoryRef.current = changeHistory;
    }, [changeHistory]);

    const handleFile = (selectedFile) => {
        setError('');
        if (selectedFile.type !== 'application/pdf') {
            setError('Please select a valid PDF file.');
            return;
        }

        setFile(selectedFile);
        setNumPages(null);
        setPageOrder([]);
        setDeletedPages(new Set());
        setChangeHistory([]);
        setUndoStack([]);
        pageOrderRef.current = [];
        deletedPagesRef.current = new Set();
        changeHistoryRef.current = [];
    };

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    };

    const createHistoryEntry = (message, meta = {}) => ({
        id: crypto.randomUUID(),
        text: `${new Date().toLocaleTimeString()} - ${message}`,
        ...meta,
    });

    const prependHistoryEntry = (entry) => {
        setChangeHistory((prev) => [entry, ...prev].slice(0, 120));
    };

    const removeHistoryById = (entryId) => {
        setChangeHistory((prev) => prev.filter((item) => item.id !== entryId));
    };

    const pushActionSnapshot = (orderSnapshot, deletedSnapshot, historyDelta = null) => {
        setUndoStack((prev) => [
            ...prev,
            {
                pageOrder: [...orderSnapshot],
                deletedPages: [...deletedSnapshot],
                historyDelta,
            },
        ].slice(-120));
    };

    const handleMoveUp = useCallback((displayIndex) => {
        movePage(displayIndex, displayIndex - 1);
    }, []);

    const handleMoveDown = useCallback((displayIndex) => {
        movePage(displayIndex, displayIndex + 1);
    }, []);

    const handleToggleDelete = useCallback((pageIndex) => {
        togglePageDeletion(pageIndex);
    }, []);

    const addMoveHistory = (pageIndex, fromPos, toPos) => {
        const latest = changeHistoryRef.current[0];
        const isInverseOfLatest =
            latest?.kind === 'move' &&
            latest.pageIndex === pageIndex &&
            latest.fromPos === toPos &&
            latest.toPos === fromPos;

        if (isInverseOfLatest) {
            removeHistoryById(latest.id);
            return { type: 'removed', entry: latest };
        }

        const entry = createHistoryEntry(
            `Moved page ${pageIndex + 1} from position ${fromPos} to ${toPos}`,
            { kind: 'move', pageIndex, fromPos, toPos }
        );
        prependHistoryEntry(entry);
        return { type: 'added', entry };
    };

    const togglePageDeletion = (pageIndex) => {
        const currentDeleted = new Set(deletedPagesRef.current);
        const wasDeleted = currentDeleted.has(pageIndex);
        const priorToggle = changeHistoryRef.current.find(
            (item) => item.kind === 'toggle-delete' && item.pageIndex === pageIndex
        );
        let historyDelta;
        if (priorToggle) {
            removeHistoryById(priorToggle.id);
            historyDelta = { type: 'removed', entry: priorToggle };
        } else {
            const entry = createHistoryEntry(
                wasDeleted ? `Restored page ${pageIndex + 1}` : `Marked page ${pageIndex + 1} for deletion`,
                { kind: 'toggle-delete', pageIndex }
            );
            prependHistoryEntry(entry);
            historyDelta = { type: 'added', entry };
        }
        pushActionSnapshot(pageOrderRef.current, deletedPagesRef.current, historyDelta);

        if (wasDeleted) {
            currentDeleted.delete(pageIndex);
        } else {
            currentDeleted.add(pageIndex);
        }

        deletedPagesRef.current = currentDeleted;
        setDeletedPages(currentDeleted);
    };

    const movePage = (fromIndex, toIndex) => {
        if (fromIndex === toIndex) return;
        const currentOrder = pageOrderRef.current;
        if (toIndex < 0 || toIndex >= currentOrder.length) return;
        const movedPageIndex = currentOrder[fromIndex];
        if (movedPageIndex === undefined) return;
        const historyDelta = addMoveHistory(movedPageIndex, fromIndex + 1, toIndex + 1);
        pushActionSnapshot(currentOrder, deletedPagesRef.current, historyDelta);

        const nextOrder = [...currentOrder];
        const [moved] = nextOrder.splice(fromIndex, 1);
        nextOrder.splice(toIndex, 0, moved);

        pageOrderRef.current = nextOrder;
        setPageOrder(nextOrder);
    };

    const handleDropOnTile = (targetIndex) => {
        if (draggedIndex === null) return;
        if (draggedIndex === targetIndex) {
            setDraggedIndex(null);
            return;
        }
        movePage(draggedIndex, targetIndex);
        setDraggedIndex(null);
    };

    const undoLastChange = () => {
        if (!undoStack.length) return;
        const lastAction = undoStack[undoStack.length - 1];
        setUndoStack((prev) => prev.slice(0, -1));
        const restoredDeleted = new Set(lastAction.deletedPages);
        pageOrderRef.current = [...lastAction.pageOrder];
        deletedPagesRef.current = restoredDeleted;
        setPageOrder(lastAction.pageOrder);
        setDeletedPages(restoredDeleted);

        if (lastAction.historyDelta?.type === 'added') {
            removeHistoryById(lastAction.historyDelta.entry.id);
        } else if (lastAction.historyDelta?.type === 'removed') {
            prependHistoryEntry(lastAction.historyDelta.entry);
        }
    };

    const organizePDF = async () => {
        if (!file || !numPages) return;

        if (deletedPages.size === numPages) {
            setError('You cannot delete all pages. Please keep at least one page.');
            return;
        }

        try {
            setIsProcessing(true);
            setError('');

            const fileBuffer = await file.arrayBuffer();
            const originalPdf = await PDFDocument.load(fileBuffer);
            const newPdf = await PDFDocument.create();

            const pagesToKeep = pageOrder.filter((pageIndex) => !deletedPages.has(pageIndex));

            const copiedPages = await newPdf.copyPages(originalPdf, pagesToKeep);
            copiedPages.forEach((page) => {
                newPdf.addPage(page);
            });

            const newPdfBytes = await newPdf.save();
            const blob = new Blob([newPdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = `organized_${file.name}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            const user = auth.currentUser;
            if (user) {
                logToolAction(user.uid, 'organize-pdf', 'Organize PDF', file.name);
            }
        } catch (err) {
            console.error(err);
            setError('An error occurred while organizing the PDF.');
        } finally {
            setIsProcessing(false);
        }
    };

    const hasCustomOrder = numPages && pageOrder.some((pageIndex, idx) => pageIndex !== idx);

    return (
        <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                <h1 style={{ fontSize: '2.5rem', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                    <div style={{ color: '#E53E3E', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#E53E3E15', padding: '12px', borderRadius: '12px' }}>
                        <LayoutGrid size={32} />
                    </div>
                    Organize PDF
                </h1>
                <p className="muted" style={{ fontSize: '1.1rem' }}>Drag and drop pages to reorder them, or mark pages for deletion before exporting.</p>
            </div>

            {!file ? (
                <div
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    style={{
                        border: `2px dashed ${dragActive ? 'var(--accent)' : 'var(--line)'}`,
                        borderRadius: '16px',
                        padding: '60px 20px',
                        textAlign: 'center',
                        background: dragActive ? 'var(--surface)' : 'var(--bg-soft)',
                        transition: 'all 0.2s ease',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '16px',
                        maxWidth: '600px',
                        margin: '0 auto',
                        width: '100%'
                    }}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: '50%', boxShadow: 'var(--shadow)' }}>
                        <FilePlus2 size={40} color="var(--accent)" />
                    </div>
                    <div>
                        <h3 style={{ margin: '0 0 8px', fontSize: '1.4rem' }}>Select PDF file</h3>
                        <p className="muted" style={{ margin: 0 }}>or drop PDF here</p>
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/pdf"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                            if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
                            e.target.value = '';
                        }}
                    />
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--line)', padding: '16px 20px', borderRadius: '12px', boxShadow: 'var(--shadow)' }}>
                        <div>
                            <h3 style={{ margin: '0 0 4px', fontSize: '1.1rem' }}>{file.name}</h3>
                            <p className="muted small" style={{ margin: 0 }}>
                                {numPages ? `${numPages} pages total` : 'Loading...'}
                                {hasCustomOrder && ' • custom order applied'}
                                {deletedPages.size > 0 && ` • ${deletedPages.size} marked for deletion`}
                            </p>
                        </div>

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button onClick={() => setFile(null)} className="ghost-btn">
                                <X size={16} /> Cancel
                            </button>
                            <button
                                onClick={undoLastChange}
                                disabled={!undoStack.length || isProcessing}
                                className="ghost-btn"
                            >
                                <Undo2 size={16} /> Undo
                            </button>
                            <button
                                onClick={organizePDF}
                                disabled={isProcessing || !numPages || deletedPages.size === numPages}
                                className="primary-btn"
                                style={{ background: '#E53E3E', opacity: (isProcessing || !numPages || deletedPages.size === numPages) ? 0.6 : 1 }}
                            >
                                {isProcessing ? <><RefreshCw size={16} className="spin" /> Exporting...</> : 'Export New PDF'}
                            </button>
                        </div>
                    </div>

                    {error && <p className="error-text" style={{ textAlign: 'center' }}>{error}</p>}

                    <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div style={{
                            background: 'var(--surface-2)',
                            border: '1px solid var(--line)',
                            borderRadius: '12px',
                            padding: '24px',
                            minHeight: '400px',
                            flex: '1 1 620px',
                            minWidth: '280px'
                        }}>
                            <Document
                                file={file}
                                onLoadSuccess={({ numPages }) => {
                                    setNumPages(numPages);
                                    const initialOrder = Array.from({ length: numPages }, (_, i) => i);
                                    setPageOrder(initialOrder);
                                    pageOrderRef.current = initialOrder;
                                    deletedPagesRef.current = new Set();
                                    const loadedEntry = {
                                        id: crypto.randomUUID(),
                                        text: `${new Date().toLocaleTimeString()} - Loaded ${numPages} pages`,
                                        kind: 'system',
                                    };
                                    setChangeHistory([loadedEntry]);
                                    changeHistoryRef.current = [loadedEntry];
                                    setUndoStack([]);
                                }}
                                onLoadError={() => setError('Failed to load PDF. It might be corrupted or encrypted.')}
                                loading={<p className="muted" style={{ textAlign: 'center' }}>Loading document...</p>}
                            >
                                {numPages && pageOrder.length > 0 && (
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                                        gap: '24px'
                                    }}>
                                        {pageOrder.map((pageIndex, displayIndex) => {
                                            const isDeleted = deletedPages.has(pageIndex);
                                            return (
                                                <div
                                                    key={`page_${pageIndex + 1}_${displayIndex}`}
                                                    draggable
                                                    onDragStart={() => setDraggedIndex(displayIndex)}
                                                    onDragEnd={() => setDraggedIndex(null)}
                                                    onDragOver={(e) => e.preventDefault()}
                                                    onDrop={() => handleDropOnTile(displayIndex)}
                                                    style={{
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        transition: 'transform 0.15s ease',
                                                        opacity: draggedIndex === displayIndex ? 0.6 : 1,
                                                        cursor: 'grab'
                                                    }}
                                                >
                                                    <div style={{
                                                        position: 'relative',
                                                        border: isDeleted ? '3px solid var(--danger)' : '1px solid var(--line)',
                                                        borderRadius: '8px',
                                                        overflow: 'hidden',
                                                        boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                                                        opacity: isDeleted ? 0.5 : 1
                                                    }}>
                                                        <div style={{
                                                            position: 'absolute',
                                                            top: '8px',
                                                            left: '8px',
                                                            zIndex: 3,
                                                            display: 'flex',
                                                            gap: '4px'
                                                        }}>
                                                            <button
                                                                type="button"
                                                                className="ghost-btn"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleMoveUp(displayIndex);
                                                                }}
                                                                disabled={displayIndex === 0}
                                                                style={{ minHeight: '28px', padding: '0 8px', borderRadius: '8px', background: 'var(--surface)' }}
                                                                aria-label="Move page up"
                                                            >
                                                                <ChevronUp size={14} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="ghost-btn"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleMoveDown(displayIndex);
                                                                }}
                                                                disabled={displayIndex === pageOrder.length - 1}
                                                                style={{ minHeight: '28px', padding: '0 8px', borderRadius: '8px', background: 'var(--surface)' }}
                                                                aria-label="Move page down"
                                                            >
                                                                <ChevronDown size={14} />
                                                            </button>
                                                        </div>

                                                        <button
                                                            type="button"
                                                            className="ghost-btn"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleToggleDelete(pageIndex);
                                                            }}
                                                            style={{
                                                                position: 'absolute',
                                                                top: '8px',
                                                                right: '8px',
                                                                zIndex: 3,
                                                                minHeight: '28px',
                                                                width: '28px',
                                                                padding: 0,
                                                                borderRadius: '50%',
                                                                background: isDeleted ? 'var(--surface)' : 'var(--danger)',
                                                                color: isDeleted ? 'var(--ink)' : '#fff'
                                                            }}
                                                            aria-label={isDeleted ? 'Restore page' : 'Mark page for deletion'}
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>

                                                        <Page
                                                            pageNumber={pageIndex + 1}
                                                            width={160}
                                                            renderTextLayer={false}
                                                            renderAnnotationLayer={false}
                                                            loading={<div style={{ width: 160, height: 226, background: 'var(--surface)' }} />}
                                                        />

                                                        {isDeleted && (
                                                            <div style={{
                                                                position: 'absolute',
                                                                top: 0, left: 0, right: 0, bottom: 0,
                                                                background: 'rgba(200, 50, 50, 0.2)',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                pointerEvents: 'none'
                                                            }}>
                                                                <div style={{ background: 'var(--danger)', color: '#fff', padding: '12px', borderRadius: '50%' }}>
                                                                    <Trash2 size={24} />
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span style={{ fontSize: '0.9rem', fontWeight: 500, color: isDeleted ? 'var(--danger)' : 'var(--ink)' }}>
                                                        Position {displayIndex + 1} • Page {pageIndex + 1}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </Document>
                        </div>

                        <aside style={{
                            border: '1px solid var(--line)',
                            background: 'var(--surface)',
                            borderRadius: '12px',
                            padding: '16px',
                            width: '280px',
                            maxHeight: '560px',
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px'
                        }}>
                            <h3 style={{ margin: 0, fontSize: '1rem' }}>Change History</h3>
                            <p className="muted small" style={{ margin: 0 }}>
                                Tracks moves and delete/restore actions.
                            </p>
                            <div style={{
                                borderTop: '1px solid var(--line)',
                                paddingTop: '10px',
                                overflowY: 'auto',
                                display: 'grid',
                                gap: '8px'
                            }}>
                                {changeHistory.length ? (
                                    changeHistory.map((entry, idx) => (
                                        <p key={`${entry.id}_${idx}`} className="small" style={{
                                            margin: 0,
                                            padding: '8px',
                                            borderRadius: '8px',
                                            background: 'var(--surface-2)',
                                            border: '1px solid var(--line)',
                                            lineHeight: 1.4
                                        }}>
                                            {entry.text}
                                        </p>
                                    ))
                                ) : (
                                    <p className="muted small" style={{ margin: 0 }}>No changes yet.</p>
                                )}
                            </div>
                        </aside>
                    </div>

                </div>
            )}
        </div>
    );
}
