'use client';

import { useEffect, useRef, useState } from 'react';
import { degrees, PDFDocument } from '@cantoo/pdf-lib';
import { ArrowLeft, ArrowRight, Copy, FilePlus2, LayoutGrid, RotateCcw, RotateCw, SquarePlus, Trash2, Undo2 } from 'lucide-react';
import { pdfjs } from '@/app/utils/pdfWorker';
import ToolShell from '@/app/components/ToolShell';
import LazyPage from '@/app/components/ui/LazyPage';
import { auth } from '@/lib/firebase/config';
import { logToolAction } from '@/lib/history';
import { downloadPdfBytes, formatFileSize, isPdfFile, stripExtension } from '@/app/utils/files';
import { moveItem, useReorder } from '@/app/utils/useReorder';

const normalize = (deg) => ((deg % 360) + 360) % 360;
let counter = 0;
const newKey = () => `p${(counter += 1)}`;

/**
 * Pages from one or more PDFs, plus blank pages, in any order. Each item is
 * { key, source (index into sources) | null for blank, page (0-based), rotate, removed }.
 */
export default function OrganizeClient() {
    const [sources, setSources] = useState([]); // [{ file, pdf (pdf.js), pageCount, sizes }]
    const [items, setItems] = useState([]);
    const [selected, setSelected] = useState(() => new Set());
    const [undoStack, setUndoStack] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState('');
    const addInputRef = useRef(null);
    const sourcesRef = useRef(sources);

    useEffect(() => {
        sourcesRef.current = sources;
    }, [sources]);
    useEffect(() => () => sourcesRef.current.forEach((s) => s.pdf.destroy()), []);

    const commit = (next) => {
        setUndoStack((prev) => [...prev.slice(-99), items]);
        setItems(next);
        setResult('');
    };

    const undo = () => {
        if (!undoStack.length) return;
        setItems(undoStack[undoStack.length - 1]);
        setUndoStack((prev) => prev.slice(0, -1));
        setResult('');
    };

    const loadFiles = async (files, { append }) => {
        const pdfs = files.filter(isPdfFile);
        if (pdfs.length !== files.length) setError('Some files were skipped because they are not PDFs.');
        else setError('');
        if (!pdfs.length) return;
        setIsLoading(true);
        try {
            const loaded = [];
            for (const file of pdfs) {
                try {
                    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
                    const first = await pdf.getPage(1);
                    const { width, height } = first.getViewport({ scale: 1 });
                    loaded.push({ file, pdf, pageCount: pdf.numPages, size: [width, height] });
                } catch (err) {
                    setError(err?.name === 'PasswordException' ? `"${file.name}" is password protected. Unlock it first.` : `"${file.name}" could not be read.`);
                }
            }
            if (!loaded.length) return;
            const base = append ? sources.length : 0;
            const newItems = loaded.flatMap((src, i) =>
                Array.from({ length: src.pageCount }, (_, page) => ({ key: newKey(), source: base + i, page, rotate: 0, removed: false })),
            );
            if (append) {
                setSources((prev) => [...prev, ...loaded]);
                commit([...items, ...newItems]);
            } else {
                sources.forEach((s) => s.pdf.destroy());
                setSources(loaded);
                setItems(newItems);
                setUndoStack([]);
                setSelected(new Set());
            }
        } finally {
            setIsLoading(false);
        }
    };

    const reset = () => {
        sources.forEach((s) => s.pdf.destroy());
        setSources([]);
        setItems([]);
        setSelected(new Set());
        setUndoStack([]);
        setError('');
        setResult('');
    };

    const movePage = (from, to) => {
        if (to < 0 || to >= items.length || from === to) return;
        commit(moveItem(items, from, to));
    };
    const { itemProps, stateClass } = useReorder(movePage);

    // Bulk actions apply to the selection, or to the one page whose button was used.
    const targets = (key) => (key ? new Set([key]) : selected);
    const rotate = (delta, key) => {
        const keys = targets(key);
        commit(items.map((item) => (keys.has(item.key) ? { ...item, rotate: normalize(item.rotate + delta) } : item)));
    };
    const toggleRemove = (key) => {
        const keys = targets(key);
        const allRemoved = items.filter((item) => keys.has(item.key)).every((item) => item.removed);
        commit(items.map((item) => (keys.has(item.key) ? { ...item, removed: !allRemoved } : item)));
        if (!key) setSelected(new Set());
    };
    const duplicate = (key) => {
        const keys = targets(key);
        commit(items.flatMap((item) => (keys.has(item.key) ? [item, { ...item, key: newKey() }] : [item])));
    };
    const insertBlank = () => {
        // After the last selected page, or at the end.
        const lastSelected = items.reduce((idx, item, i) => (selected.has(item.key) ? i : idx), -1);
        const at = lastSelected >= 0 ? lastSelected + 1 : items.length;
        const next = [...items];
        next.splice(at, 0, { key: newKey(), source: null, page: 0, rotate: 0, removed: false });
        commit(next);
    };
    const toggleSelect = (key) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const kept = items.filter((item) => !item.removed);
    const changed = undoStack.length > 0;
    const fileName = sources[0]?.file.name;

    const save = async () => {
        if (!kept.length) {
            setError('You cannot remove every page. Keep at least one.');
            return;
        }
        try {
            setIsProcessing(true);
            setError('');
            const docs = await Promise.all(sources.map(async (src) => PDFDocument.load(await src.file.arrayBuffer())));
            const out = await PDFDocument.create();
            const blankSize = sources[0]?.size || [595.28, 841.89];
            for (const item of kept) {
                if (item.source === null) {
                    const page = out.addPage(blankSize);
                    if (item.rotate) page.setRotation(degrees(item.rotate));
                    continue;
                }
                const [page] = await out.copyPages(docs[item.source], [item.page]);
                if (item.rotate) page.setRotation(degrees(normalize(page.getRotation().angle + item.rotate)));
                out.addPage(page);
            }
            downloadPdfBytes(await out.save(), `${stripExtension(fileName)}_organized.pdf`);
            setResult(`Saved ${kept.length} ${kept.length === 1 ? 'page' : 'pages'} — downloaded.`);
            const user = auth.currentUser;
            if (user) logToolAction(user.uid, 'organize-pdf', 'Organize PDF', fileName);
        } catch (err) {
            console.error(err);
            setError(err?.name === 'EncryptedPDFError' ? 'One of the PDFs is password protected. Unlock it first.' : 'An error occurred while organizing the PDF.');
        } finally {
            setIsProcessing(false);
        }
    };

    const selection = selected.size;

    return (
        <ToolShell
            toolId="organize-pdf"
            stage={sources.length ? 'work' : 'select'}
            error={error}
            onReset={reset}
            dropzone={{ accept: 'application/pdf,.pdf', multiple: true, onFiles: (files) => loadFiles(files, { append: false }), title: isLoading ? 'Opening…' : 'Select PDFs', hint: 'or drop them here — pages from several files can be combined', disabled: isLoading }}
            workspaceTitle={sources.length > 1 ? `${sources.length} files` : fileName}
            workspaceSubtitle={sources.length ? `${items.length} pages · ${formatFileSize(sources.reduce((s, x) => s + x.file.size, 0))} · drag to reorder, click to select` : null}
            workspaceActions={
                <>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => addInputRef.current?.click()} disabled={isLoading}>
                        <FilePlus2 size={15} /> Add PDF
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={insertBlank}>
                        <SquarePlus size={15} /> Blank page
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={undo} disabled={!undoStack.length || isProcessing}>
                        <Undo2 size={15} /> Undo
                    </button>
                    <input ref={addInputRef} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => { loadFiles(Array.from(e.target.files || []), { append: true }); e.target.value = ''; }} />
                </>
            }
            panel={{
                subtitle: changed ? 'Unsaved changes' : 'Reorder, rotate, add or remove pages',
                body: (
                    <>
                        <div className="summary-list">
                            <div><span>Pages kept</span><strong>{kept.length} of {items.length}</strong></div>
                            <div><span>Removed</span><strong>{items.length - kept.length}</strong></div>
                            <div><span>Rotated</span><strong>{items.filter((i) => i.rotate).length}</strong></div>
                        </div>
                        <div className="field">
                            <span className="field-label">{selection ? `${selection} selected` : 'Selection'}</span>
                            {selection ? (
                                <div className="panel-stack">
                                    <div className="panel-row">
                                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => rotate(-90)}><RotateCcw size={14} /> Left</button>
                                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => rotate(90)}><RotateCw size={14} /> Right</button>
                                    </div>
                                    <div className="panel-row">
                                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => duplicate()}><Copy size={14} /> Duplicate</button>
                                        <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => toggleRemove()}><Trash2 size={14} /> Remove</button>
                                    </div>
                                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Clear selection</button>
                                </div>
                            ) : (
                                <p className="small muted">Click pages to select several, then rotate, duplicate or remove them together.</p>
                            )}
                        </div>
                    </>
                ),
                result,
                action: { label: 'Save new PDF', icon: LayoutGrid, busyLabel: 'Saving…', onClick: save, disabled: !kept.length, busy: isProcessing },
            }}
        >
            <div className="page-grid">
                {items.map((item, position) => {
                    const src = item.source === null ? null : sources[item.source];
                    const isSelected = selected.has(item.key);
                    const quarter = item.rotate % 180 !== 0;
                    return (
                        <div
                            key={item.key}
                            className={`page-tile ${item.removed ? 'is-removed' : ''} ${isSelected ? 'is-selected' : ''} ${stateClass(position)}`}
                            {...itemProps(position)}
                            onClick={(event) => {
                                if (!event.target.closest('button')) toggleSelect(item.key);
                            }}
                            style={{ cursor: 'grab' }}
                            aria-selected={isSelected}
                        >
                            <div className="page-tile-frame">
                                <div className="page-tile-sheet" style={{ transform: `rotate(${item.rotate}deg) scale(${quarter ? 0.76 : 1})` }}>
                                    {src ? (
                                        <LazyPage pdf={src.pdf} pageNumber={item.page + 1} width={130} />
                                    ) : (
                                        <div className="blank-sheet" style={{ width: 130, aspectRatio: `${(sources[0]?.size || [595, 842]).join(' / ')}` }}>Blank</div>
                                    )}
                                </div>
                                {item.removed ? (
                                    <span className="removed-flag"><span className="badge" style={{ color: 'var(--danger)', borderColor: 'var(--danger-line)', background: 'var(--danger-soft)' }}>Removed</span></span>
                                ) : null}
                                {item.rotate ? <span className="badge badge-accent page-tile-badge">{item.rotate}°</span> : null}
                                <span className="tile-check" aria-hidden="true" />
                            </div>
                            <div className="page-tile-tools">
                                <button type="button" className="tile-btn" onClick={() => movePage(position, position - 1)} disabled={position === 0} aria-label="Move earlier"><ArrowLeft size={14} /></button>
                                <button type="button" className="tile-btn" onClick={() => movePage(position, position + 1)} disabled={position === items.length - 1} aria-label="Move later"><ArrowRight size={14} /></button>
                                <button type="button" className="tile-btn" onClick={() => rotate(90, item.key)} aria-label="Rotate right"><RotateCw size={14} /></button>
                                <button type="button" className={`tile-btn danger ${item.removed ? 'on' : ''}`} onClick={() => toggleRemove(item.key)} aria-label={item.removed ? 'Restore page' : 'Remove page'} aria-pressed={item.removed}><Trash2 size={14} /></button>
                            </div>
                            <span className="page-tile-label">
                                {position + 1}
                                {src && sources.length > 1 ? <span className="muted"> · {String.fromCharCode(65 + item.source)}{item.page + 1}</span> : null}
                                {src && sources.length === 1 && item.page !== position ? <span className="muted"> · was {item.page + 1}</span> : null}
                            </span>
                        </div>
                    );
                })}
            </div>
        </ToolShell>
    );
}
