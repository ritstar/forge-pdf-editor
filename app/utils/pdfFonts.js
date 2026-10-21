import { StandardFonts } from '@cantoo/pdf-lib';

// Unicode fonts are fetched only when some text needs them (Helvetica covers WinAnsi only).
// Files live in /public/fonts (SIL Open Font License, see OFL.txt).
const FONT_FILES = {
  sans: { regular: 'NotoSans-Regular.ttf', bold: 'NotoSans-Bold.ttf' },
  devanagari: { regular: 'NotoSansDevanagari-Regular.ttf', bold: 'NotoSansDevanagari-Bold.ttf' },
};

const bytesCache = new Map();

function loadFontBytes(file) {
  if (!bytesCache.has(file)) {
    const promise = fetch(`/fonts/${file}`).then((res) => {
      if (!res.ok) throw new Error(`Could not load font ${file}`);
      return res.arrayBuffer();
    });
    // Don't cache failures, so a transient network error can be retried.
    promise.catch(() => bytesCache.delete(file));
    bytesCache.set(file, promise);
  }
  return bytesCache.get(file);
}

const DEVANAGARI = /[ऀ-ॿ꣠-ꣿ]/;
const WHITESPACE = /\s/;

function charSet(font) {
  return new Set(font.getCharacterSet());
}

/**
 * Picks fonts for arbitrary text and splits it into runs that each font can draw.
 * Pure WinAnsi text keeps using Helvetica (identical output to before); anything else uses
 * Noto Sans, with Noto Sans Devanagari for Hindi/Marathi/Nepali. Characters no font covers
 * become "?" instead of aborting the export.
 */
export async function createFontKit(pdfDoc) {
  const standard = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  };
  const standardChars = charSet(standard.regular);
  const embedded = new Map();
  let fontkitRegistered = false;

  async function embed(family, weight) {
    const key = `${family}:${weight}`;
    if (!embedded.has(key)) {
      if (!fontkitRegistered) {
        const fontkit = await import('@cantoo/fontkit');
        pdfDoc.registerFontkit(fontkit.default || fontkit);
        fontkitRegistered = true;
      }
      const font = await pdfDoc.embedFont(await loadFontBytes(FONT_FILES[family][weight]), { subset: true });
      embedded.set(key, { font, chars: charSet(font) });
    }
    return embedded.get(key);
  }

  const needsUnicode = (text) => Array.from(String(text)).some((ch) => !WHITESPACE.test(ch) && !standardChars.has(ch.codePointAt(0)));

  /** Returns a layout helper for one piece of text (call once per text element). */
  async function forText(text, { bold = false } = {}) {
    const weight = bold ? 'bold' : 'regular';
    const source = String(text).replace(/\t/g, '    ');

    let candidates;
    if (!needsUnicode(source)) {
      candidates = [{ font: standard[weight], chars: standardChars }];
    } else {
      candidates = [await embed('sans', weight)];
      if (DEVANAGARI.test(source)) candidates.push(await embed('devanagari', weight));
    }
    const primary = candidates[0];

    const runsOf = (line) => {
      const runs = [];
      let current = null;
      for (const ch of Array.from(line)) {
        const code = ch.codePointAt(0);
        let target = WHITESPACE.test(ch) && current ? current.entry : candidates.find((c) => c.chars.has(code));
        let glyph = ch;
        if (!target) {
          target = primary;
          glyph = '?';
        }
        if (current && current.entry === target) {
          current.text += glyph;
        } else {
          current = { entry: target, text: glyph };
          runs.push(current);
        }
      }
      return runs.map((run) => ({ font: run.entry.font, text: run.text }));
    };

    const widthOf = (line, size) => runsOf(line).reduce((sum, run) => sum + run.font.widthOfTextAtSize(run.text, size), 0);

    return { text: source, runsOf, widthOf };
  }

  return { forText };
}

const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

// User-perceived characters, so breaks never split a conjunct, accent or emoji.
function graphemes(text) {
  return segmenter ? Array.from(segmenter.segment(text), (part) => part.segment) : Array.from(text);
}

export function wrapText(text, widthOf, size, maxWidth) {
  const lines = [];
  for (const paragraph of String(text).split(/\r?\n/)) {
    const words = paragraph.split(/(\s+)/).filter((part) => part.length);
    let line = '';

    for (const word of words) {
      const candidate = line + word;
      if (!line || widthOf(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      lines.push(line.trimEnd());
      line = word.trimStart();
    }

    // Hard-break any single word that is wider than the box.
    const pending = [line];
    while (pending.length) {
      const current = pending.shift();
      const chars = graphemes(current);
      if (widthOf(current, size) <= maxWidth || chars.length <= 1) {
        lines.push(current);
        continue;
      }
      let cut = chars.length - 1;
      while (cut > 1 && widthOf(chars.slice(0, cut).join(''), size) > maxWidth) cut -= 1;
      lines.push(chars.slice(0, cut).join(''));
      pending.unshift(chars.slice(cut).join(''));
    }
  }
  return lines;
}
