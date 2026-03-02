'use client';

import { useState, useRef } from 'react';
import { PDFDocument } from 'pdf-lib';
import { Document, Page, pdfjs } from 'react-pdf';
import { auth } from '@/lib/firebase/config';
import { logToolAction } from '@/lib/history';
import { FilePlus2, LayoutGrid, Trash2, X, RefreshCw } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure PDF worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function OrganizePdfPage() {
    const [file, setFile] = useState(null);
    const [numPages, setNumPages] = useState(null);
    const [deletedPages, setDeletedPages] = useState(new Set());
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState('');
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef(null);

    const handleFile = (selectedFile) => {
        setError('');
        if (selectedFile.type !== 'application/pdf') {
            setError('Please select a valid PDF file.');
            return;
        }

        setFile(selectedFile);
        setDeletedPages(new Set());
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

    const togglePageDeletion = (pageIndex) => {
        setDeletedPages(prev => {
            const newSet = new Set(prev);
            if (newSet.has(pageIndex)) {
                newSet.delete(pageIndex);
            } else {
                newSet.add(pageIndex);
            }
            return newSet;
        });
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

            const pagesToKeep = [];
            for (let i = 0; i < numPages; i++) {
                if (!deletedPages.has(i)) {
                    pagesToKeep.push(i);
                }
            }

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

    return (
        <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                <h1 style={{ fontSize: '2.5rem', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                    <div style={{ color: '#E53E3E', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#E53E3E15', padding: '12px', borderRadius: '12px' }}>
                        <LayoutGrid size={32} />
                    </div>
                    Organize PDF
                </h1>
                <p className="muted" style={{ fontSize: '1.1rem' }}>Remove specific pages from your document. Click on a page to mark it for deletion.</p>
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
                                {deletedPages.size > 0 && ` • ${deletedPages.size} marked for deletion`}
                            </p>
                        </div>

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button onClick={() => setFile(null)} className="ghost-btn">
                                <X size={16} /> Cancel
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

                    <div style={{
                        background: 'var(--surface-2)',
                        border: '1px solid var(--line)',
                        borderRadius: '12px',
                        padding: '24px',
                        minHeight: '400px'
                    }}>
                        <Document
                            file={file}
                            onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                            onLoadError={() => setError('Failed to load PDF. It might be corrupted or encrypted.')}
                            loading={<p className="muted" style={{ textAlign: 'center' }}>Loading document...</p>}
                        >
                            {numPages && (
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                                    gap: '24px'
                                }}>
                                    {Array.from(new Array(numPages), (el, index) => {
                                        const isDeleted = deletedPages.has(index);
                                        return (
                                            <div
                                                key={`page_${index + 1}`}
                                                onClick={() => togglePageDeletion(index)}
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    cursor: 'pointer',
                                                    transition: 'transform 0.15s ease',
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (!isDeleted) e.currentTarget.style.transform = 'translateY(-4px)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.transform = 'none';
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
                                                    <Page
                                                        pageNumber={index + 1}
                                                        width={160}
                                                        renderTextLayer={false}
                                                        renderAnnotationLayer={false}
                                                        loading={<div style={{ width: 160, height: 226, background: 'var(--surface)' }} />}
                                                    />

                                                    {/* Deletion Overlay */}
                                                    {isDeleted && (
                                                        <div style={{
                                                            position: 'absolute',
                                                            top: 0, left: 0, right: 0, bottom: 0,
                                                            background: 'rgba(200, 50, 50, 0.2)',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center'
                                                        }}>
                                                            <div style={{ background: 'var(--danger)', color: '#fff', padding: '12px', borderRadius: '50%' }}>
                                                                <Trash2 size={24} />
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Hover Action Overlay (visible when not deleted) */}
                                                    {!isDeleted && (
                                                        <div className="hover-action" style={{
                                                            position: 'absolute',
                                                            top: '8px', right: '8px',
                                                            background: 'var(--danger)',
                                                            color: '#fff',
                                                            padding: '6px',
                                                            borderRadius: '50%',
                                                            opacity: 0,
                                                            transition: 'opacity 0.2s'
                                                        }}>
                                                            <Trash2 size={14} />
                                                        </div>
                                                    )}
                                                </div>
                                                <span style={{ fontSize: '0.9rem', fontWeight: 500, color: isDeleted ? 'var(--danger)' : 'var(--ink)' }}>
                                                    Page {index + 1}
                                                </span>

                                                {/* Inline styles for hover effect */}
                                                <style jsx>{`
                          div:hover .hover-action {
                            opacity: 1 !important;
                          }
                        `}</style>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </Document>
                    </div>

                </div>
            )}
        </div>
    );
}
