'use client';

import { useMemo, useRef, useState } from 'react';
import { FileText, Settings, UploadCloud } from 'lucide-react';
import { TOOLS } from '@/lib/toolsData';
import { auth } from '@/lib/firebase/config';
import { logToolAction } from '@/lib/history';

const TOOL_ACCEPT = {
  'compress-pdf': 'application/pdf',
  'pdf-to-word': 'application/pdf',
  'pdf-to-powerpoint': 'application/pdf',
  'pdf-to-excel': 'application/pdf',
  'word-to-pdf': '.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'powerpoint-to-pdf': '.ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'excel-to-pdf': '.xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv',
  'html-to-pdf': '.html,.htm,text/html',
  'unlock-pdf': 'application/pdf',
  'protect-pdf': 'application/pdf',
  'pdf-to-pdfa': 'application/pdf',
  'repair-pdf': 'application/pdf',
};

const TOOL_OUTPUT_TEXT = {
  'compress-pdf': 'Compressed PDF',
  'pdf-to-word': 'DOCX file',
  'pdf-to-powerpoint': 'PPTX file',
  'pdf-to-excel': 'XLSX file',
  'word-to-pdf': 'PDF file',
  'powerpoint-to-pdf': 'PDF file',
  'excel-to-pdf': 'PDF file',
  'html-to-pdf': 'PDF file',
  'unlock-pdf': 'Unlocked PDF',
  'protect-pdf': 'Protected PDF',
  'pdf-to-pdfa': 'PDF/A file',
  'repair-pdf': 'Repaired PDF',
};

function parseFilenameFromDisposition(headerValue, fallback) {
  if (!headerValue) return fallback;
  const utfMatch = /filename\*=UTF-8''([^;]+)/i.exec(headerValue);
  if (utfMatch?.[1]) return decodeURIComponent(utfMatch[1]);
  const basicMatch = /filename="?([^";]+)"?/i.exec(headerValue);
  return basicMatch?.[1] || fallback;
}

export default function BackendToolClient({ toolId }) {
  const tool = useMemo(() => TOOLS.find((t) => t.id === toolId), [toolId]);

  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [compressionLevel, setCompressionLevel] = useState('medium');
  const [htmlContent, setHtmlContent] = useState('');

  const fileInputRef = useRef(null);

  const needsFile = toolId !== 'html-to-pdf' || !htmlContent.trim();

  const handleFile = (selectedFile) => {
    setError('');
    setFile(selectedFile || null);
  };

  const onDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    if (e.type === 'dragleave') setDragActive(false);
  };

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) handleFile(dropped);
  };

  const isSubmitDisabled =
    isProcessing ||
    (!file && needsFile) ||
    (toolId === 'protect-pdf' && !password.trim()) ||
    (toolId === 'html-to-pdf' && !file && !htmlContent.trim());

  const runTool = async () => {
    setIsProcessing(true);
    setError('');

    try {
      const form = new FormData();
      if (file) form.append('file', file);
      if (toolId === 'protect-pdf' || toolId === 'unlock-pdf') {
        form.append('password', password);
      }
      if (toolId === 'protect-pdf') {
        form.append('owner_password', ownerPassword);
      }
      if (toolId === 'compress-pdf') {
        form.append('compression_level', compressionLevel);
      }
      if (toolId === 'html-to-pdf') {
        form.append('html_content', htmlContent);
      }

      const res = await fetch(`/api/pdf-tools/${toolId}`, {
        method: 'POST',
        body: form,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to process file.');
      }

      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition');
      const fallbackName = file ? `converted_${file.name}` : `${toolId}.pdf`;
      const filename = parseFilenameFromDisposition(disposition, fallbackName);

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const user = auth.currentUser;
      if (user && tool) {
        logToolAction(user.uid, tool.id, tool.name, file?.name || filename).catch(console.error);
      }
    } catch (err) {
      setError(err.message || 'Something went wrong while processing the file.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!tool) {
    return <p className="error-text">Unknown tool.</p>;
  }

  const Icon = tool.icon;

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ textAlign: 'center', marginBottom: '8px' }}>
        <h1 style={{ fontSize: '2.3rem', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
          <span
            style={{
              color: tool.color,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: `${tool.color}15`,
              padding: '12px',
              borderRadius: '12px',
            }}
          >
            <Icon size={30} />
          </span>
          {tool.name}
        </h1>
        <p className="muted" style={{ fontSize: '1.05rem' }}>{tool.description}</p>
      </div>

      <div style={{ display: 'grid', gap: '18px', gridTemplateColumns: '1fr 320px' }}>
        <div
          onDragEnter={onDrag}
          onDragOver={onDrag}
          onDragLeave={onDrag}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragActive ? 'var(--accent)' : 'var(--line)'}`,
            borderRadius: '16px',
            padding: '50px 18px',
            background: dragActive ? 'var(--surface)' : 'var(--bg-soft)',
            transition: 'all 0.2s ease',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '12px',
            textAlign: 'center',
            cursor: 'pointer',
            minHeight: '280px',
          }}
        >
          <div style={{ background: 'var(--surface)', padding: '16px', borderRadius: '50%', boxShadow: 'var(--shadow)' }}>
            <UploadCloud size={36} color="var(--accent)" />
          </div>
          <h3 style={{ margin: 0 }}>{file ? 'File selected' : 'Select file'}</h3>
          <p className="muted" style={{ margin: 0 }}>
            {file ? `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)` : 'Drop file here or click to browse'}
          </p>
          <p className="muted small" style={{ margin: 0 }}>Output: {TOOL_OUTPUT_TEXT[toolId] || 'Converted file'}</p>
          <input
            ref={fileInputRef}
            type="file"
            accept={TOOL_ACCEPT[toolId] || '*'}
            style={{ display: 'none' }}
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (selected) handleFile(selected);
              e.target.value = '';
            }}
          />
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings size={16} /> Options
          </h3>

          {toolId === 'compress-pdf' ? (
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              Compression Level
              <select className="field" value={compressionLevel} onChange={(e) => setCompressionLevel(e.target.value)}>
                <option value="low">Low (smallest size)</option>
                <option value="medium">Medium</option>
                <option value="high">High (best quality)</option>
              </select>
            </label>
          ) : null}

          {toolId === 'unlock-pdf' ? (
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              Current PDF Password (if needed)
              <input
                className="field"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave empty if not password protected"
              />
            </label>
          ) : null}

          {toolId === 'protect-pdf' ? (
            <>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                Open Password
                <input
                  className="field"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Required"
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                Owner Password (optional)
                <input
                  className="field"
                  type="password"
                  value={ownerPassword}
                  onChange={(e) => setOwnerPassword(e.target.value)}
                  placeholder="Defaults to open password"
                />
              </label>
            </>
          ) : null}

          {toolId === 'html-to-pdf' ? (
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              HTML Content (optional if HTML file uploaded)
              <textarea
                className="field"
                rows={8}
                value={htmlContent}
                onChange={(e) => setHtmlContent(e.target.value)}
                placeholder="<html><body><h1>Hello</h1></body></html>"
              />
            </label>
          ) : null}

          {error ? <p className="error-text" style={{ margin: 0 }}>{error}</p> : null}

          <button
            className="primary-btn"
            type="button"
            onClick={runTool}
            disabled={isSubmitDisabled}
            style={{ opacity: isSubmitDisabled ? 0.6 : 1 }}
          >
            {isProcessing ? 'Processing...' : `Run ${tool.name}`}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--muted)', fontSize: '0.92rem' }}>
        <FileText size={15} />
        <span>Processing runs on the Dockerized Python backend.</span>
      </div>
    </div>
  );
}
