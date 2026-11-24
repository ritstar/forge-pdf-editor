"""True redaction: finds sensitive text and permanently removes whatever lies under the marked
areas (text, image pixels, vector art, links and form fields), not just a black box on top.

Coordinates exchanged with the browser are "visual", like the editor: origin at the top-left
of the displayed (rotated) page, normalized to 0..1 of its width and height.
"""

from __future__ import annotations

import logging
import math
import re
from typing import Optional

import pymupdf

from . import ocr

logger = logging.getLogger(__name__)

MAX_BOXES = 2000
MAX_MATCHES = 2000
MAX_QUERY_CHARS = 200
# OCR is slow (especially on small instances); searching scans is capped so one request can't
# run for many minutes. Search only needs legible words, so a lower resolution is enough.
MAX_OCR_SEARCH_PAGES = 20
OCR_SEARCH_DPI = 200

PATTERNS = {
    "email": r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}",
    # International and national formats: +1 (555) 010-9999, 020 7946 0958, +91 98765 43210.
    "phone": r"(?<![\w+])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{1,4}\)[\s.-]?)?\d{2,4}(?:[\s.-]?\d{2,4}){1,4}(?!\w)",
    "card": r"(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)",
    "ssn": r"(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)",
    "iban": r"\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b",
    "url": r"\bhttps?://[^\s<>\"']+|\bwww\.[^\s<>\"']+",
    "date": r"\b(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2})\b",
}


def _luhn(digits: str) -> bool:
    total, parity = 0, len(digits) % 2
    for i, ch in enumerate(digits):
        n = int(ch)
        if i % 2 == parity:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return total % 10 == 0


def _accept(kind: str, text: str) -> bool:
    digits = re.sub(r"\D", "", text)
    if kind == "card":
        return 13 <= len(digits) <= 19 and _luhn(digits)
    if kind == "phone":
        # Plain years and short numbers are not phone numbers.
        return 7 <= len(digits) <= 15
    return True


def build_searches(query: str, patterns: list[str], match_case: bool, whole_word: bool) -> list[tuple[str, re.Pattern]]:
    searches: list[tuple[str, re.Pattern]] = []
    query = (query or "").strip()[:MAX_QUERY_CHARS]
    if query:
        # Each term on its own line or separated by commas is searched separately.
        for term in [t.strip() for t in re.split(r"[\n,]", query) if t.strip()][:20]:
            body = r"\s+".join(re.escape(part) for part in term.split())
            if whole_word:
                body = rf"(?<!\w){body}(?!\w)"
            searches.append(("text", re.compile(body, 0 if match_case else re.IGNORECASE)))
    for kind in patterns:
        if kind in PATTERNS:
            searches.append((kind, re.compile(PATTERNS[kind])))
    return searches


RAW_FLAGS = pymupdf.TEXTFLAGS_RAWDICT & ~pymupdf.TEXT_PRESERVE_IMAGES


def _page_chars(raw: dict) -> tuple[str, list]:
    """The page text and, per character, its box and line number (None for line breaks)."""
    text: list[str] = []
    boxes: list = []
    line_no = 0
    for block in raw.get("blocks", ()):
        for line in block.get("lines", ()):
            previous = None
            for span in line.get("spans", ()):
                for char in span.get("chars", ()):
                    # OCR output has one span per word without the space between them.
                    if previous is not None and char["bbox"][0] - previous[2] > span["size"] * 0.15 and text and not text[-1].isspace() and not char["c"].isspace():
                        text.append(" ")
                        boxes.append(None)
                    text.append(char["c"])
                    boxes.append((char["bbox"], line_no))
                    previous = char["bbox"]
            text.append("\n")
            boxes.append(None)
            line_no += 1
    return "".join(text), boxes


def _visual(page: pymupdf.Page, rect: pymupdf.Rect) -> dict:
    box = rect * page.rotation_matrix
    width, height = page.rect.width or 1, page.rect.height or 1
    return {
        "x": max(0.0, box.x0 / width),
        "y": max(0.0, box.y0 / height),
        "width": min(1.0, box.width / width),
        "height": min(1.0, box.height / height),
    }


def find_matches(
    doc: pymupdf.Document,
    searches: list[tuple[str, re.Pattern]],
    *,
    ocr_languages: str = "",
    tessdata: Optional[str] = None,
) -> dict:
    matches: list[dict] = []
    scanned: list[int] = []
    ocr_pages = 0
    for page in doc:
        if len(page.get_text("text").strip()) >= 3:
            raw = page.get_text("rawdict", flags=RAW_FLAGS)
        elif tessdata and ocr_languages and ocr_pages < MAX_OCR_SEARCH_PAGES:
            # A scan: search what OCR reads (mapped into page coordinates on any rotation).
            raw = ocr.ocr_rawdict(page, ocr_languages, OCR_SEARCH_DPI, tessdata, RAW_FLAGS)
            ocr_pages += 1
        else:
            scanned.append(page.number + 1)
            continue
        text, boxes = _page_chars(raw)
        for kind, pattern in searches:
            for found in pattern.finditer(text):
                if found.end() <= found.start() or not _accept(kind, found.group()):
                    continue
                # One rectangle per line the match touches.
                per_line: dict[int, pymupdf.Rect] = {}
                for entry in boxes[found.start():found.end()]:
                    if entry is None:
                        continue
                    bbox, line_no = entry
                    rect = pymupdf.Rect(bbox)
                    if line_no in per_line:
                        per_line[line_no] |= rect
                    else:
                        per_line[line_no] = rect
                for rect in per_line.values():
                    if rect.is_empty:
                        continue
                    matches.append({"page": page.number, "kind": kind, "text": found.group().strip()[:120], **_visual(page, rect)})
                    if len(matches) >= MAX_MATCHES:
                        return {"matches": matches, "scannedPages": scanned, "truncated": True}
    return {"matches": matches, "scannedPages": scanned, "truncated": False}


def clean_boxes(raw: object, page_count: int) -> list[dict]:
    if not isinstance(raw, list) or len(raw) > MAX_BOXES:
        raise ValueError("Invalid redactions.")

    def num(value) -> float:
        number = float(value)
        if not math.isfinite(number):
            raise ValueError("Invalid number.")
        return min(max(number, 0.0), 1.0)

    boxes = []
    for item in raw:
        if not isinstance(item, dict):
            raise ValueError("Invalid redaction.")
        page = int(item.get("page", -1))
        if not 0 <= page < page_count:
            raise ValueError("Invalid redaction page.")
        x, y = num(item.get("x", 0)), num(item.get("y", 0))
        width, height = num(item.get("width", 0)), num(item.get("height", 0))
        if width <= 0 or height <= 0:
            continue
        boxes.append({"page": page, "x": x, "y": y, "width": min(width, 1 - x), "height": min(height, 1 - y)})
    return boxes


def apply_redactions(doc: pymupdf.Document, boxes: list[dict], *, fill=(0, 0, 0)) -> int:
    """Permanently removes everything under the boxes. Returns the number of areas redacted."""
    by_page: dict[int, list[dict]] = {}
    for box in boxes:
        by_page.setdefault(box["page"], []).append(box)

    count = 0
    for number, items in sorted(by_page.items()):
        page = doc[number]
        width, height = page.rect.width, page.rect.height
        unrotate = page.derotation_matrix
        areas = []
        for box in items:
            visual = pymupdf.Rect(
                box["x"] * width,
                box["y"] * height,
                (box["x"] + box["width"]) * width,
                (box["y"] + box["height"]) * height,
            )
            area = visual * unrotate
            areas.append(area)
            page.add_redact_annot(area, fill=fill, cross_out=False)
            count += 1

        # Links and form fields under a redaction would still carry the hidden information.
        for link in page.get_links():
            if any(pymupdf.Rect(link["from"]).intersects(area) for area in areas):
                page.delete_link(link)
        for widget in list(page.widgets() or ()):
            if any(widget.rect.intersects(area) for area in areas):
                page.delete_widget(widget)
        for annot in list(page.annots() or ()):
            if annot.type[0] != pymupdf.PDF_ANNOT_REDACT and any(annot.rect.intersects(area) for area in areas):
                page.delete_annot(annot)

        page.apply_redactions(
            images=pymupdf.PDF_REDACT_IMAGE_PIXELS,
            graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED,
            text=pymupdf.PDF_REDACT_TEXT_REMOVE,
        )
    return count


def scrub_metadata(doc: pymupdf.Document) -> None:
    """Removes author, title, producer, dates and the XMP packet."""
    try:
        doc.set_metadata({})
        doc.del_xml_metadata()
    except Exception:  # pragma: no cover - metadata removal is best-effort
        logger.exception("Could not remove metadata")
