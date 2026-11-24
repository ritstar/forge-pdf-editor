'use client';

import { useState } from 'react';
import { Code2, Download, Eye, EyeOff, FileText, Loader2, RefreshCw, ServerCrash, X } from 'lucide-react';
import ToolShell from './ToolShell';
import { getTool } from '@/lib/toolsData';
import { auth } from '@/lib/firebase/config';
import { logToolAction } from '@/lib/history';
import { downloadBlob, formatFileSize, stripExtension } from '@/app/utils/files';
import { useBackendStatus } from '@/app/utils/useBackendStatus';
import { submitToolRequest } from '@/app/utils/backendTools';

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
  'ocr-pdf': { accept: PDF_ACCEPT, output: 'Searchable PDF', action: 'Make searchable', busy: 'Recognising text…' },
};

// Languages installed on the conversion server (see backend/Dockerfile).
const OCR_LANGUAGES = [
  { code: 'eng', label: 'English' },
  { code: 'hin', label: 'Hindi' },
  { code: 'fra', label: 'French' },
  { code: 'deu', label: 'German' },
  { code: 'spa', label: 'Spanish' },
  { code: 'ita', label: 'Italian' },
  { code: 'por', label: 'Portuguese' },
  { code: 'nld', label: 'Dutch' },
  { code: 'rus', label: 'Russian' },
];
const MAX_OCR_LANGUAGES = 3;

function ocrSummary(stats) {
  if (!stats) return null;
  if (!stats.recognized) {
    return stats.skipped === stats.pages
      ? 'Every page already had selectable text, so nothing needed recognising.'
      : 'No text was found on the scanned pages.';
  }
  const parts = [`Recognised text on ${stats.recognized} ${stats.recognized === 1 ? 'page' : 'pages'}`];
  if (stats.skipped) parts.push(`${stats.skipped} already had text`);
  if (stats.rotated?.length) parts.push(`turned ${stats.rotated.length === 1 ? `page ${stats.rotated[0]}` : `${stats.rotated.length} pages`} upright`);
  return `${parts.join(' · ')}.`;
}

const COMPRESSION_LEVELS = [
  { value: 'low', title: 'Extreme', detail: 'Smallest file, lower image quality' },
  { value: 'medium', title: 'Recommended', detail: 'Good quality, good compression' },
  { value: 'high', title: 'Light', detail: 'Best quality, less compression' },
];

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const PDF_INPUT_TOOLS = new Set(['compress-pdf', 'pdf-to-word', 'pdf-to-powerpoint', 'pdf-to-excel', 'unlock-pdf', 'protect-pdf', 'pdf-to-pdfa', 'repair-pdf', 'ocr-pdf']);

const STATUS_MESSAGES = {
  401: 'Your session has expired. Please sign in again.',
  413: 'This file is too large to process. Try a file under 50 MB.',
  429: 'Too many requests. Please wait a minute and try again.',
  502: 'The conversion service is unavailable. It may be starting up; try again in a moment.',
  504: 'The conversion took too long. Try a smaller file.',
};

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

function ServerNotice({ status, elapsed, compact }) {
  if (status === 'waking') {
    return (
      <div className="server-notice" role="status" aria-live="polite">
        <Loader2 size={16} className="spin" />
        <div>
          <strong>Waking up the conversion server…</strong>
          <span>
            {compact
              ? `It was idle. Usually ready within a minute (${elapsed}s).`
              : `It goes to sleep when idle and usually needs under a minute to start. You can choose your file now — ${elapsed}s`}
          </span>
        </div>
        <div className="server-notice-bar" aria-hidden="true" />
      </div>
    );
  }
  if (status === 'unavailable') {
    return (
      <div className="alert alert-error" role="alert">
        <ServerCrash size={16} />
        <div>The conversion server isn&apos;t responding. You can still try — or refresh the page in a minute.</div>
      </div>
    );
  }
  return null;
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
  const [permissions, setPermissions] = useState({ print: true, copy: true, modify: true });
  const [languages, setLanguages] = useState(['eng']);
  const [autoRotate, setAutoRotate] = useState(true);
  const [waitingForServer, setWaitingForServer] = useState(false);
  const server = useBackendStatus();

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
      // If the server is still booting, queue the job instead of failing.
      if (server.status === 'checking' || server.status === 'waking') {
        setWaitingForServer(true);
        await server.waitUntilReady();
        setWaitingForServer(false);
      }

      const form = new FormData();
      if (file) form.append('file', file);
      if (toolId === 'protect-pdf' || toolId === 'unlock-pdf') {
        form.append('password', password);
      }
      if (toolId === 'protect-pdf') {
        form.append('owner_password', ownerPassword);
        form.append('allow_print', String(permissions.print));
        form.append('allow_copy', String(permissions.copy));
        form.append('allow_modify', String(permissions.modify));
      }
      if (toolId === 'ocr-pdf') {
        form.append('languages', languages.join('+'));
        form.append('auto_rotate', String(autoRotate));
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
      let ocr = null;
      try {
        ocr = JSON.parse(res.headers.get('x-forge-ocr') || 'null');
      } catch {
        // Stats are informational only.
      }
      setResult({ blob, filename, originalSize, outputSize, ocr });

      const user = auth.currentUser;
      if (user && tool) {
        logToolAction(user.uid, tool.id, tool.name, file?.name || filename).catch(console.error);
      }
    } catch (err) {
      setError(err.message || 'Something went wrong while processing the file.');
    } finally {
      setWaitingForServer(false);
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

      {toolId === 'protect-pdf' ? (
        <div className="field">
          <span className="field-label">People who open it can</span>
          <label className="check-row"><input type="checkbox" checked={permissions.print} onChange={(e) => setPermissions((p) => ({ ...p, print: e.target.checked }))} /> Print</label>
          <label className="check-row"><input type="checkbox" checked={permissions.copy} onChange={(e) => setPermissions((p) => ({ ...p, copy: e.target.checked }))} /> Copy text and images</label>
          <label className="check-row"><input type="checkbox" checked={permissions.modify} onChange={(e) => setPermissions((p) => ({ ...p, modify: e.target.checked }))} /> Edit, comment and fill forms</label>
          {!(permissions.print && permissions.copy && permissions.modify) && !ownerPassword ? (
            <span className="field-hint">Restrictions are locked with a separate owner password we generate, so the open password can&apos;t lift them.</span>
          ) : null}
        </div>
      ) : null}

      {toolId === 'ocr-pdf' ? (
        <>
          <div className="field">
            <span className="field-label">Document language{languages.length > 1 ? 's' : ''}</span>
            <div className="chip-list">
              {OCR_LANGUAGES.map((lang) => {
                const on = languages.includes(lang.code);
                return (
                  <button
                    key={lang.code}
                    type="button"
                    className="chip"
                    aria-pressed={on}
                    disabled={!on && languages.length >= MAX_OCR_LANGUAGES}
                    onClick={() => setLanguages((prev) => (on ? (prev.length > 1 ? prev.filter((c) => c !== lang.code) : prev) : [...prev, lang.code]))}
                  >
                    {lang.label}
                  </button>
                );
              })}
            </div>
            <span className="field-hint">Pick up to {MAX_OCR_LANGUAGES}. Fewer languages are faster and more accurate.</span>
          </div>
          <label className="check-row">
            <input type="checkbox" checked={autoRotate} onChange={(e) => setAutoRotate(e.target.checked)} />
            Turn sideways and upside-down pages upright
          </label>
          <div className="summary-list">
            <div><span>Output</span><strong>Searchable PDF</strong></div>
            <div><span>Looks</span><strong>Unchanged</strong></div>
          </div>
        </>
      ) : null}

      {!['compress-pdf', 'unlock-pdf', 'protect-pdf', 'ocr-pdf'].includes(toolId) ? (
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
      notice={<ServerNotice status={server.status} elapsed={server.elapsed} compact={Boolean(file || htmlMode)} />}
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
            : toolId === 'ocr-pdf' && result.ocr
              ? ocrSummary(result.ocr)
              : `${result.filename} downloaded.`
          : null,
        action: {
          label: config.action,
          busyLabel: waitingForServer ? 'Waiting for server…' : config.busy,
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
