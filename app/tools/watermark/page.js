'use client';

import { useState, useRef } from 'react';
import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import { auth } from '@/lib/firebase/config';
import { logToolAction } from '@/lib/history';
import { FilePlus2, FileText, Trash2, Stamp, Settings } from 'lucide-react';

export default function WatermarkPage() {
    const [file, setFile] = useState(null);
    const [totalPages, setTotalPages] = useState(0);
    const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');
    const [opacity, setOpacity] = useState(0.3);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState('');
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef(null);

    const handleFile = async (selectedFile) => {
        setError('');
        if (selectedFile.type !== 'application/pdf') {
            setError('Please select a valid PDF file.');
            return;
        }

        try {
            const fileBuffer = await selectedFile.arrayBuffer();
            const pdfDoc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
            const pages = pdfDoc.getPageCount();

            setFile({
                obj: selectedFile,
                name: selectedFile.name,
                size: (selectedFile.size / 1024 / 1024).toFixed(2) + ' MB'
            });
            setTotalPages(pages);
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
        if (!file || !watermarkText.trim()) return;

        try {
            setIsProcessing(true);
            setError('');

            const fileBuffer = await file.obj.arrayBuffer();
            const pdfDoc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
            const helveticaFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
            
            const pages = pdfDoc.getPages();

            pages.forEach((page) => {
                const { width, height } = page.getSize();
                const fontSize = 60;
                const textWidth = helveticaFont.widthOfTextAtSize(watermarkText, fontSize);
                
                // Draw diagonal watermark in the center
                page.drawText(watermarkText, {
                    x: width / 2 - (textWidth / 2 * 0.707) + (fontSize/2 * 0.707),
                    y: height / 2 - (textWidth / 2 * 0.707) - (fontSize/2 * 0.707),
                    size: fontSize,
                    font: helveticaFont,
                    color: rgb(0.5, 0.5, 0.5),
                    opacity: Number(opacity),
                    rotate: degrees(45),
                });
            });

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = `watermarked_${file.name}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            const user = auth?.currentUser;
            if (user) {
                logToolAction(user.uid, 'watermark', 'Add Watermark', file.name).catch(console.error);
            }

        } catch (err) {
            console.error(err);
            setError('An error occurred while processing the PDF.');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                <h1 style={{ fontSize: '2.5rem', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                    <div style={{ color: '#3182CE', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#3182CE15', padding: '12px', borderRadius: '12px' }}>
                        <Stamp size={32} />
                    </div>
                    Add Watermark
                </h1>
                <p className="muted" style={{ fontSize: '1.1rem' }}>Stamp text over your PDF in seconds. Adjust transparency and text.</p>
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

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#3182CE1A', color: '#3182CE', padding: '16px', borderRadius: '12px' }}>
                                <FileText size={48} />
                            </div>

                            <div style={{ textAlign: 'center' }}>
                                <p style={{ margin: '0 0 6px', fontWeight: 600, fontSize: '1.1rem', wordBreak: 'break-all' }}>
                                    {file.name}
                                </p>
                                <p className="muted small" style={{ margin: 0 }}>{file.size} • {totalPages} pages</p>
                            </div>
                        </div>
                    </div>

                    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '24px', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Settings size={18} /> Watermark Options
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', fontWeight: 500 }}>
                                Text
                                <input
                                    type="text"
                                    className="field"
                                    value={watermarkText}
                                    onChange={e => setWatermarkText(e.target.value)}
                                    placeholder="e.g. CONFIDENTIAL"
                                />
                            </label>

                            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem', fontWeight: 500 }}>
                                Transparency ({Math.round(opacity * 100)}%)
                                <input
                                    type="range"
                                    min={0.1}
                                    max={1.0}
                                    step={0.1}
                                    value={opacity}
                                    onChange={e => setOpacity(e.target.value)}
                                />
                            </label>
                        </div>

                        {error && <p className="error-text" style={{ fontSize: '0.85rem' }}>{error}</p>}

                        <button
                            onClick={processPDF}
                            disabled={isProcessing || !watermarkText.trim()}
                            className="primary-btn"
                            style={{ padding: '16px', fontSize: '1.05rem', background: '#3182CE', color: '#fff', opacity: (isProcessing || !watermarkText.trim()) ? 0.6 : 1, width: '100%', marginTop: '10px' }}
                        >
                            {isProcessing ? 'Processing...' : 'Add Watermark'} <Stamp size={18} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}