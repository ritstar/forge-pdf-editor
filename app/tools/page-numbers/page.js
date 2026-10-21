'use client';

import { useState } from 'react';
import { PDFDocument, rgb, StandardFonts } from '@cantoo/pdf-lib';
import { Hash } from 'lucide-react';
import ToolShell from '@/app/components/ToolShell';
import { getPageFrame, placeAt } from '@/app/utils/pdfCoords';
import { auth } from '@/lib/firebase/config';
import { logToolAction } from '@/lib/history';
import { downloadPdfBytes, formatFileSize, isPdfFile, stripExtension } from '@/app/utils/files';

const POSITIONS = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'];
const FORMATS = [
    { value: '1', label: '1' },
    { value: 'Page 1', label: 'Page 1' },
    { value: '1 of 10', label: '1 of N' },
];

export default function PageNumbersPage() {
    const [file, setFile] = useState(null);
    const [totalPages, setTotalPages] = useState(0);
    const [position, setPosition] = useState('bottom-center');
    const [format, setFormat] = useState('1');
    const [startAt, setStartAt] = useState(1);
    const [skipFirst, setSkipFirst] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState('');

    const handleFiles = async ([selectedFile]) => {
        setError('');
        setResult('');
        if (!isPdfFile(selectedFile)) {
            setError('Please select a valid PDF file.');
            return;
        }

        try {
            const pdfDoc = await PDFDocument.load(await selectedFile.arrayBuffer(), { ignoreEncryption: true });
            setFile(selectedFile);
            setTotalPages(pdfDoc.getPageCount());
        } catch (err) {
            console.error(err);
            setError('Could not read the PDF file. It might be corrupted.');
        }
    };

    const labelFor = (pageNum, count) => {
        if (format === 'Page 1') return `Page ${pageNum}`;
        if (format === '1 of 10') return `${pageNum} of ${count}`;
        return `${pageNum}`;
    };

    const processPDF = async () => {
        if (!file) return;

        try {
            setIsProcessing(true);
            setError('');
            setResult('');

            const pdfDoc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
            const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const pages = pdfDoc.getPages();
            const numbered = skipFirst ? pages.length - 1 : pages.length;
            const lastNumber = Number(startAt) + numbered - 1;

            pages.forEach((page, index) => {
                if (skipFirst && index === 0) return;
                // Work in the page's visible frame so numbers land correctly on rotated or
                // cropped pages (e.g. scanned landscape pages stored with /Rotate 90).
                const frame = getPageFrame(page);
                const pageNum = Number(startAt) + index - (skipFirst ? 1 : 0);
                const text = labelFor(pageNum, lastNumber);

                const fontSize = Math.max(8, Math.min(12, frame.width / 50));
                const margin = Math.min(30, frame.height * 0.05);
                const textWidth = helveticaFont.widthOfTextAtSize(text, fontSize);

                let u = frame.width / 2 - textWidth / 2;
                if (position.includes('left')) u = margin;
                if (position.includes('right')) u = frame.width - textWidth - margin;
                // v is the baseline measured from the top of the visible page.
                const v = position.includes('top') ? margin + fontSize : frame.height - margin;

                page.drawText(text, {
                    ...placeAt(frame, u, v),
                    size: fontSize,
                    font: helveticaFont,
                    color: rgb(0, 0, 0),
                });
            });

            downloadPdfBytes(await pdfDoc.save(), `${stripExtension(file.name)}_numbered.pdf`);
            setResult(`Numbered ${numbered} ${numbered === 1 ? 'page' : 'pages'} — downloaded.`);

            const user = auth?.currentUser;
            if (user) {
                logToolAction(user.uid, 'page-numbers', 'Add Page Numbers', file.name).catch(console.error);
            }
        } catch (err) {
            console.error(err);
            setError('An error occurred while processing the PDF.');
        } finally {
            setIsProcessing(false);
        }
    };

    const [vertical, horizontal] = position.split('-');
    const sample = labelFor(Number(startAt) || 1, Math.max(totalPages, 1));

    return (
        <ToolShell
            toolId="page-numbers"
            stage={file ? 'work' : 'select'}
            error={error}
            onReset={() => { setFile(null); setError(''); setResult(''); }}
            dropzone={{ accept: 'application/pdf,.pdf', onFiles: handleFiles, title: 'Select a PDF', hint: 'or drop it here' }}
            workspaceTitle="Preview"
            workspaceSubtitle={file ? `${file.name} · ${totalPages} pages · ${formatFileSize(file.size)}` : null}
            panel={{
                subtitle: 'Choose position and style',
                body: (
                    <>
                        <div className="field">
                            <span className="field-label">Position</span>
                            <div className="position-grid" role="group" aria-label="Position">
                                {POSITIONS.map((p) => (
                                    <button key={p} type="button" aria-pressed={position === p} aria-label={p.replace('-', ' ')} onClick={() => setPosition(p)} />
                                ))}
                            </div>
                        </div>
                        <div className="field">
                            <span className="field-label">Format</span>
                            <div className="segmented" role="group" aria-label="Format">
                                {FORMATS.map((f) => (
                                    <button key={f.value} type="button" aria-pressed={format === f.value} onClick={() => setFormat(f.value)}>{f.label}</button>
                                ))}
                            </div>
                        </div>
                        <div className="field">
                            <label className="field-label" htmlFor="pn-start">Start numbering at</label>
                            <input id="pn-start" className="input" type="number" min={1} value={startAt} onChange={(e) => setStartAt(Math.max(1, Number(e.target.value) || 1))} />
                        </div>
                        <label className="check-row">
                            <input type="checkbox" checked={skipFirst} onChange={(e) => setSkipFirst(e.target.checked)} />
                            Don&apos;t number the first page (cover)
                        </label>
                    </>
                ),
                result,
                action: { label: 'Add page numbers', icon: Hash, busyLabel: 'Numbering…', onClick: processPDF, busy: isProcessing },
            }}
        >
            <div style={{ display: 'grid', placeItems: 'center', padding: '16px 0' }}>
                <div
                    className="page-tile-sheet"
                    style={{
                        width: 260,
                        aspectRatio: '1 / 1.414',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: vertical === 'top' ? 'flex-start' : 'flex-end',
                        alignItems: horizontal === 'left' ? 'flex-start' : horizontal === 'right' ? 'flex-end' : 'center',
                        padding: 18,
                        lineHeight: 1.4,
                    }}
                >
                    <div style={{ position: 'absolute', inset: '44px 26px', display: 'grid', gap: 8, alignContent: 'start' }}>
                        <i style={{ display: 'block', height: 8, width: '55%', background: '#d1d5db', borderRadius: 3 }} />
                        {Array.from({ length: 9 }, (_, i) => (
                            <i key={i} style={{ display: 'block', height: 4, width: `${92 - (i % 3) * 12}%`, background: '#e5e7eb', borderRadius: 2 }} />
                        ))}
                    </div>
                    <span style={{ position: 'relative', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 11, color: '#111827', background: 'var(--accent-soft)', outline: '1px dashed var(--accent)', padding: '1px 4px', borderRadius: 2 }}>
                        {sample}
                    </span>
                </div>
                <p className="small muted" style={{ marginTop: 12 }}>Example of how numbers will appear</p>
            </div>
        </ToolShell>
    );
}
