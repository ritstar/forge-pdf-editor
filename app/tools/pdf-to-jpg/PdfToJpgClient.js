'use client';

import { useEffect, useState, useRef } from 'react';
import { pdfjs } from '@/app/utils/pdfWorker';
import JSZip from 'jszip';
import { auth } from '@/lib/firebase/config';
import { logToolAction } from '@/lib/history';
import { downloadBlob, isPdfFile, stripExtension } from '@/app/utils/files';
import { renderPdfPageToBlob } from '@/app/utils/pdfToImage';
import { FilePlus2, FileImage, Trash2, Download, Settings, RefreshCw, X } from 'lucide-react';


export default function PdfToJpgClient() {
    const [file, setFile] = useState(null);
    const [extractedImages, setExtractedImages] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState('');
    const [error, setError] = useState('');
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef(null);
    const imagesRef = useRef([]);

    // Previews are object URLs backed by Blobs; release them whenever the set is replaced.
    const replaceImages = (next) => {
        imagesRef.current.forEach((img) => URL.revokeObjectURL(img.url));
        imagesRef.current = next;
        setExtractedImages(next);
    };

    useEffect(() => () => imagesRef.current.forEach((img) => URL.revokeObjectURL(img.url)), []);

    const handleFile = (selectedFile) => {
        setError('');
        if (!isPdfFile(selectedFile)) {
            setError('Please select a valid PDF file.');
            return;
        }
        setFile(selectedFile);
        replaceImages([]);
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

        let pdf;
        try {
            setIsProcessing(true);
            setError('');
            replaceImages([]);

            const fileBuffer = await file.arrayBuffer();
            pdf = await pdfjs.getDocument({ data: fileBuffer }).promise;
            const totalPages = pdf.numPages;
            const baseName = stripExtension(file.name);
            const images = [];

            for (let i = 1; i <= totalPages; i++) {
                setProgress(`Rendering page ${i} of ${totalPages}...`);
                const blob = await renderPdfPageToBlob(pdf, i, { scale: 2, format: 'jpeg', quality: 0.9 });
                images.push({
                    id: i,
                    blob,
                    url: URL.createObjectURL(blob),
                    name: `${baseName}_page_${i}.jpg`,
                });
            }

            replaceImages(images);
        } catch (err) {
            console.error(err);
            setError(err?.name === 'PasswordException'
                ? 'This PDF is password protected. Unlock it first.'
                : 'An error occurred while extracting images from the PDF.');
        } finally {
            pdf?.destroy();
            setProgress('');
            setIsProcessing(false);
        }
    };

    const downloadAll = async () => {
        if (!extractedImages.length) return;

        if (extractedImages.length === 1) {
            downloadBlob(extractedImages[0].blob, extractedImages[0].name);
            return;
        }

        try {
            setIsProcessing(true);
            const zip = new JSZip();

            // JPEGs are already compressed; STORE avoids burning CPU on re-deflating them.
            extractedImages.forEach((img) => {
                zip.file(img.name, img.blob, { compression: 'STORE' });
            });

            const content = await zip.generateAsync({ type: 'blob' });
            downloadBlob(content, `${stripExtension(file.name)}_images.zip`);

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
                        accept="application/pdf,.pdf"
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
                            <button onClick={() => { setFile(null); replaceImages([]); }} className="ghost-btn">
                                <X size={16} /> Cancel
                            </button>

                            {!extractedImages.length ? (
                                <button
                                    onClick={extractImages}
                                    disabled={isProcessing}
                                    className="primary-btn"
                                    style={{ background: '#D69E2E', opacity: isProcessing ? 0.6 : 1 }}
                                >
                                    {isProcessing ? <><RefreshCw size={16} className="spin" /> {progress || 'Extracting...'}</> : 'Convert to JPG'}
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
                                                src={img.url}
                                                alt={img.name}
                                                style={{ width: '100%', height: 'auto', display: 'block' }}
                                            />
                                        </div>
                                        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span className="muted" style={{ fontSize: '0.85rem' }}>Page {img.id}</span>
                                            <button
                                                onClick={() => downloadBlob(img.blob, img.name)}
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
