"""Makes scanned PDFs searchable: recognises the text on pages that have none and adds it as an
invisible layer exactly over the words, so the pages look identical but text can be selected,
searched and copied.

Pages are never rasterized again; only text is added. Pages that already have text are left
alone. Sideways or upside-down scans can be turned upright first (``auto_rotate``).
"""

from __future__ import annotations

import io
import logging
import math
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

import pymupdf
from fontTools import subset as ft_subset
from fontTools.ttLib import TTFont

logger = logging.getLogger(__name__)

FONT_DIR = Path(__file__).with_name("fonts")
DEVANAGARI = re.compile(r"[ऀ-ॿ꣠-ꣿ]")
# Pages with fewer visible characters than this count as image-only.
MIN_TEXT_CHARS = 12
# Quick orientation check: renders at this resolution in each of the four directions.
ORIENTATION_DPI = 150
LANGUAGE_CODE = re.compile(r"^[a-z]{3}(_[a-z]{3,4})?$")

# Very common words per supported language. A correctly oriented page reads as real words, a
# sideways or upside-down one as look-alike gibberish (Tesseract happily turns an upside-down
# "(555)" into "(GSS)"), so dictionary hits tell the orientations apart where character counts
# can't.
_COMMON_WORDS = {
    "eng": "the of and to in is for on that by this with you it not or be are from at as your all have new more an was we will can us about if page has date name total no number amount",
    "fra": "le la les de des du et en un une est pour que qui dans sur par pas au aux avec ce il elle nous vous date nom montant",
    "deu": "der die das und ist in zu den von mit sich des auf für nicht ein eine dem im sie es an werden aus er datum name betrag",
    "spa": "el la los las de del y en un una es por que con para no se su al lo como más fecha nombre importe",
    "ita": "il la le di e che in un una per non con del della sono si da al dei nel data nome importo",
    "por": "o a os as de do da e em um uma que para com não se por no na dos das data nome valor",
    "nld": "de het een en van in is op te dat voor met niet zijn aan er bij ook datum naam bedrag",
    "rus": "и в не на что с по это как а из у за от о для к но так все его она они дата имя сумма",
    "hin": "का की के है में और को से पर यह एक हैं नहीं भी लिए तो कि था ने हम आप",
}
_WORD_EDGES = re.compile(r"^[\W_]+|[\W_]+$", re.UNICODE)


@dataclass
class OcrResult:
    pages: int = 0
    recognized: int = 0
    skipped: int = 0
    rotated: list[int] = field(default_factory=list)
    words: int = 0

    def as_dict(self) -> dict:
        return {
            "pages": self.pages,
            "recognized": self.recognized,
            "skipped": self.skipped,
            "rotated": [n + 1 for n in self.rotated],
            "words": self.words,
        }


def available_languages(tessdata: Optional[str]) -> set[str]:
    if not tessdata or not Path(tessdata).is_dir():
        return set()
    return {p.stem for p in Path(tessdata).glob("*.traineddata") if p.stem != "osd"}


def parse_languages(raw: str, tessdata: Optional[str], default: str) -> str:
    """'eng+hin' from user input, keeping only installed languages (at most 4)."""
    installed = available_languages(tessdata)
    codes = []
    for code in re.split(r"[+,\s]+", (raw or "").strip().lower()):
        if code and LANGUAGE_CODE.match(code) and code in installed and code not in codes:
            codes.append(code)
    if not codes:
        codes = [c for c in default.split("+") if c in installed] or sorted(installed)[:1]
    return "+".join(codes[:4])


def has_text(page: pymupdf.Page) -> bool:
    return len(page.get_text("text").strip()) >= MIN_TEXT_CHARS


def _common_words(languages: str) -> set[str]:
    words: set[str] = set()
    for code in languages.split("+"):
        words.update(_COMMON_WORDS.get(code.split("_")[0], "").split())
    if not words:
        words.update(_COMMON_WORDS["eng"].split())
    return words


def _orientation_score(words: list[str], common: set[str]) -> int:
    score = 0
    for word in words:
        token = _WORD_EDGES.sub("", word).lower()
        if token in common:
            score += 1
    return score


def _recognize(page: pymupdf.Page, languages: str, dpi: int, tessdata: str, turn: int = 0) -> tuple[dict, pymupdf.Matrix]:
    """OCRs the page as displayed, optionally turned clockwise by ``turn`` degrees. Returns the
    recognised text (as a "dict") and the matrix from its coordinates to the unrotated page.

    Done by hand rather than with Page.get_textpage_ocr, which loses every word on pages stored
    with /Rotate 270."""
    zoom = dpi / 72
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom).prerotate(turn), alpha=False)
    with pymupdf.open("pdf", pixmap.pdfocr_tobytes(language=languages, tessdata=tessdata)) as result:
        ocr_page = result[0]
        data = ocr_page.get_text("dict", flags=pymupdf.TEXTFLAGS_DICT & ~pymupdf.TEXT_PRESERVE_IMAGES)
        scale = page.rect.width / ocr_page.rect.width if not turn else 1
    return data, pymupdf.Matrix(scale, scale) * page.derotation_matrix


def _map_tree(node, matrix: pymupdf.Matrix, scale: float):
    """Moves every box, origin and size in an extraction dict into page coordinates."""
    if isinstance(node, list):
        return [_map_tree(item, matrix, scale) for item in node]
    if not isinstance(node, dict):
        return node
    out = {}
    for key, value in node.items():
        if key == "bbox":
            out[key] = tuple(pymupdf.Rect(value) * matrix)
        elif key == "origin":
            out[key] = tuple(pymupdf.Point(value) * matrix)
        elif key == "size":
            out[key] = value * scale
        elif key == "dir":
            # Directions only rotate; drop the translation part of the matrix.
            vector = pymupdf.Point(value) * pymupdf.Matrix(matrix.a, matrix.b, matrix.c, matrix.d, 0, 0)
            length = math.hypot(vector.x, vector.y) or 1
            out[key] = (vector.x / length, vector.y / length)
        elif isinstance(value, (list, dict)):
            out[key] = _map_tree(value, matrix, scale)
        else:
            out[key] = value
    return out


def ocr_rawdict(page: pymupdf.Page, languages: str, dpi: int, tessdata: str, flags: int) -> dict:
    """Like page.get_text("rawdict") for a scan: what OCR reads, in the page's coordinates."""
    zoom = dpi / 72
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
    with pymupdf.open("pdf", pixmap.pdfocr_tobytes(language=languages, tessdata=tessdata)) as result:
        ocr_page = result[0]
        raw = ocr_page.get_text("rawdict", flags=flags)
        scale = page.rect.width / ocr_page.rect.width
    matrix = pymupdf.Matrix(scale, scale) * page.derotation_matrix
    mapped = _map_tree(raw, matrix, scale)
    mapped["width"], mapped["height"] = page.rect.width, page.rect.height
    return mapped


def _words(data: dict) -> list[str]:
    return [span["text"] for block in data.get("blocks", ()) for line in block.get("lines", ()) for span in line.get("spans", ()) if span.get("text", "").strip()]


def _best_turn(page: pymupdf.Page, languages: str, tessdata: str, common: set[str], upright_score: int) -> int:
    """Clockwise quarter turns (0/90/180/270) that make the page read best."""
    best_turn, best_score = 0, upright_score
    for turn in (90, 180, 270):
        data, _ = _recognize(page, languages, ORIENTATION_DPI, tessdata, turn)
        score = _orientation_score(_words(data), common)
        # Require a clear win so a stray hit never turns an upright page.
        if score >= 3 and score > best_score * 2:
            best_turn, best_score = turn, score
    return best_turn


def _spans(data: dict, to_page: pymupdf.Matrix) -> list[dict]:
    """Recognised words in unrotated page coordinates."""
    spans = []
    scale = math.hypot(to_page.a, to_page.b)
    for block in data.get("blocks", ()):
        for line in block.get("lines", ()):
            for span in line.get("spans", ()):
                text = span.get("text", "").strip()
                size = span.get("size", 0) * scale
                if text and size > 1:
                    spans.append({
                        "text": text,
                        "bbox": tuple(pymupdf.Rect(span["bbox"]) * to_page),
                        "origin": tuple(pymupdf.Point(span["origin"]) * to_page),
                        "size": size,
                    })
    return spans


def _winansi(text: str) -> bool:
    try:
        text.encode("cp1252")
        return True
    except UnicodeEncodeError:
        return False


def _subset_font(path: Path, text: str) -> bytes:
    """Only the glyphs the hidden text uses: the full Noto fonts would add ~600 KB per file."""
    font = TTFont(str(path))
    options = ft_subset.Options()
    options.layout_features = []
    options.notdef_outline = True
    options.name_IDs = ["*"]
    subsetter = ft_subset.Subsetter(options=options)
    subsetter.populate(unicodes={ord(ch) for ch in text if not ch.isspace()})
    subsetter.subset(font)
    out = io.BytesIO()
    font.save(out)
    return out.getvalue()


def _write_invisible_text(page: pymupdf.Page, spans: list[dict], fonts: dict[str, Optional[bytes]]) -> int:
    """Adds each recognised word as invisible text (render mode 3) stretched to its exact width."""
    if not spans:
        return 0
    helv = pymupdf.Font("helv")
    rotation = page.rotation
    to_visual = page.rotation_matrix
    registered: set[str] = set()
    shape = page.new_shape()
    written = 0
    for span in spans:
        text = unicodedata.normalize("NFC", span["text"])
        if _winansi(text):
            fontname, measure = "helv", helv
        else:
            key = "deva" if DEVANAGARI.search(text) else "noto"
            if not fonts.get(key):
                continue
            fontname, measure = f"FOCR{key}", fonts[f"{key}:font"]
            if fontname not in registered:
                page.insert_font(fontname=fontname, fontbuffer=fonts[key])
                registered.add(fontname)
        size = float(span["size"])
        natural = measure.text_length(text, fontsize=size)
        if natural <= 0:
            continue
        # Extraction coordinates are in the unrotated page; the word's length runs along the
        # visual x-axis, which is the unrotated y-axis on pages turned by 90 or 270 degrees.
        visual = pymupdf.Rect(span["bbox"]) * to_visual
        stretch = max(0.2, min(5.0, visual.width / natural))
        origin = pymupdf.Point(span["origin"])
        morph = pymupdf.Matrix(stretch, 1) if rotation in (0, 180) else pymupdf.Matrix(1, stretch)
        try:
            shape.insert_text(
                origin,
                text,
                fontsize=size,
                fontname=fontname,
                render_mode=3,
                rotate=rotation,
                morph=(origin, morph),
            )
            written += 1
        except Exception:  # pragma: no cover - one odd word must not lose the page
            logger.debug("Skipped OCR word %r", text, exc_info=True)
    shape.commit()
    return written


def ocr_document(
    doc: pymupdf.Document,
    *,
    languages: str,
    tessdata: str,
    dpi: int = 300,
    auto_rotate: bool = True,
    max_pages: int = 500,
    on_page: Optional[Callable[[int, int], None]] = None,
) -> OcrResult:
    """OCRs every image-only page of ``doc`` in place and returns what was done."""
    if len(doc) > max_pages:
        raise ValueError(f"OCR is limited to {max_pages} pages per document.")

    result = OcrResult(pages=len(doc))
    common = _common_words(languages)
    recognized: dict[int, list[dict]] = {}

    for page in doc:
        if on_page:
            on_page(page.number, len(doc))
        if has_text(page):
            result.skipped += 1
            continue
        data, to_page = _recognize(page, languages, dpi, tessdata)
        if auto_rotate:
            words = _words(data)
            score = _orientation_score(words, common)
            # Pages that already read as real words are upright; only doubtful ones are probed.
            if score < max(3, len(words) // 5):
                turn = _best_turn(page, languages, tessdata, common, score)
                if turn:
                    page.set_rotation((page.rotation + turn) % 360)
                    result.rotated.append(page.number)
                    data, to_page = _recognize(page, languages, dpi, tessdata)
        spans = _spans(data, to_page)
        if spans:
            recognized[page.number] = spans
            result.recognized += 1

    # One subset per fallback font, shared by every page, covering all recognised text.
    all_text = "".join(span["text"] for spans in recognized.values() for span in spans if not _winansi(span["text"]))
    fonts: dict = {}
    if all_text:
        for key, filename, matches in (
            ("deva", "NotoSansDevanagari-Regular.ttf", lambda t: DEVANAGARI.search(t)),
            ("noto", "NotoSans-Regular.ttf", lambda t: not DEVANAGARI.search(t)),
        ):
            text = "".join(span["text"] for spans in recognized.values() for span in spans if not _winansi(span["text"]) and matches(span["text"]))
            if not text:
                continue
            try:
                data = _subset_font(FONT_DIR / filename, text + " ")
                fonts[key] = data
                fonts[f"{key}:font"] = pymupdf.Font(fontbuffer=data)
            except Exception:  # pragma: no cover - fall back to the whole font file
                logger.exception("Could not subset %s", filename)
                data = (FONT_DIR / filename).read_bytes()
                fonts[key] = data
                fonts[f"{key}:font"] = pymupdf.Font(fontbuffer=data)

    for number, spans in recognized.items():
        result.words += _write_invisible_text(doc[number], spans, fonts)
    return result
