'use client';

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowUpToLine,
  Bold,
  Copy,
  Files,
  Italic,
  RotateCcw,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { fontDisplayName, keepsOriginalStyle } from '@/app/utils/textEditing';
import { FONT_FAMILIES, HIGHLIGHT_COLORS, INK_COLORS, TEXT_COLORS } from './model';

function Swatches({ colors, value, onPick, label = 'Color', allowNone = false }) {
  return (
    <div className="color-swatches" role="group" aria-label={label}>
      {allowNone ? (
        <button type="button" className="swatch swatch-none" aria-label="No fill" aria-pressed={!value} onClick={() => onPick(null)} />
      ) : null}
      {colors.map((hex) => (
        <button
          key={hex}
          type="button"
          className="swatch"
          style={{ background: hex }}
          aria-label={`${label} ${hex}`}
          aria-pressed={(value || '').toLowerCase() === hex.toLowerCase()}
          onClick={() => onPick(hex)}
        />
      ))}
      <input
        type="color"
        value={value || '#ffffff'}
        onChange={(event) => onPick(event.target.value)}
        className="color-input"
        aria-label={`Custom ${label.toLowerCase()}`}
      />
    </div>
  );
}

function Slider({ id, label, value, min, max, step, format, onChange }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label} · {format(value)}</label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  );
}

const percent = (value) => `${Math.round(value * 100)}%`;

function TextEditFields({ element, fontGroups, onChange, onRevert }) {
  const { original } = element;
  const name = fontDisplayName(original.font);
  const fallback = original.match ? (original.matchExact ? `another copy of ${original.match}` : `${original.match}, a close match`) : 'a similar font';
  let hint;
  if (element.fontFamily) hint = `Drawn in ${element.fontFamily}.`;
  else if (original.source === 'ocr') {
    const style = [original.bold && 'bold', original.italic && 'italic'].filter(Boolean).join(' ');
    hint = original.detected
      ? `Looks like ${original.match}${style ? ` ${style}` : ''}, detected from the scan. Pick another font if it looks different.`
      : `Recognised from a scan, so ${original.match || 'a similar font'} is used. Pick another font if it looks different.`;
  } else if (!keepsOriginalStyle(element)) {
    hint = `Style changed, so ${original.match && !original.matchExact ? `${original.match} (like ${name})` : name || 'a similar font'} will be used in that style.`;
  } else {
    hint = name ? `Keeps ${name} when it has every character you type; otherwise ${fallback}.` : `${original.match || 'A similar font'} will be used.`;
  }

  return (
    <>
      <div className="field">
        <label className="field-label" htmlFor="text-edit-field">Content</label>
        <input id="text-edit-field" className="input" value={element.text} onChange={(event) => onChange({ text: event.target.value })} />
        <span className="field-hint">Was: {original.text}</span>
      </div>
      <Slider
        id="text-edit-size"
        label="Size"
        value={element.size}
        min={Math.max(4, Math.round(original.size * 0.5))}
        max={Math.round(original.size * 2)}
        step={0.5}
        format={(v) => `${v.toFixed(1)} pt`}
        onChange={(size) => onChange({ size })}
      />
      <div className="field">
        <span className="field-label">Font</span>
        <div className="panel-row">
          <select
            className="select"
            value={element.fontFamily || ''}
            onChange={(event) => {
              const fontName = event.target.value;
              const category = fontGroups.flatMap((group) => group.fonts).find((font) => font.name === fontName)?.category;
              onChange({
                fontFamily: fontName,
                // Picking "Original" restores its kind; a library font sets its own.
                family: !fontName ? original.family : ['sans', 'serif', 'mono'].includes(category) ? category : element.family,
              });
            }}
            aria-label="Font"
          >
            <option value="">
              {original.font ? `Original (${fontDisplayName(original.font)})` : `Automatic${original.match ? ` (${original.match})` : ''}`}
            </option>
            {fontGroups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.fonts.map((font) => (
                  <option key={font.name} value={font.name}>{font.name}</option>
                ))}
              </optgroup>
            ))}
            {element.fontFamily && !fontGroups.some((group) => group.fonts.some((font) => font.name === element.fontFamily)) ? (
              <option value={element.fontFamily}>{element.fontFamily}</option>
            ) : null}
          </select>
          <ToggleButton active={element.bold} label="Bold" icon={Bold} onClick={() => onChange({ bold: !element.bold })} />
          <ToggleButton active={element.italic} label="Italic" icon={Italic} onClick={() => onChange({ italic: !element.italic })} />
        </div>
        <span className="field-hint">{hint}</span>
      </div>
      <div className="field">
        <span className="field-label">Color</span>
        <Swatches
          colors={[original.color, ...TEXT_COLORS.filter((hex) => hex !== original.color)]}
          value={element.color}
          onPick={(color) => onChange({ color })}
        />
      </div>
      <div className="panel-row">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRevert}>
          <RotateCcw size={14} /> Revert to original
        </button>
      </div>
    </>
  );
}

function ToggleButton({ active, label, icon: Icon, onClick }) {
  return (
    <button
      type="button"
      className={`btn btn-secondary btn-icon btn-sm ${active ? 'is-active' : ''}`}
      onClick={onClick}
      aria-pressed={Boolean(active)}
      aria-label={label}
      title={label}
      style={{ flex: '0 0 auto' }}
    >
      <Icon size={15} />
    </button>
  );
}

function TextFields({ element, onChange }) {
  return (
    <>
      <div className="field">
        <label className="field-label" htmlFor="text-content-field">Content</label>
        <textarea id="text-content-field" value={element.text} onChange={(event) => onChange({ text: event.target.value })} rows={3} className="textarea" />
      </div>
      <div className="field">
        <span className="field-label">Font</span>
        <div className="segmented" role="group" aria-label="Font family">
          {FONT_FAMILIES.map((family) => (
            <button
              key={family.value}
              type="button"
              aria-pressed={(element.fontFamily || 'sans') === family.value}
              onClick={() => onChange({ fontFamily: family.value })}
              style={{ fontFamily: family.css }}
            >
              {family.label}
            </button>
          ))}
        </div>
      </div>
      <Slider
        id="font-size-field"
        label="Size"
        value={element.fontSize}
        min={0.01}
        max={0.12}
        step={0.001}
        // Shown in points for a Letter/A4-wide page, the common case.
        format={(v) => `${Math.round(v * 612)} pt`}
        onChange={(fontSize) => onChange({ fontSize })}
      />
      <div className="field">
        <span className="field-label">Style</span>
        <div className="panel-row" style={{ justifyContent: 'space-between' }}>
          <div className="panel-row" style={{ flex: '0 0 auto' }}>
            <ToggleButton active={element.bold} label="Bold" icon={Bold} onClick={() => onChange({ bold: !element.bold })} />
            <ToggleButton active={element.italic} label="Italic" icon={Italic} onClick={() => onChange({ italic: !element.italic })} />
          </div>
          <div className="segmented" role="group" aria-label="Alignment" style={{ flex: '0 0 auto' }}>
            {[
              ['left', AlignLeft],
              ['center', AlignCenter],
              ['right', AlignRight],
            ].map(([align, Icon]) => (
              <button key={align} type="button" aria-pressed={(element.align || 'left') === align} onClick={() => onChange({ align })} aria-label={`Align ${align}`} title={`Align ${align}`}>
                <Icon size={15} />
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="field">
        <span className="field-label">Color</span>
        <Swatches colors={TEXT_COLORS} value={element.color} onPick={(color) => onChange({ color })} />
      </div>
    </>
  );
}

function ShapeFields({ element, onChange }) {
  const { kind } = element;
  if (kind === 'whiteout') {
    return (
      <>
        <p className="small muted">Covers what&apos;s underneath with a solid color. The covered content stays in the file; use Redact to remove it for good.</p>
        <div className="field">
          <span className="field-label">Fill</span>
          <Swatches colors={['#ffffff', '#f8fafc', '#fefce8', '#000000']} value={element.fill} onPick={(fill) => onChange({ fill: fill || '#ffffff' })} label="Fill" />
        </div>
      </>
    );
  }
  if (kind === 'highlight') {
    return (
      <>
        <div className="field">
          <span className="field-label">Color</span>
          <Swatches colors={HIGHLIGHT_COLORS} value={element.fill} onPick={(fill) => onChange({ fill: fill || HIGHLIGHT_COLORS[0] })} />
        </div>
        <Slider id="shape-opacity" label="Strength" value={element.opacity ?? 0.4} min={0.15} max={0.8} step={0.05} format={percent} onChange={(opacity) => onChange({ opacity })} />
      </>
    );
  }
  const isLine = kind === 'line' || kind === 'arrow';
  return (
    <>
      <div className="field">
        <span className="field-label">{isLine ? 'Color' : 'Border'}</span>
        <Swatches colors={INK_COLORS.concat('#dc2626').filter((v, i, a) => a.indexOf(v) === i)} value={element.stroke} onPick={(stroke) => onChange({ stroke })} allowNone={!isLine} label={isLine ? 'Color' : 'Border'} />
      </div>
      {!isLine ? (
        <div className="field">
          <span className="field-label">Fill</span>
          <Swatches colors={['#ffffff', '#fde047', '#bfdbfe', '#fecaca', '#111827']} value={element.fill} onPick={(fill) => onChange({ fill })} allowNone label="Fill" />
        </div>
      ) : null}
      {element.stroke || isLine ? (
        <Slider id="shape-stroke" label="Thickness" value={element.strokeWidth} min={0.001} max={0.02} step={0.0005} format={(v) => `${(v * 612).toFixed(1)} pt`} onChange={(strokeWidth) => onChange({ strokeWidth })} />
      ) : null}
      {isLine ? (
        <div className="field">
          <span className="field-label">Ends</span>
          <div className="segmented" role="group" aria-label="Line ends">
            <button type="button" aria-pressed={kind === 'line'} onClick={() => onChange({ kind: 'line' })}>Plain</button>
            <button type="button" aria-pressed={kind === 'arrow'} onClick={() => onChange({ kind: 'arrow' })}>Arrow</button>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Properties of the selected element, with actions shared by every type. */
export default function Inspector({ element, fontGroups, onChange, onDuplicate, onDelete, onCopyToAllPages, onLayer, numPages }) {
  const { type } = element;
  const hasOpacity = type === 'text' || type === 'image' || type === 'ink' || (type === 'shape' && !['whiteout', 'highlight'].includes(element.kind));

  return (
    <div className="panel-stack">
      {type === 'textEdit' ? <TextEditFields element={element} fontGroups={fontGroups} onChange={onChange} onRevert={onDelete} /> : null}
      {type === 'text' ? <TextFields element={element} onChange={onChange} /> : null}
      {type === 'shape' ? <ShapeFields element={element} onChange={onChange} /> : null}
      {type === 'ink' ? (
        <>
          <div className="field">
            <span className="field-label">Color</span>
            <Swatches colors={INK_COLORS} value={element.color} onPick={(color) => onChange({ color })} />
          </div>
          <Slider id="ink-width" label="Thickness" value={element.strokeWidth} min={0.001} max={0.02} step={0.0005} format={(v) => `${(v * 612).toFixed(1)} pt`} onChange={(strokeWidth) => onChange({ strokeWidth })} />
        </>
      ) : null}
      {type === 'mark' ? (
        <div className="field">
          <span className="field-label">Color</span>
          <Swatches colors={INK_COLORS} value={element.color} onPick={(color) => onChange({ color })} />
        </div>
      ) : null}
      {type === 'image' ? <p className="small muted">Drag to move; corners resize and keep the proportions (hold Shift to stretch).</p> : null}
      {type === 'redact' ? (
        <div className="alert alert-warning-soft" role="note">
          <ShieldAlert size={16} />
          <div>Everything under this box — text, images and drawings — is permanently removed when you download, along with the document&apos;s metadata.</div>
        </div>
      ) : null}

      {hasOpacity ? (
        <Slider id="element-opacity" label="Opacity" value={element.opacity ?? 1} min={0.1} max={1} step={0.05} format={percent} onChange={(opacity) => onChange({ opacity })} />
      ) : null}

      {type !== 'textEdit' ? (
        <>
          <div className="panel-row">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onLayer('front')} title="Bring to front"><ArrowUpToLine size={14} /> Front</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onLayer('back')} title="Send to back"><ArrowDownToLine size={14} /> Back</button>
          </div>
          <div className="panel-row">
            <button type="button" className="btn btn-secondary btn-sm" onClick={onDuplicate}><Copy size={14} /> Duplicate</button>
            {numPages > 1 ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={onCopyToAllPages} title="Place a copy on every other page"><Files size={14} /> All pages</button>
            ) : null}
          </div>
          <div className="panel-row">
            <button type="button" className="btn btn-danger-ghost btn-sm" onClick={onDelete}><Trash2 size={14} /> Delete</button>
          </div>
        </>
      ) : null}
    </div>
  );
}
