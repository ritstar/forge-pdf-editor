'use client';

import { useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import { Download, Image as ImageIcon } from 'lucide-react';
import { pdfjs } from '@/app/utils/pdfWorker';
import ToolShell from '@/app/components/ToolShell';
import { auth } from '@/lib/firebase/config';
import { logToolAction } from '@/lib/history';
import { downloadBlob, formatFileSize, isPdfFile, stripExtension } from '@/app/utils/files';
import { renderPdfPageToBlob } from '@/app/utils/pdfToImage';

const QUALITY = {
    standard: { scale: 1.5, label: 'Standard', detail: '~108 DPI, smaller files' },
    high: { scale: 2.5, label: 'High', detail: '~180 DPI, sharper text' },
};

export default function PdfToJpgClient() {
    const [file, setFile] = useState(null);
    const [images, setImages] = useState([]);
    const [quality, setQuality] = useState('high');
    const [format, setFormat] = useState('jpeg');
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState('');
    const [error, setError] = useState('');
    const imagesRef = useRef([]);

    // Previews are object URLs backed by Blobs; release them whenever the set is replaced.
    const replaceImages = (next) => {
        imagesRef.current.forEach((img) => URL.revokeObjectURL(img.url));
        imagesRef.current = next;
        setImages(next);
    };

    useEffect(() => () => imagesRef.current.forEach((img) => URL.revokeObjectURL(img.url)), []);

    const handleFiles = ([selectedFile]) => {
        setError('');
        if (!isPdfFile(selectedFile)) {
            setError('Please select a valid PDF file.');
            return;
        }
        setFile(selectedFile);
        replaceImages([]);
    };

    const extension = format === 'jpeg' ? 'jpg' : 'png';

    const convert = async () => {
        if (!file) return;

        let pdf;
        try {
            setIsProcessing(true);
            setError('');
            replaceImages([]);

            pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
            const totalPages = pdf.numPages;
            const baseName = stripExtension(file.name);
            const rendered = [];

            for (let i = 1; i <= totalPages; i++) {
                setProgress(`Rendering page ${i} of ${totalPages}…`);
                const blob = await renderPdfPageToBlob(pdf, i, { scale: QUALITY[quality].scale, format, quality: 0.9 });
                rendered.push({ id: i, blob, url: URL.createObjectURL(blob), name: `${baseName}_page_${i}.${extension}` });
            }

            replaceImages(rendered);

            const user = auth.currentUser;
            if (user) {
                logToolAction(user.uid, 'pdf-to-jpg', 'PDF to JPG', file.name);
            }
        } catch (err) {
            console.error(err);
            setError(err?.name === 'PasswordException'
                ? 'This PDF is password protected. Unlock it first.'
                : 'An error occurred while converting the PDF.');
        } finally {
            pdf?.destroy();
            setProgress('');
            setIsProcessing(false);
        }
    };

    const downloadAll = async () => {
        if (images.length === 1) {
            downloadBlob(images[0].blob, images[0].name);
            return;
        }

        try {
            setIsProcessing(true);
            setProgress('Creating ZIP…');
            const zip = new JSZip();
            // Images are already compressed; STORE avoids burning CPU on re-deflating them.
            images.forEach((img) => zip.file(img.name, img.blob, { compression: 'STORE' }));
            downloadBlob(await zip.generateAsync({ type: 'blob' }), `${stripExtension(file.name)}_images.zip`);
        } catch (err) {
            console.error(err);
            setError('Failed to create ZIP file.');
        } finally {
            setProgress('');
            setIsProcessing(false);
        }
    };

    const totalSize = images.reduce((sum, img) => sum + img.blob.size, 0);
    const done = images.length > 0;

    return (
        <ToolShell
            toolId="pdf-to-jpg"
            stage={file ? 'work' : 'select'}
            error={error}
            onReset={() => { setFile(null); replaceImages([]); setError(''); }}
            dropzone={{ accept: 'application/pdf,.pdf', onFiles: handleFiles, title: 'Select a PDF', hint: 'or drop it here' }}
            workspaceTitle={done ? `${images.length} images` : file?.name}
            workspaceSubtitle={done ? `${formatFileSize(totalSize)} total · click an image to download it` : file ? formatFileSize(file.size) : null}
            panel={{
                subtitle: 'Export every page as an image',
                body: (
                    <>
                        <div className="field">
                            <span className="field-label">Format</span>
                            <div className="segmented" role="group" aria-label="Format">
                                <button type="button" aria-pressed={format === 'jpeg'} onClick={() => { setFormat('jpeg'); replaceImages([]); }}>JPG</button>
                                <button type="button" aria-pressed={format === 'png'} onClick={() => { setFormat('png'); replaceImages([]); }}>PNG</button>
                            </div>
                        </div>
                        <div className="field">
                            <span className="field-label">Quality</span>
                            <div className="option-list" role="group" aria-label="Quality">
                                {Object.entries(QUALITY).map(([key, q]) => (
                                    <button key={key} type="button" className="option-card" aria-pressed={quality === key} onClick={() => { setQuality(key); replaceImages([]); }}>
                                        <span className="option-dot" />
                                        <span><strong>{q.label}</strong><span>{q.detail}</span></span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        {progress ? <p className="small muted" role="status">{progress}</p> : null}
                    </>
                ),
                action: done
                    ? { label: images.length === 1 ? 'Download image' : 'Download all (ZIP)', icon: Download, busyLabel: progress || 'Working…', onClick: downloadAll, busy: isProcessing }
                    : { label: `Convert to ${format === 'jpeg' ? 'JPG' : 'PNG'}`, icon: ImageIcon, busyLabel: progress || 'Converting…', onClick: convert, busy: isProcessing },
            }}
        >
            {done ? (
                <div className="image-grid">
                    {images.map((img) => (
                        <button key={img.id} type="button" className="image-tile" onClick={() => downloadBlob(img.blob, img.name)} title={`Download ${img.name}`} style={{ textAlign: 'left' }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={img.url} alt={`Page ${img.id}`} />
                            <span className="image-tile-name">Page {img.id} · {formatFileSize(img.blob.size)}</span>
                            <span className="page-tile-tools"><span className="tile-btn"><Download size={14} /></span></span>
                        </button>
                    ))}
                </div>
            ) : (
                <div className="empty-state">
                    <span className="icon-tile lg" style={{ '--tile': 'var(--cat-convert-from)' }}><ImageIcon size={24} /></span>
                    <h3>Ready to convert</h3>
                    <p>Choose a format and quality, then convert. Every page becomes its own image.</p>
                </div>
            )}
        </ToolShell>
    );
}
