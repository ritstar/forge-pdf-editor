'use client';

import { useState, useRef } from 'react';
import { PDFDocument } from 'pdf-lib';
import { auth } from '@/lib/firebase/config';
import { logToolAction } from '@/lib/history';
import { Plus, Trash2, GripVertical, FileText, Combine, FilePlus2 } from 'lucide-react';

export default function MergePdfPage() {
    const [files, setFiles] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState('');
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef(null);

    const handleFiles = (newFiles) => {
        setError('');
        const validFiles = Array.from(newFiles).filter(file => file.type === 'application/pdf');
        if (validFiles.length !== newFiles.length) {
            setError('Some files were ignored because they are not PDFs.');
        }

        // Create local object URLs for display if needed, but for now just store the File objects
        const newFilesWithId = validFiles.map(file => ({
            id: crypto.randomUUID(),
            file,
            name: file.name,
            size: (file.size / 1024 / 1024).toFixed(2) + ' MB'
        }));

        setFiles(prev => [...prev, ...newFilesWithId]);
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
            handleFiles(e.dataTransfer.files);
        }
    };

    const removeFile = (id) => {
        setFiles(prev => prev.filter(f => f.id !== id));
    };

    const moveFile = (index, direction) => {
        if ((direction === -1 && index === 0) || (direction === 1 && index === files.length - 1)) return;
        const newFiles = [...files];
        const temp = newFiles[index];
        newFiles[index] = newFiles[index + direction];
        newFiles[index + direction] = temp;
        setFiles(newFiles);
    };

    const mergePDFs = async () => {
        if (files.length < 2) {
            setError('Please upload at least 2 PDF files to merge.');
            return;
        }

        try {
            setIsProcessing(true);
            setError('');

            const mergedPdf = await PDFDocument.create();

            for (const fileObj of files) {
                const fileBuffer = await fileObj.file.arrayBuffer();
                const pdf = await PDFDocument.load(fileBuffer);
                const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                copiedPages.forEach((page) => {
                    mergedPdf.addPage(page);
                });
            }

            const mergedPdfFile = await mergedPdf.save();
            const blob = new Blob([mergedPdfFile], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = `merged_${Date.now()}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            const user = auth.currentUser;
            if (user) {
                logToolAction(user.uid, 'merge-pdf', 'Merge PDF', `merged_${files.length}_files.pdf`);
            }

        } catch (err) {
            console.error(err);
            setError('An error occurred while merging the PDFs. Make sure they are valid PDF files.');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                <h1 style={{ fontSize: '2.5rem', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                    <div style={{ color: '#E53E3E', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#E53E3E15', padding: '12px', borderRadius: '12px' }}>
                        <Combine size={32} />
                    </div>
                    Merge PDF
                </h1>
                <p className="muted" style={{ fontSize: '1.1rem' }}>Combine PDFs in the order you want with the easiest PDF merger available.</p>
            </div>

            {!files.length ? (
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
                        gap: '16px'
                    }}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: '50%', boxShadow: 'var(--shadow)' }}>
                        <FilePlus2 size={40} color="var(--accent)" />
                    </div>
                    <div>
                        <h3 style={{ margin: '0 0 8px', fontSize: '1.4rem' }}>Select PDF files</h3>
                        <p className="muted" style={{ margin: 0 }}>or drop PDFs here</p>
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="application/pdf"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                            if (e.target.files) handleFiles(e.target.files);
                            e.target.value = '';
                        }}
                    />
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0 }}>{files.length} {files.length === 1 ? 'file' : 'files'} selected</h3>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button className="ghost-btn" onClick={() => fileInputRef.current?.click()}>
                                <FilePlus2 size={16} /> Add more files
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                accept="application/pdf"
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                    if (e.target.files) handleFiles(e.target.files);
                                    e.target.value = '';
                                }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {files.map((file, index) => (
                            <div
                                key={file.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    background: 'var(--surface)',
                                    border: '1px solid var(--line)',
                                    borderRadius: '12px',
                                    padding: '12px 16px',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                    gap: '16px'
                                }}
                            >
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                    <button onClick={() => moveFile(index, -1)} disabled={index === 0} className="ghost-btn" style={{ padding: '2px 4px', minHeight: 'auto', border: 'none', opacity: index === 0 ? 0.3 : 1 }}>▲</button>
                                    <GripVertical size={16} className="muted" />
                                    <button onClick={() => moveFile(index, 1)} disabled={index === files.length - 1} className="ghost-btn" style={{ padding: '2px 4px', minHeight: 'auto', border: 'none', opacity: index === files.length - 1 ? 0.3 : 1 }}>▼</button>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#E53E3E1A', color: '#E53E3E', padding: '10px', borderRadius: '8px' }}>
                                    <FileText size={24} />
                                </div>

                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ margin: '0 0 4px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {file.name}
                                    </p>
                                    <p className="muted small" style={{ margin: 0 }}>{file.size}</p>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => removeFile(file.id)}
                                    className="ghost-btn"
                                    style={{ color: 'var(--danger)', padding: '8px' }}
                                    aria-label="Remove file"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        ))}
                    </div>

                    {error && <p className="error-text" style={{ textAlign: 'center', padding: '10px', background: 'var(--danger-bg)', borderRadius: '8px' }}>{error}</p>}

                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
                        <button
                            onClick={mergePDFs}
                            disabled={isProcessing || files.length < 2}
                            className="primary-btn"
                            style={{ padding: '16px 32px', fontSize: '1.1rem', background: '#E53E3E', color: '#fff', opacity: (isProcessing || files.length < 2) ? 0.6 : 1 }}
                        >
                            {isProcessing ? 'Merging PDFs...' : 'Merge PDF'} <Combine size={20} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
