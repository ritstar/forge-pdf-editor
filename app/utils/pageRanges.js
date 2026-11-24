// Page selections typed by people: "1-3, 5, 8-", "all", "odd", "even", "last", "2-last".
// Page numbers are 1-based in the text and in the result.

const TOKEN = /^(\d+|last)?\s*(-\s*(\d+|last)?)?$/i;

/**
 * Parses a selection into ranges of 1-based pages, in the order written.
 * Returns { ranges: [{ from, to }], error } — error is a message for the first bad part.
 */
export function parseRanges(text, total) {
  const source = String(text || '').trim().toLowerCase();
  if (!source || source === 'all') return { ranges: total ? [{ from: 1, to: total }] : [], error: '' };
  if (source === 'odd' || source === 'even') {
    const ranges = [];
    for (let page = source === 'odd' ? 1 : 2; page <= total; page += 2) ranges.push({ from: page, to: page });
    return { ranges, error: '' };
  }

  const ranges = [];
  for (const rawPart of source.split(/[,;]+/)) {
    const part = rawPart.trim();
    if (!part) continue;
    const match = TOKEN.exec(part);
    if (!match || (!match[1] && !match[2])) return { ranges: [], error: `“${rawPart.trim()}” isn't a page or range.` };
    const value = (token, fallback) => (token === undefined ? fallback : token === 'last' ? total : Number(token));
    const from = value(match[1], 1);
    const to = match[2] ? value(match[3], total) : from;
    if (from < 1 || to < 1 || from > total || to > total) {
      return { ranges: [], error: `Pages must be between 1 and ${total}.` };
    }
    // "5-2" is read as pages 5 down to 2.
    ranges.push({ from, to });
  }
  return { ranges, error: ranges.length ? '' : 'Enter at least one page.' };
}

/** The pages of the ranges as 0-based indices, in order (duplicates kept). */
export function rangesToIndices(ranges) {
  const indices = [];
  for (const { from, to } of ranges) {
    const step = from <= to ? 1 : -1;
    for (let page = from; step > 0 ? page <= to : page >= to; page += step) indices.push(page - 1);
  }
  return indices;
}

/** A set of 0-based pages selected by `text` (for "apply to these pages" options). */
export function pageSet(text, total) {
  const { ranges, error } = parseRanges(text, total);
  return { pages: new Set(rangesToIndices(ranges)), error };
}

/** Compact text for a set of 1-based page numbers: [1,2,3,5] -> "1-3, 5". */
export function formatPages(pages) {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < sorted.length; i += 1) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j += 1;
    parts.push(j > i ? `${sorted[i]}-${sorted[j]}` : `${sorted[i]}`);
    i = j;
  }
  return parts.join(', ');
}
