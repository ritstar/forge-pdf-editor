'use client';

import { useState } from 'react';
import { Code2, Download, Eye, EyeOff, FileText, RefreshCw, X } from 'lucide-react';
import ToolShell from './ToolShell';
import { getTool } from '@/lib/toolsData';
import { auth } from '@/lib/firebase/config';
import { logToolAction } from '@/lib/history';
import { downloadBlob, formatFileSize, stripExtension } from '@/app/utils/files';

const PDF_ACCEPT = 'application/pdf,.pdf';

const TOOL_CONFIG = {
  'compress-pdf': { accept: PDF_ACCEPT, output: 'Compressed PDF', action: 'Compress PDF', busy: 'Compressing…' },
  'pdf-to-word': { accept: PDF_ACCEPT, output: 'Word document (.docx)', action: 'Convert to Word', busy: 'Converting…' },
  'pdf-to-powerpoint': { accept: PDF_ACCEPT, output: 'PowerPoint (.pptx)', action: 'Convert to PowerPoint', busy: 'Converting…' },
  'pdf-to-excel': { accept: PDF_ACCEPT, output: 'Excel workbook (.xlsx)', action: 'Convert to Excel', busy: 'Converting…' },
  'word-to-pdf': {
    accept: '.doc,.docx,.odt,.rtf,.txt,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    output: 'PDF document',
    action: 'Convert to PDF',
    busy: 'Converting…',
    label: 'Word document',
  },
  'powerpoint-to-pdf': {
    accept: '.ppt,.pptx,.odp,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation',
    output: 'PDF document',
    action: 'Convert to PDF',
    busy: 'Converting…',
    label: 'PowerPoint file',
  },
  'excel-to-pdf': {
    accept: '.xls,.xlsx,.ods,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv',
    output: 'PDF document',
    action: 'Convert to PDF',
    busy: 'Converting…',
    label: 'spreadsheet',
  },
  'html-to-pdf': { accept: '.html,.htm,text/html', output: 'PDF document', action: 'Convert to PDF', busy: 'Rendering…', label: 'HTML file' },
  'unlock-pdf': { accept: PDF_ACCEPT, output: 'Unlocked PDF', action: 'Unlock PDF', busy: 'Unlocking…' },
  'protect-pdf': { accept: PDF_ACCEPT, output: 'Password-protected PDF', action: 'Protect PDF', busy: 'Encrypting…' },
  'pdf-to-pdfa': { accept: PDF_ACCEPT, output: 'PDF/A-2b document', action: 'Convert to PDF/A', busy: 'Converting…' },
  'repair-pdf': { accept: PDF_ACCEPT, output: 'Repaired PDF', action: 'Repair PDF', busy: 'Repairing…' },
};

const COMPRESSION_LEVELS = [
  { value: 'low', title: 'Extreme', detail: 'Smallest file, lower image quality' },
  { value: 'medium', title: 'Recommended', detail: 'Good quality, good compression' },
  { value: 'high', title: 'Light', detail: 'Best quality, less compression' },
];

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const PDF_INPUT_TOOLS = new Set(['compress-pdf', 'pdf-to-word', 'pdf-to-powerpoint', 'pdf-to-excel', 'unlock-pdf', 'protect-pdf', 'pdf-to-pdfa', 'repair-pdf']);

const STATUS_MESSAGES = {
  401: 'Your session has expired. Please sign in again.',
  413: 'This file is too large to process. Try a file under 50 MB.',
  429: 'Too many requests. Please wait a minute and try again.',
  502: 'The conversion service is unavailable. It may be starting up; try again in a moment.',
  504: 'The conversion took too long. Try a smaller file.',
};

// Prefer uploading straight to the backend with a short-lived token (no serverless body
// limit, one less hop). Falls back to the same-origin proxy if the backend is unreachable
// from the browser (CORS/network) or does not accept tokens yet.
async function submitToolRequest(toolId, form) {
  try {
    const tokenRes = await fetch(`/api/pdf-tools/${toolId}`, { cache: 'no-store' });
    if (tokenRes.status === 401) {
      return tokenRes;
    }
    if (tokenRes.ok) {
      const { endpoint, token } = await tokenRes.json();
      const direct = await fetch(endpoint, {
        method: 'POST',
        headers: { 'x-forge-token': token },
        body: form,
      });
      if (direct.status !== 401 && direct.status !== 403) {
        return direct;
      }
    }
  } catch {
    // Network/CORS failure on the direct path: use the proxy below.
  }

  return fetch(`/api/pdf-tools/${toolId}`, { method: 'POST', body: form });
}

function parseFilenameFromDisposition(headerValue, fallback) {
  if (!headerValue) return fallback;
  const utfMatch = /filename\*=UTF-8''([^;]+)/i.exec(headerValue);
  if (utfMatch?.[1]) return decodeURIComponent(utfMatch[1]);
  const basicMatch = /filename="?([^";]+)"?/i.exec(headerValue);
  return basicMatch?.[1] || fallback;
}

function PasswordField({ id, label, value, onChange, placeholder, hint, autoComplete }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <div className="input-group">
        <input
          id={id}
          className="input"
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
        />
        <button type="button" className="btn btn-secondary btn-icon" onClick={() => setVisible((v) => !v)} aria-label={visible ? 'Hide password' : 'Show password'}>
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

export default function BackendToolClient({ toolId }) {
  const tool = getTool(toolId);
  const config = TOOL_CONFIG[toolId];

  const [file, setFile] = useState(null);
  const [htmlMode, setHtmlMode] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [compressionLevel, setCompressionLevel] = useState('medium');
  const [htmlContent, setHtmlContent] = useState('');

  const reset = () => {
    setFile(null);
    setHtmlMode(false);
    setError('');
    setResult(null);
    setPassword('');
    setConfirmPassword('');
    setOwnerPassword('');
  };

  const handleFiles = ([selectedFile]) => {
    setError('');
    setResult(null);
    if (!selectedFile) return;
    if (selectedFile.size > MAX_UPLOAD_BYTES) {
      setError('This file is larger than 50 MB. Please choose a smaller file.');
      return;
    }
    if (PDF_INPUT_TOOLS.has(toolId) && selectedFile.type !== 'application/pdf' && !/\.pdf$/i.test(selectedFile.name)) {
      setError('Please choose a PDF file.');
      return;
    }
    setFile(selectedFile);
  };

  const passwordMismatch = toolId === 'protect-pdf' && confirmPassword && password !== confirmPassword;

  const isSubmitDisabled =
    isProcessing ||
    (toolId === 'html-to-pdf' ? !file && !htmlContent.trim() : !file) ||
    (toolId === 'protect-pdf' && (!password.trim() || password !== confirmPassword));

  const runTool = async () => {
    setIsProcessing(true);
    setError('');
    setResult(null);

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
      if (toolId === 'html-to-pdf' && !file) {
        form.append('html_content', htmlContent);
      }

      const res = await submitToolRequest(toolId, form);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || STATUS_MESSAGES[res.status] || 'Failed to process file.');
      }

      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition');
      const fallbackName = file ? `${stripExtension(file.name)}_converted` : `${toolId}.pdf`;
      const filename = parseFilenameFromDisposition(disposition, fallbackName);

      downloadBlob(blob, filename);

      const originalSize = Number(res.headers.get('x-original-size'));
      const outputSize = Number(res.headers.get('x-output-size'));
      setResult({ blob, filename, originalSize, outputSize });

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

  const fileLabel = config.label || 'PDF';

  const selectExtra =
    toolId === 'html-to-pdf' ? (
      <div style={{ marginTop: 20, textAlign: 'center' }}>
        <button type="button" className="btn btn-secondary" onClick={() => setHtmlMode(true)}>
          <Code2 size={16} /> Paste HTML instead
        </button>
      </div>
    ) : null;

  const saved = result?.originalSize && result?.outputSize ? Math.round((1 - result.outputSize / result.originalSize) * 100) : null;

  const options = (
    <>
      {toolId === 'compress-pdf' ? (
        <div className="field">
          <span className="field-label">Compression level</span>
          <div className="option-list" role="group" aria-label="Compression level">
            {COMPRESSION_LEVELS.map((level) => (
              <button
                key={level.value}
                type="button"
                className="option-card"
                aria-pressed={compressionLevel === level.value}
                onClick={() => setCompressionLevel(level.value)}
              >
                <span className="option-dot" />
                <span>
                  <strong>{level.title}</strong>
                  <span>{level.detail}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {toolId === 'unlock-pdf' ? (
        <PasswordField
          id="unlock-password"
          label="Document password"
          value={password}
          onChange={setPassword}
          placeholder="Enter the PDF's password"
          hint="Leave empty if the PDF only restricts printing or editing."
          autoComplete="current-password"
        />
      ) : null}

      {toolId === 'protect-pdf' ? (
        <>
          <PasswordField id="protect-password" label="Password" value={password} onChange={setPassword} placeholder="Required to open the PDF" autoComplete="new-password" />
          <PasswordField id="protect-confirm" label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} placeholder="Repeat the password" autoComplete="new-password" />
          {passwordMismatch ? <span className="error-text">Passwords don&apos;t match.</span> : null}
          <PasswordField
            id="protect-owner"
            label="Owner password (optional)"
            value={ownerPassword}
            onChange={setOwnerPassword}
            placeholder="Defaults to the password above"
            hint="Encrypted with AES-256."
            autoComplete="new-password"
          />
        </>
      ) : null}

      {!['compress-pdf', 'unlock-pdf', 'protect-pdf'].includes(toolId) ? (
        <div className="summary-list">
          <div><span>Output</span><strong>{config.output}</strong></div>
          <div><span>Max size</span><strong>50 MB</strong></div>
        </div>
      ) : null}
    </>
  );

  return (
    <ToolShell
      toolId={toolId}
      stage={file || htmlMode ? 'work' : 'select'}
      processing="server"
      error={error}
      onReset={reset}
      selectExtra={selectExtra}
      dropzone={{
        accept: config.accept,
        onFiles: handleFiles,
        title: `Select a ${fileLabel}`,
        hint: `or drop it here · up to 50 MB`,
        icon: FileText,
      }}
      workspaceTitle={file ? 'Selected file' : 'HTML source'}
      workspaceSubtitle={file ? null : 'Inline styles and data: images are supported; external resources are blocked.'}
      panel={{
        subtitle: `Output: ${config.output}`,
        body: options,
        result: result
          ? toolId === 'compress-pdf' && saved !== null
            ? saved > 0
              ? `Saved ${saved}% — ${formatFileSize(result.originalSize)} → ${formatFileSize(result.outputSize)}.`
              : 'This PDF is already well optimized; no further reduction was possible.'
            : `${result.filename} downloaded.`
          : null,
        action: {
          label: config.action,
          busyLabel: config.busy,
          onClick: runTool,
          disabled: isSubmitDisabled,
          busy: isProcessing,
        },
        footnote: 'Files are deleted from our servers right after processing.',
      }}
    >
      {file ? (
        <div className="file-list">
          <div className="file-item">
            <span className="doc-icon">{(file.name.split('.').pop() || 'FILE').slice(0, 4).toUpperCase()}</span>
            <div className="file-item-body">
              <strong>{file.name}</strong>
              <span>{formatFileSize(file.size)}</span>
            </div>
            <div className="file-item-actions">
              <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={reset} aria-label="Remove file" disabled={isProcessing}>
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <textarea
          className="textarea"
          rows={16}
          value={htmlContent}
          onChange={(e) => setHtmlContent(e.target.value)}
          placeholder={'<html>\n  <body>\n    <h1>Hello</h1>\n  </body>\n</html>'}
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.85rem' }}
          aria-label="HTML content"
        />
      )}

      {result ? (
        <div className="card result-card" style={{ marginTop: 16 }}>
          <span className="icon-tile lg"><Download size={24} /></span>
          <div>
            <h3>Your file is ready</h3>
            <p>{result.filename}</p>
          </div>
          {toolId === 'compress-pdf' && saved > 0 ? (
            <div style={{ width: 'min(320px, 100%)', display: 'grid', gap: 6 }}>
              <div className="meter"><span style={{ width: `${100 - saved}%` }} /></div>
              <span className="small muted">{formatFileSize(result.outputSize)} of {formatFileSize(result.originalSize)}</span>
            </div>
          ) : null}
          <div className="toolbar" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
            <button type="button" className="btn btn-primary" onClick={() => downloadBlob(result.blob, result.filename)}>
              <Download size={16} /> Download again
            </button>
            <button type="button" className="btn btn-secondary" onClick={reset}>
              <RefreshCw size={16} /> Process another file
            </button>
          </div>
        </div>
      ) : null}
    </ToolShell>
  );
}
