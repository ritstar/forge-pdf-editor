// SVG path data for the editor's vector elements (shapes, lines, arrows, marks, ink). The
// same paths are drawn on screen (in pixels) and into the PDF (in points, via drawSvgPath),
// so the download matches what the user sees.

const KAPPA = 0.5522847498;
const fmt = (n) => (Math.round(n * 100) / 100).toString();

export function rectPath(w, h, inset = 0) {
  const x0 = inset;
  const y0 = inset;
  const x1 = Math.max(inset, w - inset);
  const y1 = Math.max(inset, h - inset);
  return `M${fmt(x0)} ${fmt(y0)}L${fmt(x1)} ${fmt(y0)}L${fmt(x1)} ${fmt(y1)}L${fmt(x0)} ${fmt(y1)}Z`;
}

export function ellipsePath(w, h, inset = 0) {
  const rx = Math.max(0.5, w / 2 - inset);
  const ry = Math.max(0.5, h / 2 - inset);
  const cx = w / 2;
  const cy = h / 2;
  const ox = rx * KAPPA;
  const oy = ry * KAPPA;
  return [
    `M${fmt(cx - rx)} ${fmt(cy)}`,
    `C${fmt(cx - rx)} ${fmt(cy - oy)} ${fmt(cx - ox)} ${fmt(cy - ry)} ${fmt(cx)} ${fmt(cy - ry)}`,
    `C${fmt(cx + ox)} ${fmt(cy - ry)} ${fmt(cx + rx)} ${fmt(cy - oy)} ${fmt(cx + rx)} ${fmt(cy)}`,
    `C${fmt(cx + rx)} ${fmt(cy + oy)} ${fmt(cx + ox)} ${fmt(cy + ry)} ${fmt(cx)} ${fmt(cy + ry)}`,
    `C${fmt(cx - ox)} ${fmt(cy + ry)} ${fmt(cx - rx)} ${fmt(cy + oy)} ${fmt(cx - rx)} ${fmt(cy)}Z`,
  ].join('');
}

/** Start and end of a line element inside its w×h box; flips say which corner it starts at. */
export function lineEndpoints({ flipX, flipY }, w, h) {
  return {
    x1: flipX ? w : 0,
    y1: flipY ? h : 0,
    x2: flipX ? 0 : w,
    y2: flipY ? 0 : h,
  };
}

export function arrowHeadSize(strokeWidth) {
  return { length: Math.max(8, strokeWidth * 4.5), half: Math.max(4, strokeWidth * 2.6) };
}

/**
 * The line (shortened so it doesn't poke through the tip) and, for arrows, the filled head.
 */
export function linePaths(element, w, h, strokeWidth) {
  const { x1, y1, x2, y2 } = lineEndpoints(element, w, h);
  if (element.kind !== 'arrow') {
    return { line: `M${fmt(x1)} ${fmt(y1)}L${fmt(x2)} ${fmt(y2)}`, head: null };
  }
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const { length: headLength, half } = arrowHeadSize(strokeWidth);
  const usable = Math.min(headLength, length * 0.6);
  const baseX = x2 - ux * usable;
  const baseY = y2 - uy * usable;
  const head = `M${fmt(x2)} ${fmt(y2)}L${fmt(baseX - uy * half)} ${fmt(baseY + ux * half)}L${fmt(baseX + uy * half)} ${fmt(baseY - ux * half)}Z`;
  // Stop the shaft inside the head so its round cap is hidden.
  const shaftX = x2 - ux * usable * 0.6;
  const shaftY = y2 - uy * usable * 0.6;
  return { line: `M${fmt(x1)} ${fmt(y1)}L${fmt(shaftX)} ${fmt(shaftY)}`, head };
}

// Marks are drawn in a 24×24 box and scaled uniformly.
export const MARK_VIEWBOX = 24;
export const MARK_PATHS = {
  check: { d: 'M4 12.5L9.5 18L20 6', stroke: 3.2 },
  cross: { d: 'M5.5 5.5L18.5 18.5M18.5 5.5L5.5 18.5', stroke: 3.2 },
  dot: { d: ellipsePath(24, 24, 6), fill: true },
};

/** Smooth path through stroke points given as [x0, y0, x1, y1, …] in 0..1 of the box. */
export function inkPath(strokes, w, h) {
  const parts = [];
  for (const stroke of strokes || []) {
    const pts = stroke.points || [];
    const count = Math.floor(pts.length / 2);
    if (!count) continue;
    const px = (i) => pts[i * 2] * w;
    const py = (i) => pts[i * 2 + 1] * h;
    if (count === 1) {
      // A tap: a tiny segment so the round cap draws a dot.
      parts.push(`M${fmt(px(0))} ${fmt(py(0))}L${fmt(px(0) + 0.01)} ${fmt(py(0))}`);
      continue;
    }
    let d = `M${fmt(px(0))} ${fmt(py(0))}`;
    for (let i = 1; i < count - 1; i += 1) {
      const mx = (px(i) + px(i + 1)) / 2;
      const my = (py(i) + py(i + 1)) / 2;
      d += `Q${fmt(px(i))} ${fmt(py(i))} ${fmt(mx)} ${fmt(my)}`;
    }
    d += `L${fmt(px(count - 1))} ${fmt(py(count - 1))}`;
    parts.push(d);
  }
  return parts.join('');
}

/** Ramer–Douglas–Peucker: drops points that don't change the stroke's shape (in pixels). */
export function simplifyPoints(points, tolerance = 0.6) {
  if (points.length <= 2) return points;
  const sqTol = tolerance * tolerance;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    const [ax, ay] = points[first];
    const [bx, by] = points[last];
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    let maxDist = 0;
    let index = -1;
    for (let i = first + 1; i < last; i += 1) {
      const [px, py] = points[i];
      let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
      t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - px;
      const ey = ay + t * dy - py;
      const dist = ex * ex + ey * ey;
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }
    if (maxDist > sqTol && index > 0) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
