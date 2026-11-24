'use client';

import {
  Check,
  ChevronDown,
  Circle,
  CircleDot,
  Eraser,
  EyeOff,
  Highlighter,
  ImagePlus,
  Minus,
  MousePointer2,
  MoveUpRight,
  PenLine,
  Redo2,
  ScanText,
  Signature,
  Square,
  Type,
  Undo2,
  X,
} from 'lucide-react';
import Menu from '../ui/Menu';
import { HIGHLIGHT_COLORS, INK_COLORS } from './model';

export const SHAPE_TOOLS = [
  { id: 'rect', label: 'Rectangle', icon: Square, key: 'R' },
  { id: 'ellipse', label: 'Ellipse', icon: Circle, key: 'O' },
  { id: 'line', label: 'Line', icon: Minus, key: 'L' },
  { id: 'arrow', label: 'Arrow', icon: MoveUpRight, key: 'A' },
];

export const MARK_TOOLS = [
  { id: 'check', label: 'Check mark', icon: Check },
  { id: 'cross', label: 'Cross mark', icon: X },
  { id: 'dot', label: 'Dot', icon: CircleDot },
];

// Single-key shortcuts (no modifier), shown in tooltips.
export const TOOL_KEYS = { v: 'select', e: 'edit-text', t: 'text', d: 'pen', h: 'highlight', r: 'rect', o: 'ellipse', l: 'line', a: 'arrow', w: 'whiteout', x: 'redact', k: 'check' };

const THICKNESS = [
  { label: 'Thin', value: 0.002 },
  { label: 'Medium', value: 0.0032 },
  { label: 'Thick', value: 0.006 },
];

function ToolButton({ id, tool, onTool, icon: Icon, label, shortcut, hideLabel = false }) {
  const active = tool === id;
  return (
    <button
      type="button"
      className={`btn btn-ghost tool-btn ${active ? 'is-active' : ''}`}
      onClick={() => onTool(active && id !== 'select' ? 'select' : id)}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
    >
      <Icon size={16} />
      {hideLabel ? <span className="sr-only">{label}</span> : <span className="tool-label">{label}</span>}
    </button>
  );
}

function StyleBar({ tool, styles, onStyle }) {
  if (tool === 'pen') {
    const style = styles.pen;
    return (
      <div className="tool-style" aria-label="Pen style">
        <span className="tool-style-swatches">
          {INK_COLORS.map((hex) => (
            <button key={hex} type="button" className="swatch sm" style={{ background: hex }} aria-label={`Pen color ${hex}`} aria-pressed={style.color === hex} onClick={() => onStyle('pen', { color: hex })} />
          ))}
        </span>
        <span className="segmented sm" role="group" aria-label="Pen thickness">
          {THICKNESS.map((t) => (
            <button key={t.label} type="button" aria-pressed={Math.abs(style.strokeWidth - t.value) < 0.0004} onClick={() => onStyle('pen', { strokeWidth: t.value })} title={t.label}>
              <span className="thickness-dot" style={{ width: 4 + t.value * 1100, height: 4 + t.value * 1100 }} />
            </button>
          ))}
        </span>
      </div>
    );
  }
  if (tool === 'highlight') {
    return (
      <div className="tool-style" aria-label="Highlight color">
        <span className="tool-style-swatches">
          {HIGHLIGHT_COLORS.map((hex) => (
            <button key={hex} type="button" className="swatch sm" style={{ background: hex }} aria-label={`Highlight ${hex}`} aria-pressed={styles.highlight.fill === hex} onClick={() => onStyle('highlight', { fill: hex })} />
          ))}
        </span>
      </div>
    );
  }
  if (['rect', 'ellipse', 'line', 'arrow'].includes(tool)) {
    const style = styles[tool];
    return (
      <div className="tool-style" aria-label="Shape style">
        <span className="tool-style-swatches">
          {INK_COLORS.concat('#dc2626').filter((v, i, a) => a.indexOf(v) === i).map((hex) => (
            <button key={hex} type="button" className="swatch sm" style={{ background: hex }} aria-label={`Color ${hex}`} aria-pressed={style.stroke === hex} onClick={() => onStyle(tool, { stroke: hex })} />
          ))}
        </span>
        <span className="segmented sm" role="group" aria-label="Thickness">
          {THICKNESS.map((t) => (
            <button key={t.label} type="button" aria-pressed={Math.abs(style.strokeWidth - t.value) < 0.0004} onClick={() => onStyle(tool, { strokeWidth: t.value })} title={t.label}>
              <span className="thickness-dot" style={{ width: 4 + t.value * 1100, height: 4 + t.value * 1100 }} />
            </button>
          ))}
        </span>
      </div>
    );
  }
  if (['check', 'cross', 'dot'].includes(tool)) {
    return (
      <div className="tool-style" aria-label="Mark color">
        <span className="tool-style-swatches">
          {INK_COLORS.map((hex) => (
            <button key={hex} type="button" className="swatch sm" style={{ background: hex }} aria-label={`Mark color ${hex}`} aria-pressed={styles.mark.color === hex} onClick={() => onStyle('mark', { color: hex })} />
          ))}
        </span>
      </div>
    );
  }
  return null;
}

/** The row of editing tools under the top bar; scrolls sideways on narrow screens. */
export default function Toolstrip({ tool, onTool, onImage, onSignature, styles, onStyle, busy, history, onUndo, onRedo }) {
  const shape = SHAPE_TOOLS.find((s) => s.id === tool);
  const mark = MARK_TOOLS.find((m) => m.id === tool);
  const ShapeIcon = (shape || SHAPE_TOOLS[0]).icon;
  const MarkIcon = (mark || MARK_TOOLS[0]).icon;

  return (
    <div className="editor-tools" role="toolbar" aria-label="Editing tools">
      <div className="editor-tools-scroll">
        <div className="tool-group">
          <ToolButton id="select" tool={tool} onTool={onTool} icon={MousePointer2} label="Select" shortcut="V" hideLabel />
          <ToolButton id="edit-text" tool={tool} onTool={onTool} icon={ScanText} label="Edit text" shortcut="E" />
          <ToolButton id="text" tool={tool} onTool={onTool} icon={Type} label="Add text" shortcut="T" />
          <Menu
            fixed
            align="left"
            trigger={({ toggle, ...aria }) => (
              <button type="button" className={`btn btn-ghost tool-btn ${tool === 'place' ? 'is-active' : ''}`} onClick={toggle} disabled={busy} title="Sign (S)" {...aria}>
                <Signature size={16} /> <span className="tool-label">Sign</span> <ChevronDown size={13} />
              </button>
            )}
          >
            <button type="button" role="menuitem" className="menu-item" onClick={() => onSignature('signature')}>
              <Signature size={16} /> Add signature
            </button>
            <button type="button" role="menuitem" className="menu-item" onClick={() => onSignature('initials')}>
              <Type size={16} /> Add initials
            </button>
            <button type="button" role="menuitem" className="menu-item" onClick={() => onSignature('saved')}>
              <PenLine size={16} /> Saved signatures
            </button>
          </Menu>
        </div>

        <div className="tool-group">
          <ToolButton id="pen" tool={tool} onTool={onTool} icon={PenLine} label="Draw" shortcut="D" />
          <ToolButton id="highlight" tool={tool} onTool={onTool} icon={Highlighter} label="Highlight" shortcut="H" />
          <Menu
            fixed
            align="left"
            trigger={({ toggle, ...aria }) => (
              <button type="button" className={`btn btn-ghost tool-btn ${shape ? 'is-active' : ''}`} onClick={toggle} title="Shapes" {...aria}>
                <ShapeIcon size={16} /> <span className="tool-label">{shape ? shape.label : 'Shapes'}</span> <ChevronDown size={13} />
              </button>
            )}
          >
            {SHAPE_TOOLS.map(({ id, label, icon: Icon, key }) => (
              <button key={id} type="button" role="menuitem" className="menu-item" onClick={() => onTool(id)} aria-current={tool === id}>
                <Icon size={16} /> {label} <small>{key}</small>
              </button>
            ))}
          </Menu>
          <Menu
            fixed
            align="left"
            trigger={({ toggle, ...aria }) => (
              <button type="button" className={`btn btn-ghost tool-btn ${mark ? 'is-active' : ''}`} onClick={toggle} title="Check marks (K)" {...aria}>
                <MarkIcon size={16} /> <span className="tool-label">Marks</span> <ChevronDown size={13} />
              </button>
            )}
          >
            {MARK_TOOLS.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" role="menuitem" className="menu-item" onClick={() => onTool(id)} aria-current={tool === id}>
                <Icon size={16} /> {label}
              </button>
            ))}
          </Menu>
          <button type="button" className="btn btn-ghost tool-btn" onClick={onImage} disabled={busy} title="Add image">
            <ImagePlus size={16} /> <span className="tool-label">Image</span>
          </button>
        </div>

        <div className="tool-group">
          <ToolButton id="whiteout" tool={tool} onTool={onTool} icon={Eraser} label="Whiteout" shortcut="W" />
          <ToolButton id="redact" tool={tool} onTool={onTool} icon={EyeOff} label="Redact" shortcut="X" />
        </div>

        <div className="tool-group tool-group-plain">
          <button type="button" className="btn btn-ghost btn-icon" onClick={onUndo} disabled={!history.canUndo} aria-label="Undo" title="Undo (⌘Z)">
            <Undo2 size={17} />
          </button>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onRedo} disabled={!history.canRedo} aria-label="Redo" title="Redo (⇧⌘Z)">
            <Redo2 size={17} />
          </button>
        </div>

        <StyleBar tool={tool} styles={styles} onStyle={onStyle} />
      </div>
    </div>
  );
}
