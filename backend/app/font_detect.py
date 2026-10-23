"""Guesses the typeface of OCR'd text by comparing word images with the font library.

Tesseract's word boxes are reliable but its letter boxes are not (a word's width split evenly),
so each recognised word is cut out of the scan and compared with the same word rendered in
candidate fonts: a word's proportions, letter shapes and stroke weight tell typefaces apart.
All families are ranked on a sample of the page's words in their regular style first; then
every style of the best few is scored line by line, blended with the page as a whole so short
lines don't flip to a different font on a couple of noisy words.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from typing import Optional

import numpy as np
import pymupdf
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from .font_library import Face, FontLibrary

logger = logging.getLogger(__name__)

HEIGHT = 32  # words are compared at this height
RENDER_PX = 64
SCAN_DPI = 300
SCAN_MAX_PIXELS = 5000
SAMPLE_WORDS = 14  # words used to rank all families, plus one per line
MAX_SAMPLE = 30
SHORTLIST = 8  # families whose every style is then scored
MAX_WORDS_PER_LINE = 8
PAGE_PRIOR = 2  # weight of the page's score, in words, when scoring a line
# Below this the scan is too unclear (or the font too unusual) to name a font.
MIN_SCORE = 0.55
TIE = 0.03
COMMON = {
    "Arial", "Helvetica", "Times New Roman", "Times", "Courier New", "Courier", "Georgia", "Verdana",
    "Tahoma", "Calibri", "Cambria", "Garamond", "Palatino", "Book Antiqua", "Century Gothic",
    "Arimo", "Tinos", "Cousine", "Carlito", "Caladea", "Liberation Sans", "Liberation Serif",
    "Nimbus Sans", "Nimbus Roman", "P052", "C059", "URW Bookman", "Roboto", "Open Sans", "Lato",
    "Noto Sans", "Noto Serif", "DejaVu Sans", "Source Sans 3", "EB Garamond",
}


@dataclass(frozen=True)
class Variant:
    face: Face
    bold: bool
    italic: bool
    weight: Optional[float] = None  # for variable fonts

    @property
    def key(self) -> tuple:
        return (self.face.path, self.face.index, self.weight)


@dataclass
class Detection:
    face: Face
    bold: bool
    italic: bool
    score: float


def _runs(flags: np.ndarray, merge: int = 0) -> list[list[int]]:
    """[start, end) runs of True, joining runs separated by at most `merge` False values."""
    runs: list[list[int]] = []
    start = None
    for i, on in enumerate(list(flags) + [False]):
        if on and start is None:
            start = i
        elif not on and start is not None:
            if runs and start - runs[-1][1] <= merge:
                runs[-1][1] = i
            else:
                runs.append([start, i])
            start = None
    return runs


def _ink(gray: np.ndarray) -> Optional[np.ndarray]:
    """Ink coverage 0..1 of a word image, cropped to the ink. None when there is no clear ink."""
    if gray.size == 0:
        return None
    paper = np.percentile(gray, 95)
    dark = np.percentile(gray, 3)
    if paper - dark < 40:
        return None
    ink = np.clip((paper - gray.astype(np.float32)) / (paper - dark), 0, 1)
    solid = ink > 0.5
    # Rows/columns need two inked pixels, so specks of noise don't stretch the box. The crop is
    # padded above and below; the word is the block of rows with the most ink, so parts of
    # neighbouring lines (across a gap) fall away.
    blocks = _runs(solid.sum(axis=1) >= 2, merge=max(1, gray.shape[0] // 40))
    if not blocks:
        return None
    top, bottom = max(blocks, key=lambda run: ink[run[0] : run[1]].sum())
    if bottom - top < 3:
        return None
    ink, solid = ink[top:bottom], solid[top:bottom]
    height = ink.shape[0]
    # Column runs of ink; slivers of a neighbouring word at either end are dropped.
    runs = _runs(solid.sum(axis=0) >= 2)
    if not runs:
        return None
    gap = max(2, height * 0.12)
    while len(runs) > 1 and runs[0][1] - runs[0][0] < height * 0.3 and runs[1][0] - runs[0][1] >= gap:
        runs.pop(0)
    while len(runs) > 1 and runs[-1][1] - runs[-1][0] < height * 0.3 and runs[-1][0] - runs[-2][1] >= gap:
        runs.pop()
    if runs[-1][1] - runs[0][0] < 3:
        return None
    ink = ink[:, runs[0][0] : runs[-1][1]]
    rows = np.nonzero((ink > 0.5).sum(axis=1) >= 2)[0]
    return ink[rows[0] : rows[-1] + 1] if len(rows) >= 3 else None


def _fit(ink: np.ndarray, width: int) -> np.ndarray:
    image = Image.fromarray((ink * 255).astype(np.uint8)).resize((width, HEIGHT), Image.BILINEAR)
    return np.asarray(image.filter(ImageFilter.GaussianBlur(0.8)), dtype=np.float32) / 255


class _Renderer:
    def __init__(self):
        self.fonts: dict[tuple, Optional[ImageFont.FreeTypeFont]] = {}
        self.words: dict[tuple, Optional[np.ndarray]] = {}

    def _font(self, variant: Variant) -> Optional[ImageFont.FreeTypeFont]:
        if variant.key not in self.fonts:
            font = None
            try:
                font = ImageFont.truetype(variant.face.path, RENDER_PX, index=variant.face.index)
                if variant.weight is not None:
                    axes = font.get_variation_axes()
                    font.set_variation_by_axes(
                        [variant.weight if axis.get("name") in (b"Weight", "Weight") else axis["default"] for axis in axes]
                    )
            except Exception as exc:
                logger.debug("Can't render with %s: %s", variant.face.path, exc)
                font = None
            self.fonts[variant.key] = font
        return self.fonts[variant.key]

    def word(self, variant: Variant, text: str) -> Optional[np.ndarray]:
        key = (variant.key, text)
        if key not in self.words:
            ink = None
            font = self._font(variant)
            if font is not None and variant.face.covers(text):
                try:
                    left, top, right, bottom = font.getbbox(text)
                    image = Image.new("L", (right - left + 8, bottom - top + 8), 0)
                    ImageDraw.Draw(image).text((4 - left, 4 - top), text, font=font, fill=255)
                    ink = _ink(255 - np.asarray(image))
                except Exception as exc:  # FreeType chokes on some system fonts
                    logger.debug("Can't render %r with %s: %s", text, variant.face.path, exc)
            self.words[key] = ink
        return self.words[key]


def _similarity(scan: np.ndarray, rendered: Optional[np.ndarray]) -> float:
    if rendered is None:
        return 0.0
    scan_aspect = scan.shape[1] / scan.shape[0]
    aspect = rendered.shape[1] / rendered.shape[0]
    width = int(min(max(round(HEIGHT * scan_aspect), 4), 600))
    a, b = _fit(scan, width), _fit(rendered, width)
    shape = 1 - np.abs(a - b).sum() / max(a.sum() + b.sum(), 1e-6)
    return float(shape * math.exp(-2.5 * abs(math.log(aspect / scan_aspect))))


def _variants(library: FontLibrary, family: str) -> list[Variant]:
    """Regular, bold, italic and bold italic of a family: for each, the face nearest 400/700."""
    found: dict[tuple, tuple[float, Variant]] = {}

    def offer(bold: bool, italic: bool, distance: float, variant: Variant) -> None:
        if (bold, italic) not in found or distance < found[(bold, italic)][0]:
            found[(bold, italic)] = (distance, variant)

    for face in library.faces(family):
        if face.weight_axis:
            low, high = face.weight_axis
            for bold, weight in ((False, 400), (True, 700)):
                if low <= weight <= high:
                    offer(bold, face.italic, 0, Variant(face, bold, face.italic, float(weight)))
        else:
            offer(face.bold, face.italic, abs(face.weight - (700 if face.bold else 400)), Variant(face, face.bold, face.italic))
    return [variant for _, variant in found.values()]


def detect(page: pymupdf.Page, lines: list[list[tuple[str, pymupdf.Rect]]], library: FontLibrary) -> list[Optional[Detection]]:
    """For each line (its words and their boxes in displayed page coordinates), the font it
    looks set in, or None when no font matches well enough."""
    longest = max(page.rect.width, page.rect.height, 1)
    zoom = min(SCAN_DPI / 72, SCAN_MAX_PIXELS / longest)
    pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), colorspace=pymupdf.csGRAY, alpha=False)
    gray = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.stride)[:, : pix.width]

    # The scan's words: (line index, text, ink image).
    words: list[tuple[int, str, np.ndarray]] = []
    for line_no, line in enumerate(lines):
        # Latin words only: the candidates are Latin fonts (Hindi lines keep the Devanagari default).
        usable = [
            (t, r)
            for t, r in line
            if sum(ch.isalnum() for ch in t) >= 3 and len(t.strip()) <= 40 and all(ord(ch) < 0x250 for ch in t)
        ]
        for raw_text, rect in usable[:MAX_WORDS_PER_LINE]:
            # OCR boxes include surrounding spaces, with the width split evenly over the characters.
            # A space is narrower than an average letter, so trim less than a share; _ink drops
            # what's left of a neighbouring word.
            text = raw_text.strip()
            per_char = 0.4 * rect.width / max(len(raw_text), 1)
            lead = len(raw_text) - len(raw_text.lstrip())
            trail = len(raw_text) - len(raw_text.rstrip())
            # Line boxes can clip ascenders and descenders, so take more height and let _ink trim.
            pad = rect.height * 0.35
            box = pymupdf.Rect(rect.x0 + lead * per_char, rect.y0 - pad, rect.x1 - trail * per_char, rect.y1 + pad) * zoom
            region = gray[max(0, int(box.y0)) : int(math.ceil(box.y1)), max(0, int(box.x0)) : int(math.ceil(box.x1))]
            ink = _ink(region)
            if ink is not None and ink.shape[0] >= 6:
                words.append((line_no, text, ink))
    if not words:
        return [None] * len(lines)

    renderer = _Renderer()
    families = sorted(
        {faces[0].family for faces in library.families.values() if faces[0].latin and faces[0].category in ("sans", "serif", "mono")}
    )

    # 1. Rank families by their regular or bold style (whichever fits) on a sample with a word
    # from every line, so a heading in another font still gets its family shortlisted.
    first_of_line = {line_no: i for i, (line_no, _, _) in reversed(list(enumerate(words)))}
    step = max(1, len(words) // SAMPLE_WORDS)
    picked = sorted(set(first_of_line.values()) | set(range(0, len(words), step)))[:MAX_SAMPLE]
    sample = [words[i] for i in picked]
    fit = np.zeros((len(families), len(sample)))
    for row, family in enumerate(families):
        for variant in _variants(library, family):
            if not variant.italic:
                fit[row] = np.maximum(fit[row], [_similarity(ink, renderer.word(variant, text)) for _, text, ink in sample])
    shortlist = [families[i] for i in np.argsort(-fit.mean(axis=1))[:SHORTLIST]]
    for line_no in {line_no for line_no, _, _ in sample}:
        columns = [col for col, (n, _, _) in enumerate(sample) if n == line_no]
        for i in np.argsort(-fit[:, columns].mean(axis=1))[:2]:
            if families[i] not in shortlist:
                shortlist.append(families[i])

    # 2. Score every style of the shortlisted families on every word.
    variants = [v for family in shortlist for v in _variants(library, family)]
    if not variants:
        return [None] * len(lines)
    scores = np.array([[_similarity(ink, renderer.word(v, text)) for v in variants] for _, text, ink in words])
    page_mean = scores.mean(axis=0)
    by_line: dict[int, list[int]] = {}
    for index, (line_no, _, _) in enumerate(words):
        by_line.setdefault(line_no, []).append(index)

    # Look-alikes (Arial, Helvetica, Arimo...) score within a hair of each other. Among those,
    # prefer the page's font so its lines agree, then the family people actually use.
    def pick(values: np.ndarray, page_family: str = "") -> int:
        close = [i for i in range(len(variants)) if values[i] >= values.max() - TIE]
        return max(close, key=lambda i: (variants[i].face.family == page_family, variants[i].face.family in COMMON, values[i]))

    page_family = variants[pick(page_mean)].face.family
    results: list[Optional[Detection]] = []
    for line_no in range(len(lines)):
        rows = by_line.get(line_no, [])
        blended = (scores[rows].sum(axis=0) + PAGE_PRIOR * page_mean) / (len(rows) + PAGE_PRIOR)
        best = pick(blended, page_family)
        variant, score = variants[best], float(blended[best])
        results.append(Detection(variant.face, variant.bold, variant.italic, score) if score >= MIN_SCORE else None)
    logger.info(
        "Font detection: %d words, best %s (%.2f)",
        len(words),
        page_family,
        float(page_mean.max()),
    )
    return results
