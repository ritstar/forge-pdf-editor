'use client';

import { useState, useRef } from 'react';
import { PDFDocument } from 'pdf-lib';
import { auth } from '@/lib/firebase/config';
import { logToolAction } from '@/lib/history';
import { Plus, Trash2, FileImage, Image as ImageIcon, GripVertical } from 'lucide-react';

export default function JpgToPdfPage() {
    const [images, setImages] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState('');
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef(null);

    const handleFiles = (newFiles) => {
        setError('');
        const validFiles = Array.from(newFiles).filter(file => file.type.startsWith('image/'));

        if (validFiles.length !== newFiles.length) {
            setError('Some files were ignored because they are not valid images.');
        }

        const newImagesWithId = validFiles.map(file => ({
            id: crypto.randomUUID(),
            file,
            name: file.name,
            url: URL.createObjectURL(file),
            size: (file.size / 1024 / 1024).toFixed(2) + ' MB'
        }));

        setImages(prev => [...prev, ...newImagesWithId]);
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

    const removeImage = (id) => {
        setImages(prev => prev.filter(img => img.id !== id));
    };

    const moveImage = (index, direction) => {
        if ((direction === -1 && index === 0) || (direction === 1 && index === images.length - 1)) return;
        const newImages = [...images];
        const temp = newImages[index];
        newImages[index] = newImages[index + direction];
        newImages[index + direction] = temp;
        setImages(newImages);
    };

    const convertToPDF = async () => {
        if (!images.length) return;

        try {
            setIsProcessing(true);
            setError('');

            const pdfDoc = await PDFDocument.create();

            for (const imgObj of images) {
                const imageBuffer = await imgObj.file.arrayBuffer();
                let embeddedImage;

                if (imgObj.file.type === 'image/jpeg' || imgObj.file.type === 'image/jpg') {
                    embeddedImage = await pdfDoc.embedJpg(imageBuffer);
                } else if (imgObj.file.type === 'image/png') {
                    embeddedImage = await pdfDoc.embedPng(imageBuffer);
                } else {
                    // If unsupported (like WebP/GIF), skip or handle via canvas.
                    // pdf-lib only natively supports PNG and JPG.
                    throw new Error(`Unsupported image format: ${imgObj.file.type}. Please use JPG or PNG.`);
                }

                const { width, height } = embeddedImage.scale(1);
                const page = pdfDoc.addPage([width, height]);

                page.drawImage(embeddedImage, {
                    x: 0,
                    y: 0,
                    width,
                    height,
                });
            }

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = `images_converted_${Date.now()}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            const user = auth.currentUser;
            if (user) {
                logToolAction(user.uid, 'jpg-to-pdf', 'JPG to PDF', `converted_${images.length}_images.pdf`);
            }
        } catch (err) {
            console.error(err);
            setError(err.message || 'An error occurred while converting images to PDF.');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                <h1 style={{ fontSize: '2.5rem', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                    <div style={{ color: '#D69E2E', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#D69E2E15', padding: '12px', borderRadius: '12px' }}>
                        <FileImage size={32} />
                    </div>
                    JPG to PDF
                </h1>
                <p className="muted" style={{ fontSize: '1.1rem' }}>Convert JPG, PNG images to PDF in seconds. Easily adjust orientation and margins.</p>
            </div>

            {!images.length ? (
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
                        <ImageIcon size={40} color="var(--accent)" />
                    </div>
                    <div>
                        <h3 style={{ margin: '0 0 8px', fontSize: '1.4rem' }}>Select JPG images</h3>
                        <p className="muted" style={{ margin: 0 }}>or drop images here</p>
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/jpeg, image/png"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                            if (e.target.files) handleFiles(e.target.files);
                            e.target.value = '';
                        }}
                    />
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                        <h3 style={{ margin: 0 }}>{images.length} {images.length === 1 ? 'image' : 'images'} selected</h3>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button className="ghost-btn" onClick={() => fileInputRef.current?.click()}>
                                <Plus size={16} /> Add more images
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                accept="image/jpeg, image/png"
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                    if (e.target.files) handleFiles(e.target.files);
                                    e.target.value = '';
                                }}
                            />
                        </div>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                        gap: '16px',
                        background: 'var(--surface-2)',
                        padding: '20px',
                        borderRadius: '12px',
                        border: '1px solid var(--line)'
                    }}>
                        {images.map((img, index) => (
                            <div
                                key={img.id}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    background: 'var(--surface)',
                                    border: '1px solid var(--line)',
                                    borderRadius: '12px',
                                    padding: '12px',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                    gap: '10px',
                                    position: 'relative'
                                }}
                            >
                                <div style={{ height: '140px', width: '100%', borderRadius: '8px', overflow: 'hidden', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={img.url} alt={img.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                </div>

                                <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
                                    <p style={{ margin: '0 0 2px', fontWeight: 500, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {img.name}
                                    </p>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                        <button onClick={() => moveImage(index, -1)} disabled={index === 0} className="ghost-btn" style={{ padding: '4px', minHeight: 'auto', border: 'none', opacity: index === 0 ? 0.3 : 1 }}><GripVertical size={14} /></button>
                                        <button onClick={() => moveImage(index, 1)} disabled={index === images.length - 1} className="ghost-btn" style={{ padding: '4px', minHeight: 'auto', border: 'none', opacity: index === images.length - 1 ? 0.3 : 1 }}><GripVertical size={14} /></button>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => removeImage(img.id)}
                                        className="ghost-btn"
                                        style={{ color: 'var(--danger)', padding: '4px', border: 'none' }}
                                        aria-label="Remove image"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {error && <p className="error-text" style={{ textAlign: 'center', padding: '10px', background: 'var(--danger-bg)', borderRadius: '8px' }}>{error}</p>}

                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
                        <button
                            onClick={convertToPDF}
                            disabled={isProcessing || !images.length}
                            className="primary-btn"
                            style={{ padding: '16px 32px', fontSize: '1.1rem', background: '#D69E2E', color: '#fff', opacity: (isProcessing || !images.length) ? 0.6 : 1 }}
                        >
                            {isProcessing ? 'Converting to PDF...' : 'Convert to PDF'} <FileImage size={20} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
