import io
import json

import pikepdf
import pymupdf
import pytest
from fastapi.testclient import TestClient

from app.main import app

from .conftest import requires_ocr, scanned_pdf, text_page

HEADERS = {"x-api-key": "test-secret", "x-forge-user": "tester"}
client = TestClient(app)


def _pdf_bytes(lines=("Hello secret world", "Second line stays")):
    doc = pymupdf.open()
    text_page(doc, list(lines))
    return doc.tobytes()


def _post(tool, data=None, content=None):
    files = {"file": ("doc.pdf", content or _pdf_bytes(), "application/pdf")}
    return client.post(f"/tools/{tool}", headers=HEADERS, data=data or {}, files=files)


def test_requires_auth():
    res = client.post("/tools/compress-pdf", files={"file": ("a.pdf", _pdf_bytes(), "application/pdf")})
    assert res.status_code == 401


def test_find_then_redact_round_trip():
    found = _post("find-text", {"query": "secret"})
    assert found.status_code == 200
    matches = found.json()["matches"]
    assert len(matches) == 1

    res = _post("redact-pdf", {"redactions": json.dumps(matches), "scrub_metadata": "true"})
    assert res.status_code == 200
    assert res.headers["x-forge-redactions"] == "1"
    text = pymupdf.open("pdf", res.content)[0].get_text()
    assert "secret" not in text and "Second line stays" in text


def test_edit_text_accepts_redactions_without_edits():
    found = _post("find-text", {"query": "Second"}).json()["matches"]
    res = _post("edit-text", {"edits": "[]", "redactions": json.dumps(found)})
    assert res.status_code == 200
    assert "Second" not in pymupdf.open("pdf", res.content)[0].get_text()


def test_find_text_needs_a_query():
    assert _post("find-text", {}).status_code == 400


def test_redact_rejects_bad_boxes():
    assert _post("redact-pdf", {"redactions": "not json"}).status_code == 400
    assert _post("redact-pdf", {"redactions": json.dumps([{"page": 9, "x": 0, "y": 0, "width": 1, "height": 1}])}).status_code == 400


@pytest.mark.parametrize(
    "form, can_print, can_copy",
    [
        ({}, True, True),
        ({"allow_print": "false"}, False, True),
        ({"allow_copy": "false", "allow_modify": "false"}, True, False),
    ],
)
def test_protect_permissions(form, can_print, can_copy):
    res = _post("protect-pdf", {"password": "open-sesame", **form})
    assert res.status_code == 200
    with pikepdf.open(io.BytesIO(res.content), password="open-sesame") as pdf:
        allow = pdf.allow
        assert allow.print_highres == can_print
        assert allow.extract == can_copy
        # With restrictions, the open password must not be the owner password.
        assert pdf.owner_password_matched is (form == {})


@requires_ocr
def test_ocr_endpoint_reports_what_it_did():
    content = scanned_pdf(["Quarterly report for the board", "Revenue grew by twelve percent"]).tobytes()
    res = _post("ocr-pdf", {"languages": "eng"}, content=content)
    assert res.status_code == 200
    stats = json.loads(res.headers["x-forge-ocr"])
    assert stats["recognized"] == 1 and stats["languages"] == "eng"
    assert "Quarterly" in pymupdf.open("pdf", res.content)[0].get_text()
