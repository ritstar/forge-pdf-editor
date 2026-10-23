"""Finds editable text lines on PDF pages (with OCR for scans) and rewrites them in place.

New text is drawn with the closest font available, best first:
1. The page's own font. Its ToUnicode map is reversed and glyph codes are written directly,
   so this works with subset fonts as long as every character occurs somewhere in the subset.
2. An installed font (see font_library): the same family, a metric-compatible look-alike, or
   the closest generic family; or the family the user picked. Embedded as a subset. Complex
   scripts like Devanagari go through MuPDF's HTML engine, which shapes them.
3. The closest Base-14 font (Helvetica / Times / Courier), or the bundled Noto fonts, when no
   installed font has every character.

All coordinates exchanged with the editor are "visual": what the user sees, origin at the
top-left of the displayed (rotated, cropped) page, normalized to 0..1 of its width/height.
"""

from __future__ import annotations

import logging
import math
import os
import re
from pathlib import Path
from typing import Optional

import numpy as np
import pymupdf

from . import font_detect, font_library

logger = logging.getLogger(__name__)

FONT_DIR = Path(__file__).with_name("fonts")
OCR_LANGUAGES = os.getenv("OCR_LANGUAGES", "eng+hin")
OCR_DPI = int(os.getenv("OCR_DPI", "300"))
# Each edit subsets a font, so these bound the work one request can cause; real documents
# need a few dozen edits.
MAX_EDITS = 300
MAX_EDIT_CHARS = 2000
MAX_TOTAL_EDIT_CHARS = 20000
# Pages are rendered at this zoom to sample text and background colors.
SAMPLE_ZOOM = 2
SAMPLE_MAX_PIXELS = 4000

TEXT_FLAGS = pymupdf.TEXTFLAGS_DICT & ~pymupdf.TEXT_PRESERVE_IMAGES
SUBSET_PREFIX = re.compile(r"^[A-Z]{6}\+")
# Scripts whose glyphs need shaping (reordering, conjuncts), so raw glyph codes can't be reused.
COMPLEX_SCRIPT = re.compile(r"[֐-ࣿऀ-෿฀-໿က-႟ក-៿꣠-ꣿ]")
DEVANAGARI = re.compile(r"[ऀ-ॿ꣠-ꣿ]")
# Noto Sans ascender (1069/1000 em); places the HTML fallback's baseline on the original one.
NOTO_ASCENT = 1.069

BASE14 = {
    # family: (regular, bold, italic, bold italic)
    "sans": ("helv", "hebo", "heit", "hebi"),
    "serif": ("tiro", "tibo", "tiit", "tibi"),
    "mono": ("cour", "cobo", "coit", "cobi"),
}

_tessdata_cache: dict[str, Optional[str]] = {}


def tessdata_dir() -> Optional[str]:
    """Location of Tesseract language data, or None if OCR is not installed."""
    if "dir" not in _tessdata_cache:
        found = os.getenv("TESSDATA_PREFIX") or None
        if not found:
            try:
                found = pymupdf.get_tessdata()
            except Exception:
                found = None
        _tessdata_cache["dir"] = found if found and Path(found).is_dir() else None
    return _tessdata_cache["dir"]


def _font_key(name: str) -> str:
    return SUBSET_PREFIX.sub("", name or "").strip()


def _hex(rgb) -> str:
    r, g, b = (int(max(0, min(255, round(v)))) for v in rgb)
    return f"#{r:02x}{g:02x}{b:02x}"


def _rgb(value: str, default=(0.0, 0.0, 0.0)) -> tuple[float, float, float]:
    raw = str(value or "").lstrip("#")
    if not re.fullmatch(r"[0-9a-fA-F]{6}", raw):
        return default
    return tuple(int(raw[i : i + 2], 16) / 255 for i in (0, 2, 4))


def _style(span: dict) -> dict:
    """Weight, slant and family class from the span flags, corrected by the font name."""
    flags = span.get("flags", 0)
    name = _font_key(span.get("font", "")).lower()
    mono = bool(flags & pymupdf.TEXT_FONT_MONOSPACED) or any(k in name for k in ("mono", "courier", "consol"))
    if "sans" in name or mono:
        serif = False
    elif any(k in name for k in ("serif", "times", "georgia", "garamond", "cambria", "roman", "book")):
        serif = True
    else:
        serif = bool(flags & pymupdf.TEXT_FONT_SERIFED)
    return {
        "bold": bool(flags & pymupdf.TEXT_FONT_BOLD) or any(k in name for k in ("bold", "black", "heavy", "semibold", "demi")),
        "italic": bool(flags & pymupdf.TEXT_FONT_ITALIC) or "italic" in name or "oblique" in name,
        "serif": serif,
        "mono": mono,
    }


class _ColorSampler:
    """Estimates background and ink colors under a text line from a rendering of the page."""

    def __init__(self, page: pymupdf.Page):
        longest = max(page.rect.width, page.rect.height, 1)
        self.zoom = min(SAMPLE_ZOOM, SAMPLE_MAX_PIXELS / longest)
        pix = page.get_pixmap(matrix=pymupdf.Matrix(self.zoom, self.zoom), colorspace=pymupdf.csRGB, alpha=False)
        rows = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.stride)
        self.image = rows[:, : pix.width * 3].reshape(pix.height, pix.width, 3)

    def colors(self, rect: pymupdf.Rect) -> tuple[str, Optional[str]]:
        height, width = self.image.shape[:2]
        pad = 2
        x0 = max(0, int((rect.x0 - pad) * self.zoom))
        y0 = max(0, int((rect.y0 - pad) * self.zoom))
        x1 = min(width, int(math.ceil((rect.x1 + pad) * self.zoom)))
        y1 = min(height, int(math.ceil((rect.y1 + pad) * self.zoom)))
        if x1 - x0 < 2 or y1 - y0 < 2:
            return "#ffffff", None

        region = self.image[y0:y1, x0:x1].astype(np.int32)
        border = np.concatenate([region[0], region[-1], region[:, 0], region[:, -1]])
        background = np.median(border, axis=0)
        pixels = region.reshape(-1, 3)
        distance = np.abs(pixels - background).sum(axis=1)
        if distance.max() < 60:
            return _hex(background), None
        ink = pixels[distance >= distance.max() * 0.6]
        return _hex(background), _hex(ink.mean(axis=0))


def _mostly_invisible(page: pymupdf.Page) -> bool:
    """True for scans with a hidden OCR layer: the visible text is part of the image."""
    total = invisible = 0
    for trace in page.get_texttrace():
        count = len(trace.get("chars", ()))
        total += count
        if trace.get("type") == 3 or trace.get("opacity", 1) == 0:
            invisible += count
    return total > 0 and invisible * 2 > total


def _restore_ocr_spaces(raw: dict) -> None:
    """OCR output has one span per word, and Tesseract often leaves out the spaces between
    Devanagari words: put a space wherever two words are apart on the page."""
    for block in raw["blocks"]:
        for line in block.get("lines", ()):
            previous = None
            for span in line["spans"]:
                text = "".join(char["c"] for char in span.get("chars", ()))
                if (
                    previous is not None
                    and text[:1] and not text[:1].isspace()
                    and previous["text"][-1:] and not previous["text"][-1:].isspace()
                    and span["bbox"][0] - previous["bbox"][2] > span["size"] * 0.12
                ):
                    text = " " + text
                span["text"] = text
                previous = span


def _style_runs(spans: list[dict], source: str) -> list[list[dict]]:
    """Splits a line where weight, slant, size or color change, so each part keeps its look.
    Complex scripts stay whole: their glyphs are often spread over several fonts."""
    if source == "ocr" or COMPLEX_SCRIPT.search("".join(s["text"] for s in spans)):
        return [spans]
    runs: list[list[dict]] = []
    current = None
    for span in spans:
        style = _style(span)
        key = (style["bold"], style["italic"], round(span["size"], 1), span["color"])
        if runs and (key == current or not span["text"].strip()):
            runs[-1].append(span)  # Whitespace joins the run before it.
        else:
            runs.append([span])
            current = key
    return runs


def analyze_page(doc: pymupdf.Document, page_number: int = 0) -> dict:
    """Lists the page's text lines with position, font and colors. OCRs pages without text."""
    page = doc[page_number]
    width, height = page.rect.width, page.rect.height
    result = {"width": width, "height": height, "rotation": page.rotation, "source": "pdf", "lines": []}

    raw = page.get_text("dict", flags=TEXT_FLAGS)
    found = sum(len(s["text"].strip()) for b in raw["blocks"] for l in b.get("lines", ()) for s in l["spans"])
    source = "pdf"
    if found < 3:
        tessdata = tessdata_dir()
        if not tessdata:
            result["source"] = "none"
            result["ocrUnavailable"] = True
            return result
        textpage = page.get_textpage_ocr(language=OCR_LANGUAGES, dpi=OCR_DPI, full=True, tessdata=tessdata)
        raw = page.get_text("rawdict", flags=TEXT_FLAGS, textpage=textpage)
        _restore_ocr_spaces(raw)
        source = "ocr"
    elif _mostly_invisible(page):
        source = "ocr"
    result["source"] = source

    fonts = font_library.library()
    result["fonts"] = fonts.picker()
    rotate = page.rotation_matrix
    sampler = _ColorSampler(page)
    words: list[list[tuple[str, pymupdf.Rect]]] = []  # per line, for font detection on scans
    for block in raw["blocks"]:
        for line_no, line in enumerate(block.get("lines", ())):
            spans = [s for s in line["spans"] if s["text"]]
            if not "".join(s["text"] for s in spans).strip():
                continue
            # Only lines that read left-to-right as displayed can be edited in the overlay.
            direction = pymupdf.Point(line["dir"]) * rotate - pymupdf.Point(0, 0) * rotate
            if direction.x < 0.99:
                continue

            for run_no, run in enumerate(_style_runs(spans, source)):
                text = "".join(s["text"] for s in run).rstrip()
                if not text.strip():
                    continue
                main = max(run, key=lambda s: len(s["text"].strip()))
                box = pymupdf.Rect(run[0]["bbox"])
                for span in run[1:]:
                    box |= pymupdf.Rect(span["bbox"])
                box = box * rotate
                origin = pymupdf.Point(run[0]["origin"]) * rotate
                background, ink = sampler.colors(box)
                size = main["size"]
                if source == "ocr":
                    # OCR font sizes are rough; the ink height of the line is a better guide.
                    if not 0 < size < box.height * 1.5:
                        size = box.height / 1.2
                    color = ink or "#000000"
                    style = {"bold": False, "italic": False, "serif": False, "mono": False}
                    font = ""
                else:
                    color = _hex(((main["color"] >> 16) & 255, (main["color"] >> 8) & 255, main["color"] & 255))
                    style = _style(main)
                    # Type3 fonts have no usable name (MuPDF reports "Type3 (12 0 R)").
                    font = "" if main["font"].startswith("Type3") else _font_key(main["font"])

                # The installed font used when the PDF's own copy can't draw an edit.
                match = fonts.match(font, text=text, family="", **style)
                result["lines"].append(
                    {
                        "id": f"{block['number']}-{line_no}-{run_no}",
                        "match": match.face.family if match else "",
                        "matchExact": bool(match and match.exact),
                        "text": text,
                        "x": box.x0 / width,
                        "y": box.y0 / height,
                        "width": box.width / width,
                        "height": box.height / height,
                        "originX": origin.x / width,
                        "baseline": origin.y / height,
                        "size": round(size, 2),
                        "font": font,
                        "color": color,
                        "background": background,
                        "source": source,
                        **style,
                    }
                )
                words.append([(s["text"], pymupdf.Rect(s["bbox"]) * rotate) for s in run])

    if source == "ocr" and result["lines"]:
        # Scans carry no font names: compare the words' shapes with the installed fonts.
        try:
            detections = font_detect.detect(page, words, fonts)
        except Exception:
            logger.exception("Font detection failed")
            detections = []
        for line, found in zip(result["lines"], detections):
            if found is None:
                continue
            line.update(
                match=found.face.family,
                matchExact=False,
                detected=round(found.score, 2),
                bold=found.bold,
                italic=found.italic,
                serif=found.face.category == "serif",
                mono=found.face.category == "mono",
            )
    return result


# ---------------------------------------------------------------------------------------------
# Applying edits


def _utf16(hex_text: str) -> str:
    return bytes.fromhex(hex_text if len(hex_text) % 2 == 0 else "0" + hex_text).decode("utf-16-be", errors="ignore")


def _parse_tounicode(data: bytes) -> dict[str, int]:
    """Reverses a ToUnicode CMap: text (one char, or several for ligatures) -> character code."""
    text = data.decode("latin-1")
    mapping: dict[str, int] = {}

    def add(code: int, value: str) -> None:
        if value and value not in mapping:
            mapping[value] = code

    for section in re.finditer(r"beginbfchar(.*?)endbfchar", text, re.S):
        for src, dst in re.findall(r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>", section.group(1)):
            add(int(src, 16), _utf16(dst))

    for section in re.finditer(r"beginbfrange(.*?)endbfrange", text, re.S):
        for lo, hi, dst in re.findall(r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(\[[^\]]*\]|<[0-9A-Fa-f]*>)", section.group(1)):
            lo, hi = int(lo, 16), int(hi, 16)
            if hi < lo or hi - lo > 0xFFFF:
                continue
            if dst.startswith("["):
                for offset, item in enumerate(re.findall(r"<([0-9A-Fa-f]*)>", dst)):
                    add(lo + offset, _utf16(item))
            else:
                base = _utf16(dst[1:-1])
                if not base:
                    continue
                for code in range(lo, hi + 1):
                    last = ord(base[-1]) + code - lo
                    if last <= 0x10FFFF:
                        add(code, base[:-1] + chr(last))
    return mapping


class _FontEncoder:
    """Turns text into character codes of an existing PDF font."""

    def __init__(self, doc: pymupdf.Document, xref: int, mapping: dict[str, int], code_bytes: int):
        self.doc = doc
        self.xref = xref
        self.mapping = mapping
        self.code_bytes = code_bytes
        self.longest = max((len(k) for k in mapping), default=1)
        self.drawable: dict[int, bool] = {}

    def encode(self, text: str) -> Optional[list]:
        """TJ operands, or None if a character is missing from the font."""
        parts = self._encode(text)
        if parts is None:
            return None
        codes = {code for part in parts if isinstance(part, list) for code in part}
        return parts if self._all_drawable(codes) else None

    def _all_drawable(self, codes: set[int]) -> bool:
        """Subsetters often keep every code (and its ToUnicode entry) but empty the outlines of
        unused glyphs, so render the glyphs once with MuPDF to see which ones have ink."""
        unknown = sorted(c for c in codes if c not in self.drawable and c != self.mapping.get(" "))
        if unknown:
            cell, columns = 32, 16
            rows = math.ceil(len(unknown) / columns)
            page = self.doc.new_page(width=cell * columns, height=cell * rows)
            try:
                name = _alias_font(self.doc, page, self.xref)
                if not name:
                    return False
                ops = [f"BT /{name} 22 Tf"]
                for i, code in enumerate(unknown):
                    x, y = (i % columns) * cell + 6, page.rect.height - (i // columns + 1) * cell + 8
                    ops.append(f"1 0 0 1 {x} {y} Tm {self.operands([[code]])} Tj")
                ops.append("ET")
                _append_content(self.doc, page, "\n".join(ops))
                pix = page.get_pixmap(colorspace=pymupdf.csGRAY, alpha=False)
                image = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.stride)[:, : pix.width]
                for i, code in enumerate(unknown):
                    top, left = (i // columns) * cell, (i % columns) * cell
                    self.drawable[code] = bool((image[top : top + cell, left : left + cell] < 200).any())
            finally:
                self.doc.delete_page(page.number)
        return all(self.drawable.get(c, True) for c in codes)

    def _encode(self, text: str) -> Optional[list]:
        parts: list = []
        codes: list[int] = []
        i = 0
        while i < len(text):
            for size in range(min(self.longest, len(text) - i), 0, -1):
                code = self.mapping.get(text[i : i + size])
                if code is not None:
                    codes.append(code)
                    i += size
                    break
            else:
                if text[i] != " ":
                    return None
                # Many subsets have no space glyph (spacing was done by positioning): move instead.
                if codes:
                    parts.append(codes)
                    codes = []
                parts.append(-250)
                i += 1
        if codes:
            parts.append(codes)
        return parts

    def operands(self, parts: list) -> str:
        width = self.code_bytes * 2
        return " ".join(
            str(part) if isinstance(part, int) else "<" + "".join(f"{c:0{width}x}" for c in part) + ">" for part in parts
        )


def _encoders_for(doc: pymupdf.Document, page_number: int, font_name: str) -> list[_FontEncoder]:
    encoders = []
    for xref, ext, ftype, basefont, *_rest in doc.get_page_fonts(page_number, full=True):
        # MuPDF truncates long font names to 31 characters (including the subset prefix).
        if font_name not in (_font_key(basefont), _font_key(basefont[:31])) or ftype == "Type3":
            continue
        encoding = _rest[1] if len(_rest) > 1 else ""
        kind, value = doc.xref_get_key(xref, "ToUnicode")
        if ftype == "Type0":
            if encoding != "Identity-H" or kind != "xref":
                continue
            encoders.append(_FontEncoder(doc, xref, _parse_tounicode(doc.xref_stream(int(value.split()[0]))), 2))
        elif kind == "xref":
            encoders.append(_FontEncoder(doc, xref, _parse_tounicode(doc.xref_stream(int(value.split()[0]))), 1))
        elif ext == "n/a" and encoding in ("WinAnsiEncoding", ""):
            # Not embedded: the viewer supplies the full font, so every WinAnsi character exists.
            mapping = {}
            for code in range(32, 256):
                try:
                    mapping.setdefault(bytes([code]).decode("cp1252"), code)
                except UnicodeDecodeError:
                    pass
            encoders.append(_FontEncoder(doc, xref, mapping, 1))
    return encoders


def _alias_font(doc: pymupdf.Document, page: pymupdf.Page, font_xref: int) -> Optional[str]:
    """Adds an existing font object to the page's /Font resources and returns its name."""
    name = f"FgE{font_xref}"
    kind, value = doc.xref_get_key(page.xref, "Resources")
    if kind == "xref":
        holder, prefix = int(value.split()[0]), ""
    elif kind == "dict":
        holder, prefix = page.xref, "Resources/"
    else:
        return None  # Inherited resources: let the caller fall back to another font.

    fkind, fvalue = doc.xref_get_key(holder, prefix + "Font")
    if fkind == "xref":
        doc.xref_set_key(int(fvalue.split()[0]), name, f"{font_xref} 0 R")
    elif fkind == "dict":
        doc.xref_set_key(holder, f"{prefix}Font/{name}", f"{font_xref} 0 R")
    else:
        doc.xref_set_key(holder, prefix + "Font", f"<</{name} {font_xref} 0 R>>")
    return name


def _append_content(doc: pymupdf.Document, page: pymupdf.Page, data: str) -> None:
    page.wrap_contents()
    xref = doc.get_new_xref()
    doc.update_object(xref, "<<>>")
    doc.update_stream(xref, data.encode("latin-1"))
    contents = [*page.get_contents(), xref]
    doc.xref_set_key(page.xref, "Contents", "[" + " ".join(f"{x} 0 R" for x in contents) + "]")


def clean_edits(raw: object, page_count: int) -> list[dict]:
    """Validates edits sent by the browser."""
    if not isinstance(raw, list):
        raise ValueError("Edits must be a list.")
    if len(raw) > MAX_EDITS:
        raise ValueError("Too many text edits.")
    if sum(len(item.get("text", "")) for item in raw if isinstance(item, dict) and isinstance(item.get("text"), str)) > MAX_TOTAL_EDIT_CHARS:
        raise ValueError("Too much edited text.")

    def num(value, lo, hi):
        number = float(value)
        if not math.isfinite(number):
            raise ValueError("Invalid number.")
        return min(max(number, lo), hi)

    cleaned = []
    for item in raw:
        if not isinstance(item, dict):
            raise ValueError("Invalid edit.")
        page = int(item.get("page", -1))
        text = item.get("text", "")
        if not 0 <= page < page_count or not isinstance(text, str) or len(text) > MAX_EDIT_CHARS:
            raise ValueError("Invalid edit.")
        cleaned.append(
            {
                "page": page,
                "text": text.replace("\r", "").replace("\n", " ").replace("\t", "    "),
                "x": num(item.get("x", 0), 0, 1),
                "y": num(item.get("y", 0), 0, 1),
                "width": num(item.get("width", 0), 0, 1),
                "height": num(item.get("height", 0), 0, 1),
                "originX": num(item.get("originX", item.get("x", 0)), 0, 1),
                "baseline": num(item.get("baseline", 0), 0, 1),
                "size": num(item.get("size", 12), 2, 300),
                "font": str(item.get("font", ""))[:128],
                # False once the user changed weight, slant or font: the original can't draw that.
                "reuseOriginal": item.get("reuseOriginal", True) is not False,
                # A family from the font picker; empty means match the original automatically.
                "fontFamily": str(item.get("fontFamily", ""))[:128],
                "color": str(item.get("color", "#000000"))[:7],
                "background": str(item.get("background", "#ffffff"))[:7],
                "source": "ocr" if item.get("source") == "ocr" else "pdf",
                **{key: bool(item.get(key)) for key in ("bold", "italic", "serif", "mono")},
            }
        )
    return cleaned


def apply_edits(doc: pymupdf.Document, edits: list[dict]) -> list[str]:
    """Removes each edited line's original text and draws the replacement. Returns warnings."""
    warnings: set[str] = set()
    by_page: dict[int, list[dict]] = {}
    for edit in edits:
        by_page.setdefault(edit["page"], []).append(edit)

    for page_number, items in sorted(by_page.items()):
        # Resolve the original fonts first: the glyph check adds and removes a scratch page,
        # which invalidates Page objects, and redaction then rewrites the page's content.
        encoders: dict[str, list[_FontEncoder]] = {}
        resolved = []
        for edit in items:
            parts = encoder = None
            text = edit["text"]
            reuse = edit["reuseOriginal"] and not edit["fontFamily"]
            if reuse and edit["source"] == "pdf" and edit["font"] and text.strip() and not COMPLEX_SCRIPT.search(text):
                if edit["font"] not in encoders:
                    encoders[edit["font"]] = _encoders_for(doc, page_number, edit["font"])
                for candidate in encoders[edit["font"]]:
                    parts = candidate.encode(text)
                    if parts is not None:
                        encoder = candidate
                        break
            resolved.append((edit, encoder, parts))

        page = doc[page_number]
        width, height = page.rect.width, page.rect.height
        unrotate = page.derotation_matrix
        to_pdf = ~page.transformation_matrix

        prepared = []
        for edit, encoder, parts in resolved:
            visual = pymupdf.Rect(
                edit["x"] * width,
                edit["y"] * height,
                (edit["x"] + edit["width"]) * width,
                (edit["y"] + edit["height"]) * height,
            )
            origin = pymupdf.Point(edit["originX"] * width, edit["baseline"] * height)
            prepared.append({**edit, "visual": visual, "origin": origin, "encoder": encoder, "parts": parts})

        # Remove the original text. Digital text is deleted without touching anything else;
        # on scans the line is painted over with the sampled paper color and its pixels blanked.
        for source, images in (("pdf", pymupdf.PDF_REDACT_IMAGE_NONE), ("ocr", pymupdf.PDF_REDACT_IMAGE_PIXELS)):
            group = [p for p in prepared if p["source"] == source]
            if not group:
                continue
            for p in group:
                box = p["visual"]
                if source == "pdf":
                    # Shrink vertically so characters of neighbouring lines are never caught.
                    inset = box.height * 0.25
                    area = pymupdf.Rect(box.x0 + 0.5, box.y0 + inset, box.x1 - 0.5, box.y1 - inset)
                    page.add_redact_annot(area * unrotate, fill=False, cross_out=False)
                else:
                    pad = box.height * 0.08
                    area = pymupdf.Rect(box.x0 - 1.5, box.y0 - pad, box.x1 + 1.5, box.y1 + pad)
                    page.add_redact_annot(area * unrotate, fill=_rgb(p["background"], (1, 1, 1)), cross_out=False)
            page.apply_redactions(
                images=images,
                graphics=pymupdf.PDF_REDACT_LINE_ART_NONE,
                text=pymupdf.PDF_REDACT_TEXT_REMOVE,
            )

        fonts = font_library.library()
        for n, p in enumerate(prepared):
            if not p["text"].strip():
                continue
            if _draw_with_original_font(doc, page, p, to_pdf, unrotate):
                continue
            match = fonts.match(
                p["font"],
                text=p["text"],
                bold=p["bold"],
                italic=p["italic"],
                serif=p["serif"],
                mono=p["mono"],
                family=p["fontFamily"],
            )
            # "ABCDEF+Arial-BoldMT" / "Arial Regular" -> "Arial", for the warning.
            original = font_library.pdf_family_key(p["font"]) and re.sub(
                r"\s+(Regular|Bold|Italic|Oblique|Bold Italic)$", "", re.split(r"[-,]", p["font"].split("+")[-1])[0]
            )
            missed = p["source"] == "pdf" and original and p["reuseOriginal"] and not p["fontFamily"]
            if match and missed:
                warnings.add(
                    f"{original} doesn't have every character you typed, so "
                    + (f"another copy of {match.face.family} was used." if match.exact else f"{match.face.family}, a close match, was used.")
                )
            elif missed or (p["fontFamily"] and not match):
                warnings.add("Some edited text uses characters the chosen font doesn't contain, so a similar font was used.")

            if match:
                try:
                    _draw_library_font(page, p, match.face, n, unrotate)
                    continue
                except Exception:
                    logger.exception("Could not draw with %s; using a built-in font", match.face.path)
            if all(ord(ch) < 256 for ch in p["text"]):
                _draw_base14(page, p, unrotate)
            else:
                _draw_html(page, p, unrotate)
    return sorted(warnings)


def _draw_with_original_font(doc, page, p, to_pdf, unrotate) -> bool:
    encoder = p["encoder"]
    if encoder is None:
        return False
    name = _alias_font(doc, page, encoder.xref)
    if not name:
        return False

    origin = p["origin"] * unrotate * to_pdf
    angle = math.radians(page.rotation)
    cos, sin = math.cos(angle), math.sin(angle)
    r, g, b = _rgb(p["color"])
    _append_content(
        doc,
        page,
        "\n".join(
            [
                "q",
                "BT",
                "0 Tc 0 Tw 100 Tz 0 Ts 0 Tr",
                f"/{name} {p['size']:.3f} Tf",
                f"{r:.4f} {g:.4f} {b:.4f} rg",
                f"{cos:.5f} {sin:.5f} {-sin:.5f} {cos:.5f} {origin.x:.3f} {origin.y:.3f} Tm",
                f"[{encoder.operands(p['parts'])}] TJ",
                "ET",
                "Q",
                "",
            ]
        ),
    )
    return True


def _draw_base14(page, p, unrotate) -> None:
    family = "mono" if p["mono"] else "serif" if p["serif"] else "sans"
    fontname = BASE14[family][(2 if p["italic"] else 0) + (1 if p["bold"] else 0)]
    page.insert_text(
        p["origin"] * unrotate,
        p["text"],
        fontname=fontname,
        fontsize=p["size"],
        color=_rgb(p["color"]),
        rotate=page.rotation,
    )


def _draw_library_font(page, p, face: font_library.Face, n: int, unrotate) -> None:
    """Draws the edit with an installed font, embedding only the glyphs it needs."""
    program = face.program(p["text"], p["bold"])
    # Weight or slant the family doesn't have is simulated, like word processors do.
    fake_bold = p["bold"] and not face.bold and not face.weight_axis
    fake_italic = p["italic"] and not face.italic

    if COMPLEX_SCRIPT.search(p["text"]):
        name = f"lib{n}.ttf"
        archive = pymupdf.Archive()
        archive.add(program, name)
        metrics = pymupdf.Font(fontbuffer=program)
        ascent, descent = metrics.ascender, -metrics.descender
        _draw_html(
            page,
            p,
            unrotate,
            css_font=f"@font-face{{font-family:lib;src:url({name})}}",
            family="lib",
            archive=archive,
            ascent=ascent,
            height=ascent + descent,
            weight="bold" if fake_bold or (p["bold"] and face.bold) else "normal",
        )
        return

    fontname = f"FE{n}x{page.number}"
    page.insert_font(fontname=fontname, fontbuffer=program)
    origin = p["origin"] * unrotate
    color = _rgb(p["color"])
    page.insert_text(
        origin,
        p["text"],
        fontname=fontname,
        fontsize=p["size"],
        color=color,
        fill=color,
        render_mode=2 if fake_bold else 0,
        border_width=0.03 if fake_bold else 0.05,
        rotate=page.rotation,
        # Shear around the baseline: the top of each glyph leans right.
        morph=(origin, pymupdf.Matrix(1, 0, 0.2, 1, 0, 0)) if fake_italic else None,
    )


def _draw_html(page, p, unrotate, *, css_font=None, family=None, archive=None, ascent=NOTO_ASCENT, height=1.362, weight=None) -> None:
    """Draws through MuPDF's HTML engine, which shapes complex scripts. Defaults to bundled Noto."""
    if css_font is None:
        family = "dv" if DEVANAGARI.search(p["text"]) else "sans"
        css_font = (
            "@font-face{font-family:sans;src:url(NotoSans-Regular.ttf)}"
            "@font-face{font-family:sans;font-weight:bold;src:url(NotoSans-Bold.ttf)}"
            "@font-face{font-family:dv;src:url(NotoSansDevanagari-Regular.ttf)}"
            "@font-face{font-family:dv;font-weight:bold;src:url(NotoSansDevanagari-Bold.ttf)}"
        )
        archive = pymupdf.Archive(str(FONT_DIR))
    css = css_font + (
        f"p{{margin:0;white-space:pre;line-height:1.4;font-family:{family};font-size:{p['size']:.2f}px;"
        f"color:{p['color'] if re.fullmatch(r'#[0-9a-fA-F]{6}', p['color']) else '#000000'};"
        f"font-weight:{weight or ('bold' if p['bold'] else 'normal')};font-style:{'italic' if p['italic'] else 'normal'}}}"
    )
    # The box's top sits one ascent (plus half the extra line height) above the baseline.
    size = p["size"]
    top = p["origin"].y - size * (ascent + (1.4 - height) / 2)
    # MuPDF's HTML layout starts one unit in from the box edge.
    visual = pymupdf.Rect(p["origin"].x - 1, top, page.rect.width, top + size * 1.4 + 2)
    html = "<p>" + (p["text"].replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")) + "</p>"
    page.insert_htmlbox(visual * unrotate, html, css=css, archive=archive, rotate=page.rotation)
