'use client';

import { useState, useRef } from 'react';
import { pdfjs } from 'react-pdf';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { auth } from '@/lib/firebase/config';
import { logToolAction } from '@/lib/history';
import { FilePlus2, FileImage, Trash2, Download, Settings, RefreshCw, X } from 'lucide-react';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function PdfToJpgClient() {
    const [file, setFile] = useState(null);
    const [extractedImages, setExtractedImages] = useState([]);
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
        setExtractedImages([]);
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

    const extractImages = async () => {
        if (!file) return;

        try {
            setIsProcessing(true);
            setError('');
            setExtractedImages([]);

            const fileBuffer = await file.arrayBuffer();
            const pdf = await pdfjs.getDocument(fileBuffer).promise;
            const totalPages = pdf.numPages;
            const images = [];

            for (let i = 1; i <= totalPages; i++) {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 2 }); // Higher scale = better quality

                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const context = canvas.getContext('2d');

                await page.render({ canvasContext: context, viewport }).promise;
                const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

                images.push({
                    id: i,
                    dataUrl,
                    name: `${file.name.replace('.pdf', '')}_page_${i}.jpg`
                });
            }

            setExtractedImages(images);
        } catch (err) {
            console.error(err);
            setError('An error occurred while extracting images from the PDF.');
        } finally {
            setIsProcessing(false);
        }
    };

    const downloadAll = async () => {
        if (!extractedImages.length) return;

        if (extractedImages.length === 1) {
            saveAs(extractedImages[0].dataUrl, extractedImages[0].name);
            return;
        }

        try {
            setIsProcessing(true);
            const zip = new JSZip();

            extractedImages.forEach((img) => {
                // Strip out the data url prefix specifically "data:image/jpeg;base64,"
                const base64Data = img.dataUrl.split(',')[1];
                zip.file(img.name, base64Data, { base64: true });
            });

            const content = await zip.generateAsync({ type: 'blob' });
            saveAs(content, `${file.name.replace('.pdf', '')}_images.zip`);

            const user = auth.currentUser;
            if (user) {
                logToolAction(user.uid, 'pdf-to-jpg', 'PDF to JPG', file.name);
            }
        } catch (err) {
            console.error(err);
            setError('Failed to create ZIP file.');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                <h1 style={{ fontSize: '2.5rem', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                    <div style={{ color: '#D69E2E', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#D69E2E15', padding: '12px', borderRadius: '12px' }}>
                        <FileImage size={32} />
                    </div>
                    PDF to JPG
                </h1>
                <p className="muted" style={{ fontSize: '1.1rem' }}>Extract all pages from a PDF to high-quality JPG images.</p>
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
                                {(file.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            <button onClick={() => { setFile(null); setExtractedImages([]); }} className="ghost-btn">
                                <X size={16} /> Cancel
                            </button>

                            {!extractedImages.length ? (
                                <button
                                    onClick={extractImages}
                                    disabled={isProcessing}
                                    className="primary-btn"
                                    style={{ background: '#D69E2E', opacity: isProcessing ? 0.6 : 1 }}
                                >
                                    {isProcessing ? <><RefreshCw size={16} className="spin" /> Extracting...</> : 'Convert to JPG'}
                                </button>
                            ) : (
                                <button
                                    onClick={downloadAll}
                                    disabled={isProcessing}
                                    className="primary-btn"
                                    style={{ background: '#38A169', opacity: isProcessing ? 0.6 : 1 }}
                                >
                                    <Download size={16} /> {extractedImages.length > 1 ? 'Download All (ZIP)' : 'Download Image'}
                                </button>
                            )}
                        </div>
                    </div>

                    {error && <p className="error-text" style={{ textAlign: 'center' }}>{error}</p>}

                    {extractedImages.length > 0 && (
                        <div style={{
                            background: 'var(--surface-2)',
                            border: '1px solid var(--line)',
                            borderRadius: '12px',
                            padding: '24px'
                        }}>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                gap: '24px'
                            }}>
                                {extractedImages.map((img) => (
                                    <div
                                        key={`page_${img.id}`}
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            gap: '12px',
                                            background: 'var(--surface)',
                                            padding: '12px',
                                            borderRadius: '12px',
                                            border: '1px solid var(--line)',
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                                        }}
                                    >
                                        <div style={{
                                            width: '100%',
                                            borderRadius: '6px',
                                            overflow: 'hidden',
                                            border: '1px solid var(--line)'
                                        }}>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={img.dataUrl}
                                                alt={img.name}
                                                style={{ width: '100%', height: 'auto', display: 'block' }}
                                            />
                                        </div>
                                        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span className="muted" style={{ fontSize: '0.85rem' }}>Page {img.id}</span>
                                            <button
                                                onClick={() => saveAs(img.dataUrl, img.name)}
                                                className="ghost-btn"
                                                style={{ padding: '6px' }}
                                                title="Download Image"
                                                aria-label="Download Image"
                                            >
                                                <Download size={16} color="var(--accent)" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                </div>
            )}
        </div>
    );
}
