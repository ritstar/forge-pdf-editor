import pymupdf
import pytest

from app import redact

from .conftest import requires_ocr, scanned_pdf, text_page

LINES = [
    "Name: Jane Doe, email jane.doe@example.com",
    "Card 4111 1111 1111 1111 and 1234 5678 9012 3456",
    "Call +1 (555) 010-9999 before 2026",
]


def _doc(rotation=0):
    doc = pymupdf.open()
    text_page(doc, LINES)
    if rotation:
        doc[0].set_rotation(rotation)
    return pymupdf.open("pdf", doc.tobytes())


def _find(doc, query="", patterns=(), **kwargs):
    return redact.find_matches(doc, redact.build_searches(query, list(patterns), kwargs.get("match_case", False), kwargs.get("whole_word", False)))


def test_finds_plain_text_case_insensitively():
    found = _find(_doc(), "jane DOE")
    assert [m["text"] for m in found["matches"]] == ["Jane Doe"]
    match = found["matches"][0]
    assert 0 < match["x"] < 0.5 and 0 < match["y"] < 0.2 and match["width"] > 0.05


def test_whole_word_and_case_options():
    assert not _find(_doc(), "jane doe", match_case=True)["matches"]
    assert len(_find(_doc(), "Doe")["matches"]) == 2  # "Doe" and the "doe" in the email
    assert len(_find(_doc(), "Doe", whole_word=True)["matches"]) == 2  # "jane.doe@" still a word boundary
    assert not _find(_doc(), "Do", whole_word=True)["matches"]


def test_patterns_validate_matches():
    found = _find(_doc(), patterns=["email", "card", "phone"])
    kinds = {(m["kind"], m["text"]) for m in found["matches"]}
    assert ("email", "jane.doe@example.com") in kinds
    assert ("card", "4111 1111 1111 1111") in kinds
    # Fails the Luhn check, so it is not a card number.
    assert not any(text.startswith("1234 5678") for kind, text in kinds if kind == "card")
    assert any(kind == "phone" and "555" in text for kind, text in kinds)
    # A lone year is not a phone number.
    assert not any(kind == "phone" and text == "2026" for kind, text in kinds)


@pytest.mark.parametrize("rotation", [0, 90, 180, 270])
def test_redaction_removes_text_on_any_rotation(rotation):
    doc = _doc(rotation)
    match = next(m for m in _find(doc, "jane.doe@example.com")["matches"])
    assert redact.apply_redactions(doc, redact.clean_boxes([match], len(doc))) == 1
    out = pymupdf.open("pdf", doc.tobytes(garbage=4, deflate=True, clean=True))
    text = out[0].get_text()
    assert "jane.doe@example.com" not in text
    assert "Card 4111" in text, "text outside the box must stay"


def test_redaction_blanks_image_pixels_and_links():
    doc = pymupdf.open()
    page = doc.new_page()
    pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 100, 100), False)
    pix.set_rect(pix.irect, (255, 0, 0))
    page.insert_image(pymupdf.Rect(100, 100, 300, 300), pixmap=pix)
    page.insert_link({"kind": pymupdf.LINK_URI, "from": pymupdf.Rect(100, 100, 300, 150), "uri": "https://secret.example"})
    doc = pymupdf.open("pdf", doc.tobytes())
    box = {"page": 0, "x": 100 / 612, "y": 100 / 792, "width": 100 / 612, "height": 100 / 792}
    redact.apply_redactions(doc, redact.clean_boxes([box], 1))
    out = pymupdf.open("pdf", doc.tobytes(garbage=4, clean=True))
    assert not out[0].get_links()
    assert b"secret.example" not in out.tobytes()
    # Top-left quarter of the image is now black, the rest still red.
    rendered = out[0].get_pixmap(dpi=72)
    assert rendered.pixel(150, 150)[:3] == (0, 0, 0)
    assert rendered.pixel(250, 250)[:3] == (255, 0, 0)


def test_clean_boxes_rejects_bad_input():
    with pytest.raises(ValueError):
        redact.clean_boxes([{"page": 5, "x": 0, "y": 0, "width": 0.1, "height": 0.1}], 1)
    with pytest.raises(ValueError):
        redact.clean_boxes("nope", 1)
    assert redact.clean_boxes([{"page": 0, "x": 0.9, "y": 0.9, "width": 0.5, "height": 0.5}], 1)[0]["width"] == pytest.approx(0.1)


def test_scrub_metadata():
    doc = _doc()
    doc.set_metadata({"author": "Jane Doe", "title": "Secret plan"})
    redact.scrub_metadata(doc)
    out = pymupdf.open("pdf", doc.tobytes(garbage=4))
    assert not out.metadata.get("author") and not out.metadata.get("title")


@requires_ocr
def test_finds_text_on_scans_with_ocr():
    from app import text_edit

    tessdata = text_edit.tessdata_dir()
    for rotation in (0, 270):
        doc = scanned_pdf(["Invoice for jane.doe@example.com"], stored_rotation=rotation)
        searches = redact.build_searches("", ["email"], False, False)
        found = redact.find_matches(doc, searches, ocr_languages="eng", tessdata=tessdata)
        assert [m["text"] for m in found["matches"]] == ["jane.doe@example.com"], rotation
        match = found["matches"][0]
        # Displayed near the top-left of the page, wider than tall.
        assert match["y"] < 0.25 and match["width"] > match["height"]
        assert redact.apply_redactions(doc, redact.clean_boxes(found["matches"], 1)) == 1
