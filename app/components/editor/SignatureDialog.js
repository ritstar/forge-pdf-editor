'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, Loader2, PenLine, Type, Undo2, Upload, X } from 'lucide-react';
import { canvasToBlob, removeWhiteBackground, renderTypedSignature, SIGNATURE_FONTS, trimCanvas } from '@/app/utils/imageProcessing';

const INK = [
  { name: 'Black', hex: '#111827' },
  { name: 'Blue', hex: '#1e3a8a' },
  { name: 'Red', hex: '#991b1b' },
];

const PAD_HEIGHT = 200;
const EXPORT_SCALE = 3;

// Stroke width follows speed (fast = thinner) and pen pressure, like ink from a real pen.
function strokeWidths(points, base) {
  const widths = [];
  let previous = base;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const q = points[i - 1];
    let target = base;
    if (q) {
      const dt = Math.max(1, p.t - q.t);
      const speed = Math.hypot(p.x - q.x, p.y - q.y) / dt;
      target = base * Math.max(0.45, Math.min(1.25, 1.3 - speed * 0.35));
    }
    if (p.pressure > 0 && p.pressure !== 0.5) target *= 0.55 + p.pressure;
    previous = previous * 0.6 + target * 0.4;
    widths.push(previous);
  }
  return widths;
}

function drawStrokes(ctx, strokes, scale, color) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  for (const stroke of strokes) {
    const pts = stroke.points;
    if (!pts.length) continue;
    const widths = strokeWidths(pts, stroke.width);
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x * scale, pts[0].y * scale, (widths[0] * scale) / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    let from = { x: pts[0].x, y: pts[0].y };
    for (let i = 1; i < pts.length; i += 1) {
      const p = pts[i];
      const next = pts[i + 1];
      const to = next ? { x: (p.x + next.x) / 2, y: (p.y + next.y) / 2 } : p;
      ctx.beginPath();
      ctx.lineWidth = widths[i] * scale;
      ctx.moveTo(from.x * scale, from.y * scale);
      ctx.quadraticCurveTo(p.x * scale, p.y * scale, to.x * scale, to.y * scale);
      ctx.stroke();
      from = to;
    }
  }
}

function DrawPad({ color, strokesRef, empty, onChange }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const activeRef = useRef(null);
  const [width, setWidth] = useState(560);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawStrokes(ctx, strokesRef.current, dpr, color);
  }, [color, strokesRef]);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(200, Math.floor(entry.contentRect.width))));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(PAD_HEIGHT * dpr);
    redraw();
  }, [width, redraw]);

  const point = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top, t: event.timeStamp, pressure: event.pressure };
  };

  return (
    <div ref={wrapRef} className="sig-pad">
      <canvas
        ref={canvasRef}
        style={{ width, height: PAD_HEIGHT }}
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          const stroke = { points: [point(event)], width: 2.6 };
          activeRef.current = stroke;
          strokesRef.current = [...strokesRef.current, stroke];
          redraw();
          onChange();
        }}
        onPointerMove={(event) => {
          const stroke = activeRef.current;
          if (!stroke) return;
          const events = event.nativeEvent.getCoalescedEvents?.() || [event.nativeEvent];
          for (const e of events) stroke.points.push(point(e));
          redraw();
        }}
        onPointerUp={() => {
          activeRef.current = null;
          onChange();
        }}
        onPointerCancel={() => {
          activeRef.current = null;
        }}
        aria-label="Signature drawing area"
      />
      <span className="sig-pad-line" aria-hidden="true" />
      {empty ? <span className="sig-pad-hint">Sign here with your mouse, finger or stylus</span> : null}
    </div>
  );
}

/**
 * Create a signature or initials by drawing, typing or uploading. Calls
 * onCreate({ file, name, save }) with a trimmed transparent PNG.
 */
export default function SignatureDialog({ mode = 'signature', defaultText = '', onClose, onCreate }) {
  const isInitials = mode === 'initials';
  const [tab, setTab] = useState('draw');
  const [color, setColor] = useState(INK[0].hex);
  const [typed, setTyped] = useState(defaultText);
  const [font, setFont] = useState(SIGNATURE_FONTS[0]);
  const [upload, setUpload] = useState(null);
  const [save, setSave] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [strokeCount, setStrokeCount] = useState(0);
  const strokesRef = useRef([]);
  const fileRef = useRef(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => () => upload && URL.revokeObjectURL(upload.url), [upload]);

  const label = isInitials ? 'initials' : 'signature';
  const canCreate = !busy && (tab === 'draw' ? strokeCount > 0 : tab === 'type' ? typed.trim().length > 0 : Boolean(upload));

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      let file;
      if (tab === 'draw') {
        const strokes = strokesRef.current;
        const maxX = Math.max(...strokes.flatMap((s) => s.points.map((p) => p.x))) + 20;
        const maxY = Math.max(...strokes.flatMap((s) => s.points.map((p) => p.y))) + 20;
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(maxX * EXPORT_SCALE);
        canvas.height = Math.ceil(maxY * EXPORT_SCALE);
        drawStrokes(canvas.getContext('2d'), strokes, EXPORT_SCALE, color);
        const blob = await canvasToBlob(trimCanvas(canvas, 12));
        file = new File([blob], `${label}.png`, { type: 'image/png' });
      } else if (tab === 'type') {
        const canvas = await renderTypedSignature(typed.trim(), font, color);
        file = new File([await canvasToBlob(canvas)], `${label}.png`, { type: 'image/png' });
      } else {
        file = upload.file;
      }
      await onCreate({ file, name: isInitials ? 'Initials' : (tab === 'type' ? typed.trim() : '') || undefined, save, kind: mode });
    } catch (err) {
      setError(err.message || `Could not create the ${label}.`);
      setBusy(false);
    }
  };

  const chooseFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) {
      setError('Choose a PNG, JPG or WebP image.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const processed = await removeWhiteBackground(file).catch(() => file);
      setUpload({ file: processed, url: URL.createObjectURL(processed) });
    } finally {
      setBusy(false);
    }
  };

  const tabs = [
    { id: 'draw', label: 'Draw', icon: PenLine },
    { id: 'type', label: 'Type', icon: Type },
    { id: 'upload', label: 'Upload', icon: Upload },
  ];

  return (
    <div className="modal-backdrop" role="presentation" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} tabIndex={-1} className="modal sig-dialog" role="dialog" aria-modal="true" aria-labelledby="sig-dialog-title">
        <div className="sig-dialog-head">
          <h3 id="sig-dialog-title">{isInitials ? 'Add your initials' : 'Add your signature'}</h3>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="segmented sig-tabs" role="tablist">
          {tabs.map(({ id, label: tabLabel, icon: Icon }) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
              <Icon size={14} /> {tabLabel}
            </button>
          ))}
        </div>

        {tab !== 'upload' ? (
          <div className="sig-colors" role="group" aria-label="Ink color">
            {INK.map((ink) => (
              <button
                key={ink.hex}
                type="button"
                className="swatch"
                style={{ background: ink.hex }}
                aria-label={ink.name}
                aria-pressed={color === ink.hex}
                onClick={() => setColor(ink.hex)}
              />
            ))}
          </div>
        ) : null}

        {tab === 'draw' ? (
          <div className="sig-body">
            <DrawPad color={color} strokesRef={strokesRef} empty={!strokeCount} onChange={() => setStrokeCount(strokesRef.current.length)} />
            <div className="panel-row sig-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  strokesRef.current = strokesRef.current.slice(0, -1);
                  setStrokeCount(strokesRef.current.length);
                }}
                disabled={!strokeCount}
              >
                <Undo2 size={14} /> Undo
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  strokesRef.current = [];
                  setStrokeCount(strokesRef.current.length);
                }}
                disabled={!strokeCount}
              >
                <Eraser size={14} /> Clear
              </button>
            </div>
          </div>
        ) : null}

        {tab === 'type' ? (
          <div className="sig-body">
            <input
              className="input"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={isInitials ? 'Your initials' : 'Your full name'}
              maxLength={isInitials ? 6 : 60}
              aria-label={isInitials ? 'Initials' : 'Name'}
              autoFocus
            />
            <div className="sig-fonts" role="radiogroup" aria-label="Handwriting style">
              {SIGNATURE_FONTS.map((option) => (
                <button
                  key={option.family}
                  type="button"
                  role="radio"
                  aria-checked={font.family === option.family}
                  className="sig-font"
                  onClick={() => setFont(option)}
                  style={{ fontFamily: `"${option.family}", cursive`, color, fontSize: `${1.9 * option.size}rem` }}
                  title={option.label}
                >
                  {typed.trim() || (isInitials ? 'AB' : 'Your name')}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {tab === 'upload' ? (
          <div className="sig-body">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => { chooseFile(event.target.files?.[0]); event.target.value = ''; }} />
            <button
              type="button"
              className="sig-upload"
              onClick={() => fileRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                chooseFile(event.dataTransfer.files?.[0]);
              }}
            >
              {upload ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={upload.url} alt="Uploaded signature preview" />
              ) : (
                <>
                  <Upload size={22} />
                  <strong>Choose a photo or scan</strong>
                  <span>Sign on white paper; the background is removed automatically.</span>
                </>
              )}
            </button>
          </div>
        ) : null}

        {error ? <div className="alert alert-error" role="alert">{error}</div> : null}

        <div className="sig-dialog-foot">
          <label className="check-row">
            <input type="checkbox" checked={save} onChange={(event) => setSave(event.target.checked)} />
            Save for next time
          </label>
          <div className="modal-actions" style={{ margin: 0 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={create} disabled={!canCreate}>
              {busy ? <Loader2 size={16} className="spin" /> : null} {isInitials ? 'Add initials' : 'Add signature'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
