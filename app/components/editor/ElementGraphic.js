'use client';

import { ellipsePath, inkPath, linePaths, MARK_PATHS, MARK_VIEWBOX, rectPath } from '@/app/utils/vectorPaths';

/**
 * Draws a vector element (shape, line, drawing, mark, redaction) filling its box.
 * `pageWidth` is the rendered page width in pixels; stroke widths are fractions of it.
 */
export default function ElementGraphic({ item, width, height, pageWidth }) {
  const w = Math.max(width, 0.01);
  const h = Math.max(height, 0.01);
  const common = {
    className: 'element-graphic',
    width: '100%',
    height: '100%',
    viewBox: `0 0 ${w} ${h}`,
    preserveAspectRatio: 'none',
    overflow: 'visible',
    'aria-hidden': true,
  };

  if (item.type === 'redact') {
    return (
      <svg {...common}>
        <rect x={0} y={0} width={w} height={h} fill="#000" />
      </svg>
    );
  }

  if (item.type === 'mark') {
    const mark = MARK_PATHS[item.kind] || MARK_PATHS.check;
    return (
      <svg {...common} viewBox={`0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}`} preserveAspectRatio="xMidYMid meet">
        {mark.fill ? (
          <path d={mark.d} fill={item.color} />
        ) : (
          <path d={mark.d} fill="none" stroke={item.color} strokeWidth={mark.stroke} strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    );
  }

  if (item.type === 'ink') {
    const sw = Math.max(0.5, item.strokeWidth * pageWidth);
    return (
      <svg {...common} style={{ opacity: item.opacity ?? 1 }}>
        <path d={inkPath(item.strokes, w, h)} fill="none" stroke={item.color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  // Shapes. Strokes sit inside the box, like in the exported PDF.
  const sw = item.stroke ? Math.max(0.5, item.strokeWidth * pageWidth) : 0;
  const opacity = item.opacity ?? 1;

  if (item.kind === 'line' || item.kind === 'arrow') {
    const { line, head } = linePaths(item, w, h, sw);
    return (
      <svg {...common} style={{ opacity }}>
        <path d={line} fill="none" stroke={item.stroke} strokeWidth={sw} strokeLinecap="round" />
        {head ? <path d={head} fill={item.stroke} stroke={item.stroke} strokeWidth={sw * 0.5} strokeLinejoin="round" /> : null}
      </svg>
    );
  }

  const d = item.kind === 'ellipse' ? ellipsePath(w, h, sw / 2) : rectPath(w, h, sw / 2);
  const style = { opacity };
  if (item.kind === 'highlight') style.mixBlendMode = 'multiply';
  return (
    <svg {...common} style={style}>
      <path d={d} fill={item.fill || 'none'} stroke={item.stroke || 'none'} strokeWidth={sw} strokeLinejoin="miter" />
    </svg>
  );
}
