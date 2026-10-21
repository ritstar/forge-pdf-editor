'use client';

import { useState } from 'react';
import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import { Document } from 'react-pdf';
import { RotateCcw, RotateCw, Undo2 } from 'lucide-react';
import '@/app/utils/pdfWorker';
import ToolShell from '@/app/components/ToolShell';
import LazyPage from '@/app/components/ui/LazyPage';
import { auth } from '@/lib/firebase/config';
import { logToolAction } from '@/lib/history';
import { downloadPdfBytes, formatFileSize, isPdfFile, stripExtension } from '@/app/utils/files';

const normalize = (deg) => ((deg % 360) + 360) % 360;

export default function RotateClient() {
    const [file, setFile] = useState(null);
    const [numPages, setNumPages] = useState(null);
    const [pageRotations, setPageRotations] = useState({});
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState('');

    const handleFiles = ([selectedFile]) => {
        setError('');
        setResult('');
        if (!isPdfFile(selectedFile)) {
            setError('Please select a valid PDF file.');
            return;
        }
        setFile(selectedFile);
        setNumPages(null);
        setPageRotations({});
    };

    const rotatePage = (index, delta) => {
        setResult('');
        setPageRotations((prev) => ({ ...prev, [index]: (prev[index] || 0) + delta }));
    };

    const rotateAll = (delta) => {
        if (!numPages) return;
        setResult('');
        setPageRotations((prev) => {
            const next = {};
            for (let i = 0; i < numPages; i++) next[i] = (prev[i] || 0) + delta;
            return next;
        });
    };

    const rotatedCount = Object.values(pageRotations).filter((r) => normalize(r) !== 0).length;

    const applyRotation = async () => {
        if (!file || !numPages || !rotatedCount) return;

        try {
            setIsProcessing(true);
            setError('');
            setResult('');

            const pdf = await PDFDocument.load(await file.arrayBuffer());
            pdf.getPages().forEach((page, i) => {
                const customRotation = normalize(pageRotations[i] || 0);
                if (customRotation) {
                    page.setRotation(degrees(normalize(page.getRotation().angle + customRotation)));
                }
            });

            downloadPdfBytes(await pdf.save(), `${stripExtension(file.name)}_rotated.pdf`);
            setResult(`Rotated ${rotatedCount} ${rotatedCount === 1 ? 'page' : 'pages'} — downloaded.`);

            const user = auth.currentUser;
            if (user) {
                logToolAction(user.uid, 'rotate-pdf', 'Rotate PDF', file.name);
            }
        } catch (err) {
            console.error(err);
            setError(err?.name === 'EncryptedPDFError' ? 'This PDF is password protected. Unlock it first.' : 'An error occurred while rotating the PDF pages.');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <ToolShell
            toolId="rotate-pdf"
            stage={file ? 'work' : 'select'}
            error={error}
            onReset={() => { setFile(null); setPageRotations({}); setError(''); setResult(''); }}
            dropzone={{ accept: 'application/pdf,.pdf', onFiles: handleFiles, title: 'Select a PDF', hint: 'or drop it here' }}
            workspaceTitle={file?.name}
            workspaceSubtitle={file ? `${numPages ?? '…'} pages · ${formatFileSize(file.size)} · hover a page to rotate it` : null}
            panel={{
                subtitle: rotatedCount ? `${rotatedCount} ${rotatedCount === 1 ? 'page' : 'pages'} will be rotated` : 'Rotate pages, then apply',
                body: (
                    <div className="field">
                        <span className="field-label">All pages</span>
                        <div className="panel-row">
                            <button type="button" className="btn btn-secondary" onClick={() => rotateAll(-90)} disabled={!numPages}>
                                <RotateCcw size={16} /> Left
                            </button>
                            <button type="button" className="btn btn-secondary" onClick={() => rotateAll(90)} disabled={!numPages}>
                                <RotateCw size={16} /> Right
                            </button>
                        </div>
                        <button type="button" className="btn btn-ghost" onClick={() => setPageRotations({})} disabled={!rotatedCount}>
                            <Undo2 size={16} /> Reset all
                        </button>
                    </div>
                ),
                result,
                action: { label: 'Apply rotation', icon: RotateCw, busyLabel: 'Rotating…', onClick: applyRotation, disabled: !rotatedCount, busy: isProcessing },
                footnote: rotatedCount ? null : 'Rotate at least one page to continue.',
            }}
        >
            {file ? (
                <Document
                    file={file}
                    onLoadSuccess={({ numPages: n }) => setNumPages(n)}
                    onLoadError={() => setError('Failed to load PDF. It might be corrupted or encrypted.')}
                    loading={<div className="skeleton" style={{ height: 240 }} />}
                >
                    <div className="page-grid">
                        {Array.from({ length: numPages || 0 }, (_, index) => {
                            const rotation = pageRotations[index] || 0;
                            const quarter = normalize(rotation) % 180 !== 0;
                            return (
                                <div key={index} className="page-tile">
                                    <div className="page-tile-frame">
                                        <div className="page-tile-sheet" style={{ transform: `rotate(${rotation}deg) scale(${quarter ? 0.76 : 1})` }}>
                                            <LazyPage pageNumber={index + 1} width={130} />
                                        </div>
                                        {normalize(rotation) ? <span className="badge badge-accent page-tile-badge">{normalize(rotation)}°</span> : null}
                                    </div>
                                    <div className="page-tile-tools">
                                        <button type="button" className="tile-btn" onClick={() => rotatePage(index, -90)} aria-label={`Rotate page ${index + 1} left`}>
                                            <RotateCcw size={14} />
                                        </button>
                                        <button type="button" className="tile-btn" onClick={() => rotatePage(index, 90)} aria-label={`Rotate page ${index + 1} right`}>
                                            <RotateCw size={14} />
                                        </button>
                                    </div>
                                    <span className="page-tile-label">Page {index + 1}</span>
                                </div>
                            );
                        })}
                    </div>
                </Document>
            ) : null}
        </ToolShell>
    );
}
