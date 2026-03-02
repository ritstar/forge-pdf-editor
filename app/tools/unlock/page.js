'use client';

import { useState, useRef } from 'react';
import { PDFDocument } from 'pdf-lib';
import { auth } from '@/lib/firebase/config';
import { logToolAction } from '@/lib/history';
import { FilePlus2, FileText, Trash2, Unlock, Settings, KeyRound } from 'lucide-react';

export default function UnlockPdfPage() {
    const [file, setFile] = useState(null);
    const [password, setPassword] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [dragActive, setDragActive] = useState(false);
    const [needsPassword, setNeedsPassword] = useState(false);
    const fileInputRef = useRef(null);

    const handleFile = async (selectedFile) => {
        setError('');
        setSuccessMsg('');
        setNeedsPassword(false);
        setPassword('');
        
        if (selectedFile.type !== 'application/pdf') {
            setError('Please select a valid PDF file.');
            return;
        }

        try {
            const fileBuffer = await selectedFile.arrayBuffer();
            
            // First try without password
            try {
                await PDFDocument.load(fileBuffer);
            } catch (err) {
                if (err.message?.includes('encrypted')) {
                    setNeedsPassword(true);
                } else {
                    throw err;
                }
            }

            setFile({
                obj: selectedFile,
                name: selectedFile.name,
                size: (selectedFile.size / 1024 / 1024).toFixed(2) + ' MB'
            });

        } catch (err) {
            console.error(err);
            setError('Could not read the PDF file. It might be corrupted.');
        }
    };

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
        else if (e.type === 'dragleave') setDragActive(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    };

    const processPDF = async () => {
        if (!file) return;

        try {
            setIsProcessing(true);
            setError('');
            setSuccessMsg('');

            const fileBuffer = await file.obj.arrayBuffer();
            let pdfDoc;

            try {
                pdfDoc = await PDFDocument.load(fileBuffer, { password: password || undefined });
            } catch (loadErr) {
                if (loadErr.message?.includes('password')) {
                    throw new Error('Incorrect password. Please try again.');
                }
                throw loadErr;
            }

            // By default, pdf-lib strips encryption when saving a previously encrypted doc
            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = `unlocked_${file.name}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            setSuccessMsg('PDF unlocked successfully!');
            const user = auth?.currentUser;
            if (user) {
                logToolAction(user.uid, 'unlock-pdf', 'Unlock PDF', file.name).catch(console.error);
            }

        } catch (err) {
            console.error(err);
            setError(err.message || 'An error occurred while processing the PDF.');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                <h1 style={{ fontSize: '2.5rem', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                    <div style={{ color: '#718096', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#71809615', padding: '12px', borderRadius: '12px' }}>
                        <Unlock size={32} />
                    </div>
                    Unlock PDF
                </h1>
                <p className="muted" style={{ fontSize: '1.1rem' }}>Remove password security from your PDF instantly.</p>
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
                        gap: '16px'
                    }}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: '50%', boxShadow: 'var(--shadow)' }}>
                        <FilePlus2 size={40} color="var(--accent)" />
                    </div>
                    <div>
                        <h3 style={{ margin: '0 0 8px', fontSize: '1.4rem' }}>Select encrypted PDF</h3>
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px', alignItems: 'start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'var(--surface)',
                                border: '1px solid var(--line)',
                                borderRadius: '12px',
                                padding: '40px 20px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                                gap: '16px',
                                position: 'relative',
                                minHeight: '300px'
                            }}
                        >
                            <button
                                onClick={() => setFile(null)}
                                className="ghost-btn"
                                style={{ position: 'absolute', top: '12px', right: '12px', color: 'var(--danger)', padding: '8px' }}
                                aria-label="Remove file"
                            >
                                <Trash2 size={18} />
                            </button>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#7180961A', color: '#718096', padding: '16px', borderRadius: '12px' }}>
                                <FileText size={48} />
                            </div>

                            <div style={{ textAlign: 'center' }}>
                                <p style={{ margin: '0 0 6px', fontWeight: 600, fontSize: '1.1rem', wordBreak: 'break-all' }}>
                                    {file.name}
                                </p>
                                <p className="muted small" style={{ margin: 0 }}>{file.size}</p>
                            </div>
                        </div>
                    </div>

                    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '24px', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Settings size={18} /> Unlock Options
                        </h3>

                        {needsPassword ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div style={{ padding: '12px', background: '#FEF3C7', color: '#C05621', borderRadius: '8px', fontSize: '0.9rem', display: 'flex', gap: '8px' }}>
                                    <KeyRound size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                                    <span>This file is protected. Please enter the password to unlock it.</span>
                                </div>
                                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', fontWeight: 500 }}>
                                    Document Password
                                    <input
                                        type="password"
                                        className="field"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        placeholder="Enter password"
                                    />
                                </label>
                            </div>
                        ) : (
                            <p className="muted small">This file does not appear to have a strict user password, but we will strip any existing owner restrictions.</p>
                        )}

                        {error && <p className="error-text" style={{ fontSize: '0.85rem' }}>{error}</p>}
                        {successMsg && <p style={{ color: 'var(--accent)', fontSize: '0.9rem', margin: 0, fontWeight: 500 }}>{successMsg}</p>}

                        <button
                            onClick={processPDF}
                            disabled={isProcessing || (needsPassword && !password)}
                            className="primary-btn"
                            style={{ padding: '16px', fontSize: '1.05rem', background: '#718096', color: '#fff', opacity: (isProcessing || (needsPassword && !password)) ? 0.6 : 1, width: '100%', marginTop: '10px' }}
                        >
                            {isProcessing ? 'Unlocking...' : 'Unlock PDF'} <Unlock size={18} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}