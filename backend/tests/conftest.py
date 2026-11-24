import os
import sys
from pathlib import Path

import pymupdf
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("PDF_TOOLS_API_SECRET", "test-secret")


def _tessdata():
    from app import text_edit

    return text_edit.tessdata_dir()


requires_ocr = pytest.mark.skipif(not _tessdata(), reason="Tesseract language data not installed (set TESSDATA_PREFIX)")


def text_page(doc: pymupdf.Document, lines: list[str], *, width=595, height=842) -> pymupdf.Page:
    page = doc.new_page(width=width, height=height)
    for i, line in enumerate(lines):
        page.insert_text((72, 120 + i * 40), line, fontsize=18)
    return page


def scanned_pdf(lines: list[str], *, turn: int = 0, stored_rotation: int = 0) -> pymupdf.Document:
    """An image-only page showing ``lines``; ``turn`` rotates the picture on the page (a
    sideways scan), ``stored_rotation`` sets /Rotate with the picture counter-turned so the
    page still displays upright."""
    with pymupdf.open() as src:
        pixmap = text_page(src, lines).get_pixmap(dpi=200)
    doc = pymupdf.open()
    if stored_rotation in (90, 270):
        page = doc.new_page(width=842, height=595)
    else:
        page = doc.new_page(width=595, height=842)
    page.insert_image(page.rect, pixmap=pixmap, rotate=(turn + stored_rotation) % 360)
    if stored_rotation:
        page.set_rotation(stored_rotation)
    return pymupdf.open("pdf", doc.tobytes())
