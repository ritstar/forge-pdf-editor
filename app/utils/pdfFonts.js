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

const STANDARD = {
  sans: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  serif: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  mono: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
};

// Slant used when a Unicode font has no italic face (pdf-lib's xSkew, in degrees).
export const FAUX_ITALIC_DEGREES = 12;

/**
 * Picks fonts for arbitrary text and splits it into runs that each font can draw.
 * Text the standard fonts can encode (WinAnsi) uses Helvetica, Times or Courier in the
 * requested weight and slant; anything else uses Noto Sans, with Noto Sans Devanagari for
 * Hindi/Marathi/Nepali (slanted when italic is asked for). Characters no font covers become
 * "?" instead of aborting the export.
 */
export async function createFontKit(pdfDoc) {
  const standardFonts = new Map();
  async function standardFont(family, bold, italic) {
    const name = (STANDARD[family] || STANDARD.sans)[(bold ? 1 : 0) + (italic ? 2 : 0)];
    if (!standardFonts.has(name)) standardFonts.set(name, pdfDoc.embedFont(name));
    return standardFonts.get(name);
  }
  // Every standard font shares the WinAnsi character set.
  const standardChars = charSet(await standardFont('sans', false, false));
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
  async function forText(text, { bold = false, italic = false, family = 'sans' } = {}) {
    const weight = bold ? 'bold' : 'regular';
    const source = String(text).replace(/\t/g, '    ');

    let candidates;
    let skew = 0;
    if (!needsUnicode(source)) {
      candidates = [{ font: await standardFont(family, bold, italic), chars: standardChars }];
    } else {
      candidates = [await embed('sans', weight)];
      if (DEVANAGARI.test(source)) candidates.push(await embed('devanagari', weight));
      if (italic) skew = FAUX_ITALIC_DEGREES;
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

    return { text: source, runsOf, widthOf, skew };
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
