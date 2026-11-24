import pymupdf
import pytest

from app import ocr, text_edit

from .conftest import requires_ocr, scanned_pdf, text_page

LINES = ["Invoice number 12345 for ACME Corp", "Contact: jane.doe@example.com +1 (555) 010-9999", "Total amount due is 420 dollars"]


def _ocr(doc, **kwargs):
    return ocr.ocr_document(doc, languages="eng", tessdata=text_edit.tessdata_dir(), dpi=300, **kwargs)


def test_parse_languages_keeps_installed_only(tmp_path):
    for code in ("eng", "hin", "deu"):
        (tmp_path / f"{code}.traineddata").write_bytes(b"x")
    assert ocr.parse_languages("deu+fra+eng", str(tmp_path), "eng") == "deu+eng"
    assert ocr.parse_languages("../etc+eng", str(tmp_path), "eng") == "eng"
    assert ocr.parse_languages("", str(tmp_path), "eng+hin") == "eng+hin"


def test_pages_with_text_are_left_alone():
    doc = pymupdf.open()
    text_page(doc, LINES)
    before = doc[0].read_contents()
    result = ocr.ocr_document(doc, languages="eng", tessdata="/nonexistent", dpi=300)
    assert result.skipped == 1 and result.recognized == 0
    assert doc[0].read_contents() == before


@requires_ocr
def test_scan_becomes_searchable_and_looks_the_same():
    doc = scanned_pdf(LINES)
    pixels_before = doc[0].get_pixmap(dpi=50).samples
    result = _ocr(doc)
    assert result.recognized == 1 and result.words > 10
    out = pymupdf.open("pdf", doc.tobytes(garbage=4, deflate=True))
    page = out[0]
    assert "jane.doe@example.com" in page.get_text()
    hits = page.search_for("ACME")
    assert hits, "recognised text should be searchable"
    # The invisible layer sits over the word in the picture (rendered at y≈106..124).
    assert 95 < hits[0].y0 < 130
    assert page.get_pixmap(dpi=50).samples == pixels_before


@requires_ocr
@pytest.mark.parametrize("rotation", [90, 180, 270])
def test_text_layer_lines_up_on_rotated_pages(rotation):
    doc = scanned_pdf(LINES, stored_rotation=rotation)
    _ocr(doc, auto_rotate=False)
    page = pymupdf.open("pdf", doc.tobytes())[0]
    words = {w[4]: pymupdf.Rect(w[:4]) * page.rotation_matrix for w in page.get_text("words")}
    assert "Invoice" in words
    box = words["Invoice"]
    # Runs left to right on the displayed page, near the top-left like in the picture.
    assert box.width > box.height
    assert 60 < box.x0 < 90 and 95 < box.y0 < 130


@requires_ocr
def test_upside_down_scan_is_turned_upright():
    doc = scanned_pdf(LINES, turn=180)
    result = _ocr(doc)
    assert result.rotated == [0]
    assert doc[0].rotation == 180
    assert "Invoice" in doc[0].get_text()


@requires_ocr
@pytest.mark.parametrize("rotation", [0, 90, 180, 270])
def test_editor_finds_scanned_lines_on_any_rotation(rotation):
    doc = scanned_pdf(LINES, stored_rotation=rotation)
    layout = text_edit.analyze_page(doc, 0)
    assert layout["source"] == "ocr"
    first = next(line for line in layout["lines"] if "Invoice" in line["text"])
    # Normalized to the displayed page: top-left area, wider than tall.
    assert first["x"] < 0.2 and first["y"] < 0.2 and first["width"] > first["height"]
