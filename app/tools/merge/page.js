'use client';

import { useRef, useState } from 'react';
import { PDFDocument } from '@cantoo/pdf-lib';
import { ArrowDown, ArrowUp, Combine, GripVertical, Plus, X } from 'lucide-react';
import ToolShell from '@/app/components/ToolShell';
import { auth } from '@/lib/firebase/config';
import { logToolAction } from '@/lib/history';
import { downloadPdfBytes, formatFileSize, isPdfFile } from '@/app/utils/files';
import { moveItem, useReorder } from '@/app/utils/useReorder';

async function countPages(file) {
    try {
        const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true, updateMetadata: false });
        return doc.getPageCount();
    } catch {
        return null;
    }
}

export default function MergePdfPage() {
    const [files, setFiles] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState('');
    const addInputRef = useRef(null);
    const { itemProps, stateClass } = useReorder((from, to) => setFiles((prev) => moveItem(prev, from, to)));

    const handleFiles = (newFiles) => {
        setError('');
        setResult('');
        const validFiles = newFiles.filter(isPdfFile);
        if (validFiles.length !== newFiles.length) {
            setError('Some files were skipped because they are not PDFs.');
        }

        const entries = validFiles.map((file) => ({ id: crypto.randomUUID(), file, pages: undefined }));
        setFiles((prev) => [...prev, ...entries]);

        // Page counts load in the background so the list appears immediately.
        entries.forEach(async (entry) => {
            const pages = await countPages(entry.file);
            setFiles((prev) => prev.map((item) => (item.id === entry.id ? { ...item, pages } : item)));
        });
    };

    const removeFile = (id) => setFiles((prev) => prev.filter((f) => f.id !== id));

    const totalPages = files.reduce((sum, f) => sum + (f.pages || 0), 0);
    const totalSize = files.reduce((sum, f) => sum + f.file.size, 0);

    const mergePDFs = async () => {
        if (files.length < 2) {
            setError('Add at least 2 PDF files to merge.');
            return;
        }

        try {
            setIsProcessing(true);
            setError('');
            setResult('');

            const mergedPdf = await PDFDocument.create();

            for (const fileObj of files) {
                const fileBuffer = await fileObj.file.arrayBuffer();
                let pdf;
                try {
                    pdf = await PDFDocument.load(fileBuffer);
                } catch (loadError) {
                    if (loadError?.name === 'EncryptedPDFError') {
                        throw new Error(`"${fileObj.file.name}" is password protected. Unlock it first.`);
                    }
                    throw new Error(`"${fileObj.file.name}" could not be read. It may be corrupted.`);
                }
                const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                copiedPages.forEach((page) => mergedPdf.addPage(page));
            }

            const mergedPdfFile = await mergedPdf.save();
            downloadPdfBytes(mergedPdfFile, `merged_${files.length}_files.pdf`);
            setResult(`Merged ${files.length} files (${mergedPdf.getPageCount()} pages) — downloaded.`);

            const user = auth.currentUser;
            if (user) {
                logToolAction(user.uid, 'merge-pdf', 'Merge PDF', `merged_${files.length}_files.pdf`);
            }
        } catch (err) {
            console.error(err);
            setError(err.message || 'An error occurred while merging the PDFs.');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <ToolShell
            toolId="merge-pdf"
            stage={files.length ? 'work' : 'select'}
            error={error}
            onReset={() => { setFiles([]); setError(''); setResult(''); }}
            dropzone={{
                accept: 'application/pdf,.pdf',
                multiple: true,
                onFiles: handleFiles,
                title: 'Select PDF files',
                hint: 'or drop them here — you can reorder them next',
            }}
            workspaceTitle={`${files.length} ${files.length === 1 ? 'file' : 'files'}`}
            workspaceSubtitle="Drag to reorder. Files are merged top to bottom."
            workspaceActions={
                <>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => addInputRef.current?.click()}>
                        <Plus size={15} /> Add files
                    </button>
                    <input
                        ref={addInputRef}
                        type="file"
                        accept="application/pdf,.pdf"
                        multiple
                        hidden
                        onChange={(e) => {
                            handleFiles(Array.from(e.target.files || []));
                            e.target.value = '';
                        }}
                    />
                </>
            }
            panel={{
                subtitle: 'Combine into a single PDF',
                body: (
                    <div className="summary-list">
                        <div><span>Files</span><strong>{files.length}</strong></div>
                        <div><span>Total pages</span><strong>{totalPages || '—'}</strong></div>
                        <div><span>Total size</span><strong>{formatFileSize(totalSize)}</strong></div>
                    </div>
                ),
                result,
                action: {
                    label: 'Merge PDFs',
                    icon: Combine,
                    busyLabel: 'Merging…',
                    onClick: mergePDFs,
                    disabled: files.length < 2,
                    busy: isProcessing,
                },
                footnote: files.length < 2 ? 'Add at least one more PDF to merge.' : null,
            }}
        >
            <div className="file-list">
                {files.map((item, index) => (
                    <div key={item.id} className={`file-item ${stateClass(index)}`} {...itemProps(index)}>
                        <GripVertical size={16} className="grip" aria-hidden="true" />
                        <span className="file-item-index">{index + 1}</span>
                        <span className="doc-icon">PDF</span>
                        <div className="file-item-body">
                            <strong>{item.file.name}</strong>
                            <span>
                                {formatFileSize(item.file.size)}
                                {item.pages === undefined ? '' : item.pages === null ? ' · unreadable' : ` · ${item.pages} ${item.pages === 1 ? 'page' : 'pages'}`}
                            </span>
                        </div>
                        <div className="file-item-actions">
                            <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setFiles((prev) => moveItem(prev, index, index - 1))} disabled={index === 0} aria-label="Move up">
                                <ArrowUp size={15} />
                            </button>
                            <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setFiles((prev) => moveItem(prev, index, index + 1))} disabled={index === files.length - 1} aria-label="Move down">
                                <ArrowDown size={15} />
                            </button>
                            <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => removeFile(item.id)} aria-label={`Remove ${item.file.name}`}>
                                <X size={15} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </ToolShell>
    );
}
