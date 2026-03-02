'use client';

import { useState, useRef } from 'react';
import { PDFDocument, degrees } from 'pdf-lib';
import { Document, Page, pdfjs } from 'react-pdf';
import { auth } from '@/lib/firebase/config';
import { logToolAction } from '@/lib/history';
import { FilePlus2, RotateCw, RefreshCw, X } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function RotateClient() {
    const [file, setFile] = useState(null);
    const [numPages, setNumPages] = useState(null);
    const [pageRotations, setPageRotations] = useState({});
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
        setPageRotations({});
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

    const rotatePage = (index) => {
        setPageRotations(prev => {
            const currentRotation = prev[index] || 0;
            return {
                ...prev,
                [index]: (currentRotation + 90) % 360
            };
        });
    };

    const rotateAll = () => {
        if (!numPages) return;
        setPageRotations(prev => {
            const next = {};
            for (let i = 0; i < numPages; i++) {
                const current = prev[i] || 0;
                next[i] = (current + 90) % 360;
            }
            return next;
        });
    };

    const applyRotation = async () => {
        if (!file || !numPages) return;

        // Check if any page actually has non-zero rotation
        const hasRotation = Object.values(pageRotations).some(r => r > 0);
        if (!hasRotation) {
            setError('No pages have been rotated. Please rotate at least one page.');
            return;
        }

        try {
            setIsProcessing(true);
            setError('');

            const fileBuffer = await file.arrayBuffer();
            const pdf = await PDFDocument.load(fileBuffer);

            const pages = pdf.getPages();
            pages.forEach((page, i) => {
                const customRotation = pageRotations[i] || 0;
                if (customRotation > 0) {
                    const currentRotation = page.getRotation().angle;
                    page.setRotation(degrees(currentRotation + customRotation));
                }
            });

            const newPdfBytes = await pdf.save();
            const blob = new Blob([newPdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = `rotated_${file.name}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            const user = auth.currentUser;
            if (user) {
                logToolAction(user.uid, 'rotate-pdf', 'Rotate PDF', file.name);
            }
        } catch (err) {
            console.error(err);
            setError('An error occurred while rotating the PDF pages.');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                <h1 style={{ fontSize: '2.5rem', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                    <div style={{ color: '#3182CE', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#3182CE15', padding: '12px', borderRadius: '12px' }}>
                        <RotateCw size={32} />
                    </div>
                    Rotate PDF
                </h1>
                <p className="muted" style={{ fontSize: '1.1rem' }}>Rotate your PDFs the way you need them. Click a page to rotate it.</p>
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

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--line)', padding: '16px 20px', borderRadius: '12px', boxShadow: 'var(--shadow)', flexWrap: 'wrap', gap: '12px' }}>
                        <div>
                            <h3 style={{ margin: '0 0 4px', fontSize: '1.1rem' }}>{file.name}</h3>
                            <p className="muted small" style={{ margin: 0 }}>
                                {numPages ? `${numPages} pages total` : 'Loading...'}
                            </p>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            <button onClick={() => setFile(null)} className="ghost-btn">
                                <X size={16} /> Cancel
                            </button>
                            <button
                                onClick={rotateAll}
                                disabled={!numPages}
                                className="ghost-btn"
                                style={{ color: '#3182CE', borderColor: '#3182CE30', background: '#3182CE05' }}
                            >
                                <RotateCw size={16} /> Rotate All Pages
                            </button>
                            <button
                                onClick={applyRotation}
                                disabled={isProcessing || !numPages}
                                className="primary-btn"
                                style={{ background: '#3182CE', opacity: (isProcessing || !numPages) ? 0.6 : 1 }}
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
                                        const rotation = pageRotations[index] || 0;
                                        return (
                                            <div
                                                key={`page_${index + 1}`}
                                                onClick={() => rotatePage(index)}
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    gap: '12px',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                <div className="hover-rotate-container" style={{
                                                    position: 'relative',
                                                    border: '1px solid var(--line)',
                                                    borderRadius: '8px',
                                                    overflow: 'visible',
                                                    background: 'white',
                                                    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                                                    transform: `rotate(${rotation}deg)`,
                                                    transition: 'transform 0.3s ease',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    width: 160,
                                                    height: 226,
                                                }}>
                                                    <Page
                                                        pageNumber={index + 1}
                                                        height={226}
                                                        width={160}
                                                        renderTextLayer={false}
                                                        renderAnnotationLayer={false}
                                                        loading={<div style={{ width: 160, height: 226, background: 'var(--surface)' }} />}
                                                    />

                                                    {/* Hover Action Overlay */}
                                                    <div className="hover-action" style={{
                                                        position: 'absolute',
                                                        top: '50%', left: '50%',
                                                        transform: 'translate(-50%, -50%)',
                                                        background: 'rgba(49, 130, 206, 0.9)',
                                                        color: '#fff',
                                                        padding: '16px',
                                                        borderRadius: '50%',
                                                        opacity: 0,
                                                        transition: 'opacity 0.2s',
                                                        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                                                    }}>
                                                        <RotateCw size={24} />
                                                    </div>
                                                </div>
                                                <span style={{ fontSize: '0.9rem', fontWeight: 500, color: rotation > 0 ? '#3182CE' : 'var(--ink)' }}>
                                                    Page {index + 1}
                                                </span>

                                                <style jsx>{`
                          .hover-rotate-container:hover .hover-action {
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
