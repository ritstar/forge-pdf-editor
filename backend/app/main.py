from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from threading import BoundedSemaphore, Lock, Thread
from typing import Optional

import pikepdf
import pymupdf
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from openpyxl import Workbook
from openpyxl.utils import get_column_letter
from pydantic import BaseModel
from starlette.background import BackgroundTask
from starlette.exceptions import HTTPException as StarletteHTTPException
from weasyprint import HTML
from weasyprint.urls import URLFetcher
from docx import Document
from docx.shared import Pt
from pptx import Presentation
from pptx.util import Emu

from . import font_library, text_edit


APP_TITLE = "Forge PDF Tools API"
APP_VERSION = "0.5.0"
API_KEY_HEADER = "x-api-key"
TOKEN_HEADER = "x-forge-token"
API_KEY_ENV = "PDF_TOOLS_API_SECRET"
MAX_HTML_INPUT_BYTES = 200_000
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(50 * 1024 * 1024)))
RATE_LIMIT_MAX_REQUESTS = 20
RATE_LIMIT_WINDOW_SECONDS = 60
SUBPROCESS_TIMEOUT_SECONDS = int(os.getenv("SUBPROCESS_TIMEOUT_SECONDS", "100"))
# LibreOffice and Ghostscript are memory hungry; cap concurrent runs so a burst of requests
# cannot OOM a small instance.
_heavy_jobs = BoundedSemaphore(int(os.getenv("MAX_CONCURRENT_CONVERSIONS", "2")))

PDF_TOOLS = {
    "compress-pdf",
    "pdf-to-word",
    "pdf-to-powerpoint",
    "pdf-to-excel",
    "unlock-pdf",
    "protect-pdf",
    "pdf-to-pdfa",
    "repair-pdf",
    "text-layout",
    "edit-text",
}
OFFICE_TOOLS = {
    "word-to-pdf": {".doc", ".docx", ".odt", ".rtf", ".txt"},
    "powerpoint-to-pdf": {".ppt", ".pptx", ".odp"},
    "excel-to-pdf": {".xls", ".xlsx", ".ods", ".csv"},
}
ALL_TOOLS = PDF_TOOLS | set(OFFICE_TOOLS) | {"html-to-pdf"}

# Ghostscript presets: image downsampling targets of 72 / 150 / 300 dpi.
GS_PRESETS = {"low": "screen", "medium": "ebook", "high": "printer"}

logger = logging.getLogger(__name__)
_rate_limit_lock = Lock()
_rate_limit_state: dict[str, list[float]] = {}


def _allowed_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "http://localhost:3000")
    return [x.strip() for x in raw.split(",") if x.strip()]


def _expected_api_key() -> str:
    value = os.getenv(API_KEY_ENV, "").strip()
    if not value:
        logger.error("Missing required server env for backend API authentication.")
        raise HTTPException(status_code=500, detail="Server misconfiguration.")
    return value


def _b64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _verify_tool_token(token: str, tool_id: str, secret: str) -> Optional[str]:
    """Validates tokens minted by app/api/pdf-tools/[toolId]/route.js. Returns the user id."""
    try:
        payload_part, signature_part = token.split(".", 1)
        expected = hmac.new(secret.encode(), payload_part.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _b64url_decode(signature_part)):
            return None
        payload = json.loads(_b64url_decode(payload_part))
    except (ValueError, TypeError, json.JSONDecodeError):
        return None

    if payload.get("tool") != tool_id or float(payload.get("exp", 0)) < time.time():
        return None
    uid = payload.get("uid")
    return str(uid) if uid else None


def _authenticate(request: Request, tool_id: str) -> str:
    """Returns a rate-limit identity for the caller or raises 401."""
    expected = _expected_api_key()

    provided_key = request.headers.get(API_KEY_HEADER, "")
    if provided_key and secrets.compare_digest(provided_key.encode(), expected.encode()):
        # Trusted server-to-server call from the Next.js proxy, which forwards the end user.
        user = request.headers.get("x-forge-user")
        if user:
            return f"user:{user}"
        return f"ip:{request.headers.get('x-forge-client-ip') or _client_ip(request)}"

    token = request.headers.get(TOKEN_HEADER, "")
    uid = _verify_tool_token(token, tool_id, expected) if token else None
    if uid:
        return f"user:{uid}"

    raise HTTPException(status_code=401, detail="Unauthorized")


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.headers.get("x-real-ip") or (request.client.host if request.client else "unknown")


def _enforce_rate_limit(identity: str) -> None:
    current = time.monotonic()

    with _rate_limit_lock:
        # Drop idle identities so the table does not grow without bound.
        if len(_rate_limit_state) > 5000:
            for key in [k for k, v in _rate_limit_state.items() if not v or current - v[-1] >= RATE_LIMIT_WINDOW_SECONDS]:
                del _rate_limit_state[key]

        history = [item for item in _rate_limit_state.get(identity, []) if current - item < RATE_LIMIT_WINDOW_SECONDS]
        if len(history) >= RATE_LIMIT_MAX_REQUESTS:
            _rate_limit_state[identity] = history
            raise HTTPException(status_code=429, detail="Too many requests.")

        history.append(current)
        _rate_limit_state[identity] = history


app = FastAPI(title=APP_TITLE, version=APP_VERSION)

# Index the installed fonts in the background so the first text edit doesn't wait for it.
Thread(target=font_library.library, daemon=True).start()

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
    # Browsers calling us directly need these to name the download and show savings.
    expose_headers=["content-disposition", "x-original-size", "x-output-size", "x-forge-warnings"],
    max_age=600,
)


class HealthResponse(BaseModel):
    status: str
    app: str
    version: str


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", app=APP_TITLE, version=APP_VERSION)


def _safe_stem(name: str, default: str = "output") -> str:
    stem = Path(name).stem or default
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", stem).strip("-.")
    return cleaned[:100] or default


def _temp_dir() -> Path:
    return Path(tempfile.mkdtemp(prefix="forge-tools-"))


def _save_upload(upload: UploadFile, target: Path) -> Path:
    if upload.size is not None and upload.size > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File is too large (50 MB max).")

    written = 0
    with target.open("wb") as f:
        while chunk := upload.file.read(1024 * 1024):
            written += len(chunk)
            if written > MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail="File is too large (50 MB max).")
            f.write(chunk)

    if written == 0:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    return target


def _as_download(path: Path, filename: str, tmpdir: Path, headers: Optional[dict] = None) -> FileResponse:
    return FileResponse(
        path,
        media_type="application/octet-stream",
        filename=filename,
        headers=headers,
        background=BackgroundTask(shutil.rmtree, tmpdir, ignore_errors=True),
    )


def _run(cmd: list[str], error_detail: str, **kwargs) -> subprocess.CompletedProcess:
    with _heavy_jobs:
        try:
            proc = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=SUBPROCESS_TIMEOUT_SECONDS,
                **kwargs,
            )
        except subprocess.TimeoutExpired as exc:
            logger.error("Command timed out: %s", cmd[0])
            raise HTTPException(status_code=504, detail="Processing took too long. Try a smaller file.") from exc
        except FileNotFoundError as exc:
            logger.error("Required binary missing: %s", cmd[0])
            raise HTTPException(status_code=500, detail=error_detail) from exc

    if proc.returncode != 0:
        logger.error("%s failed: %s", cmd[0], (proc.stderr or proc.stdout).strip()[-2000:])
        raise HTTPException(status_code=500, detail=error_detail)
    return proc


def _html_fetcher() -> URLFetcher:
    # Only inline data: URLs; never fetch files or the network while rendering user HTML.
    # A fresh fetcher per render because URLFetcher keeps per-request state.
    return URLFetcher(allowed_protocols={"data"}, allow_redirects=False, timeout=5)


def _open_pdf(input_path: Path) -> pymupdf.Document:
    try:
        doc = pymupdf.open(str(input_path))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="This file is not a valid PDF.") from exc
    if doc.needs_pass:
        doc.close()
        raise HTTPException(status_code=400, detail="This PDF is password protected. Unlock it first.")
    return doc


# pdf2docx reconstructs layout (columns, tables, images, fonts); very long documents use the
# lighter text-block conversion so a single request can't monopolise the worker.
PDF2DOCX_MAX_PAGES = int(os.getenv("PDF2DOCX_MAX_PAGES", "150"))


def _pdf_to_word(input_path: Path, output_path: Path, tmpdir: Path) -> None:
    with _open_pdf(input_path) as pdf:
        page_count = len(pdf)

    if page_count <= PDF2DOCX_MAX_PAGES:
        try:
            # Imported lazily: it pulls in OpenCV, which is only needed for this tool.
            from pdf2docx import Converter

            with _heavy_jobs:
                converter = Converter(str(input_path))
                try:
                    converter.convert(str(output_path), multi_processing=False)
                finally:
                    converter.close()
            if output_path.exists() and output_path.stat().st_size > 0:
                return
        except Exception:  # pragma: no cover - fall back to the simpler conversion
            logger.exception("pdf2docx failed; falling back to text-block conversion")

    _pdf_to_word_blocks(input_path, output_path, tmpdir)


def _pdf_to_word_blocks(input_path: Path, output_path: Path, tmpdir: Path) -> None:
    out = Document()
    style = out.styles["Normal"]
    style.font.size = Pt(11)

    with _open_pdf(input_path) as pdf:
        for index, page in enumerate(pdf):
            if index:
                out.add_page_break()

            # Text blocks in reading order give real paragraphs instead of one blob per page.
            blocks = [b for b in page.get_text("blocks", sort=True) if b[6] == 0 and b[4].strip()]
            if blocks:
                for block in blocks:
                    text = re.sub(r"(?<!\n)\n(?!\n)", " ", block[4].strip())
                    out.add_paragraph(text)
                continue

            # No text layer (scanned page): keep the content visible as an image.
            img_path = tmpdir / f"page-{index + 1}.png"
            page.get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5), alpha=False).save(str(img_path))
            section = out.sections[-1]
            usable = section.page_width - section.left_margin - section.right_margin
            out.add_picture(str(img_path), width=usable)

    out.save(str(output_path))


def _pdf_to_excel(input_path: Path, output_path: Path) -> None:
    wb = Workbook(write_only=True)
    found_tables = False

    with _open_pdf(input_path) as pdf:
        for page_index, page in enumerate(pdf, start=1):
            try:
                tables = page.find_tables().tables
            except Exception:  # pragma: no cover - table detection is best-effort
                tables = []

            for table_index, table in enumerate(tables, start=1):
                rows = table.extract()
                if not rows:
                    continue
                found_tables = True
                ws = wb.create_sheet(title=f"P{page_index} T{table_index}"[:31])
                widths: dict[int, int] = {}
                for row in rows:
                    cells = [(cell or "").strip() for cell in row]
                    for col, value in enumerate(cells, start=1):
                        widths[col] = max(widths.get(col, 8), min(len(value), 60))
                    ws.append(cells)
                for col, width in widths.items():
                    ws.column_dimensions[get_column_letter(col)].width = width + 2

        if not found_tables:
            # No ruled tables detected: fall back to one row per text line.
            ws = wb.create_sheet(title="PDF Text")
            ws.append(["page", "line", "text"])
            for page_index, page in enumerate(pdf, start=1):
                lines = [ln for ln in page.get_text("text", sort=True).splitlines() if ln.strip()]
                for line_index, line in enumerate(lines, start=1):
                    ws.append([page_index, line_index, line])

    wb.save(str(output_path))


def _pdf_to_powerpoint(input_path: Path, output_path: Path, tmpdir: Path) -> None:
    prs = Presentation()
    blank_layout = prs.slide_layouts[6]

    with _open_pdf(input_path) as pdf:
        if len(pdf):
            # Match the slide aspect ratio to the first page instead of stretching to 4:3.
            first = pdf[0].rect
            prs.slide_width = Emu(int(first.width * 12700))
            prs.slide_height = Emu(int(first.height * 12700))

        for i, page in enumerate(pdf):
            img_path = tmpdir / f"page-{i + 1}.png"
            page.get_pixmap(matrix=pymupdf.Matrix(2, 2), alpha=False).save(str(img_path))

            slide = prs.slides.add_slide(blank_layout)
            # Fit each page inside the slide, preserving its own aspect ratio.
            scale = min(prs.slide_width / page.rect.width, prs.slide_height / page.rect.height)
            width = int(page.rect.width * scale)
            height = int(page.rect.height * scale)
            left = int((prs.slide_width - width) / 2)
            top = int((prs.slide_height - height) / 2)
            slide.shapes.add_picture(str(img_path), left, top, width=width, height=height)

    prs.save(str(output_path))


def _libreoffice_convert(input_path: Path, output_ext: str, tmpdir: Path) -> Path:
    out_dir = tmpdir / "out"
    out_dir.mkdir()
    # A private profile per run: concurrent soffice processes sharing one profile fail or hang.
    profile = (tmpdir / "lo-profile").as_uri()
    _run(
        [
            "soffice",
            f"-env:UserInstallation={profile}",
            "--headless",
            "--norestore",
            "--convert-to",
            output_ext,
            "--outdir",
            str(out_dir),
            str(input_path),
        ],
        "Document conversion failed. Make sure the file is a valid document.",
    )

    out_path = out_dir / f"{input_path.stem}.{output_ext}"
    if not out_path.exists():
        raise HTTPException(status_code=500, detail="Converted output file not found.")
    return out_path


def _convert_to_pdfa(input_path: Path, output_path: Path) -> None:
    _run(
        [
            "gs",
            "-dPDFA=2",
            "-dBATCH",
            "-dNOPAUSE",
            "-dSAFER",
            "-dQUIET",
            "-dNOOUTERSAVE",
            "-sColorConversionStrategy=RGB",
            "-sProcessColorModel=DeviceRGB",
            "-sDEVICE=pdfwrite",
            "-dPDFACompatibilityPolicy=1",
            f"-sOutputFile={output_path}",
            str(input_path),
        ],
        "PDF/A conversion failed.",
    )


def _compress_lossless(input_path: Path, output_path: Path) -> None:
    with pikepdf.open(str(input_path)) as pdf:
        pdf.remove_unreferenced_resources()
        pdf.save(
            str(output_path),
            compress_streams=True,
            # Only re-encode lossless filters; decoding JPEGs would inflate them.
            stream_decode_level=pikepdf.StreamDecodeLevel.generalized,
            object_stream_mode=pikepdf.ObjectStreamMode.generate,
            recompress_flate=True,
        )


def _compress_ghostscript(input_path: Path, output_path: Path, preset: str) -> None:
    _run(
        [
            "gs",
            "-sDEVICE=pdfwrite",
            "-dCompatibilityLevel=1.6",
            f"-dPDFSETTINGS=/{preset}",
            "-dNOPAUSE",
            "-dBATCH",
            "-dSAFER",
            "-dQUIET",
            "-dDetectDuplicateImages=true",
            "-dCompressFonts=true",
            "-dSubsetFonts=true",
            f"-sOutputFile={output_path}",
            str(input_path),
        ],
        "Compression failed.",
    )


def _compress_pdf(input_path: Path, tmpdir: Path, level: str) -> Path:
    """Returns the smallest of: Ghostscript re-encode, lossless optimisation, the original."""
    candidates = [input_path]

    lossless = tmpdir / "lossless.pdf"
    try:
        _compress_lossless(input_path, lossless)
        candidates.append(lossless)
    except pikepdf.PasswordError as exc:
        raise HTTPException(status_code=400, detail="This PDF is password protected. Unlock it first.") from exc
    except pikepdf.PdfError as exc:
        raise HTTPException(status_code=400, detail="This file is not a valid PDF.") from exc

    if shutil.which("gs"):
        lossy = tmpdir / "lossy.pdf"
        try:
            _compress_ghostscript(input_path, lossy, GS_PRESETS.get(level, "ebook"))
            if lossy.exists() and lossy.stat().st_size > 0:
                candidates.append(lossy)
        except HTTPException:
            logger.warning("Ghostscript compression failed; using lossless result.")
    else:
        logger.warning("Ghostscript not installed; only lossless compression is available.")

    return min(candidates, key=lambda p: p.stat().st_size)


@app.post("/tools/{tool_id}")
def run_tool(
    request: Request,
    tool_id: str,
    file: Optional[UploadFile] = File(default=None),
    password: str = Form(default=""),
    owner_password: str = Form(default=""),
    compression_level: str = Form(default="medium"),
    html_content: str = Form(default=""),
    page: int = Form(default=0),
    edits: str = Form(default=""),
):
    # Plain `def`: FastAPI runs it in a worker thread, so the CPU-bound and subprocess work
    # below does not block the event loop for every other request.
    identity = _authenticate(request, tool_id)
    if tool_id not in ALL_TOOLS:
        raise HTTPException(status_code=404, detail="Unknown tool ID.")
    _enforce_rate_limit(identity)
    tmpdir = _temp_dir()

    try:
        if tool_id == "html-to-pdf":
            if file is None and not html_content.strip():
                raise HTTPException(status_code=400, detail="Provide either an HTML file or html_content.")

            if file is not None:
                raw = file.file.read(MAX_HTML_INPUT_BYTES + 1)
                html_text = raw.decode("utf-8", errors="replace")
                base_name = _safe_stem(file.filename or "html")
            else:
                raw = html_content.encode("utf-8")
                html_text = html_content
                base_name = "html"

            if len(raw) > MAX_HTML_INPUT_BYTES:
                raise HTTPException(status_code=400, detail="HTML input is too large.")

            output_path = tmpdir / f"{base_name}.pdf"
            HTML(string=html_text, url_fetcher=_html_fetcher()).write_pdf(str(output_path))
            return _as_download(output_path, output_path.name, tmpdir)

        if file is None:
            raise HTTPException(status_code=400, detail="A file is required for this tool.")

        original_name = file.filename or "input"
        stem = _safe_stem(original_name)
        suffix = Path(original_name).suffix.lower()

        # Never use the client-supplied name as a path: it may contain "../" or be absolute.
        if tool_id in OFFICE_TOOLS:
            if suffix not in OFFICE_TOOLS[tool_id]:
                allowed = ", ".join(sorted(OFFICE_TOOLS[tool_id]))
                raise HTTPException(status_code=400, detail=f"Unsupported file type. Allowed: {allowed}")
            input_path = tmpdir / f"input{suffix}"
        else:
            input_path = tmpdir / "input.pdf"
        _save_upload(file, input_path)

        if tool_id in PDF_TOOLS and tool_id != "repair-pdf":
            with input_path.open("rb") as f:
                if b"%PDF" not in f.read(1024):
                    raise HTTPException(status_code=400, detail="This file is not a valid PDF.")

        if tool_id == "compress-pdf":
            original_size = input_path.stat().st_size
            best = _compress_pdf(input_path, tmpdir, compression_level)
            output_path = tmpdir / f"{stem}_compressed.pdf"
            shutil.copyfile(best, output_path)
            headers = {
                "x-original-size": str(original_size),
                "x-output-size": str(output_path.stat().st_size),
            }
            return _as_download(output_path, output_path.name, tmpdir, headers)

        if tool_id == "pdf-to-word":
            output_path = tmpdir / f"{stem}.docx"
            _pdf_to_word(input_path, output_path, tmpdir)
            return _as_download(output_path, output_path.name, tmpdir)

        if tool_id == "pdf-to-powerpoint":
            output_path = tmpdir / f"{stem}.pptx"
            _pdf_to_powerpoint(input_path, output_path, tmpdir)
            return _as_download(output_path, output_path.name, tmpdir)

        if tool_id == "pdf-to-excel":
            output_path = tmpdir / f"{stem}.xlsx"
            _pdf_to_excel(input_path, output_path)
            return _as_download(output_path, output_path.name, tmpdir)

        if tool_id in OFFICE_TOOLS:
            converted = _libreoffice_convert(input_path, "pdf", tmpdir)
            output_path = tmpdir / f"{stem}.pdf"
            converted.replace(output_path)
            return _as_download(output_path, output_path.name, tmpdir)

        if tool_id == "unlock-pdf":
            output_path = tmpdir / f"{stem}_unlocked.pdf"
            try:
                with pikepdf.open(str(input_path), password=password) as pdf:
                    pdf.save(str(output_path))
            except pikepdf.PasswordError as exc:
                detail = "Incorrect password." if password else "This PDF needs a password to unlock."
                raise HTTPException(status_code=400, detail=detail) from exc
            return _as_download(output_path, output_path.name, tmpdir)

        if tool_id == "protect-pdf":
            if not password:
                raise HTTPException(status_code=400, detail="Password is required to protect a PDF.")

            output_path = tmpdir / f"{stem}_protected.pdf"
            try:
                with pikepdf.open(str(input_path)) as pdf:
                    # AES-256 (R6). Keeps bookmarks, links, forms and metadata intact.
                    pdf.save(
                        str(output_path),
                        encryption=pikepdf.Encryption(
                            user=password,
                            owner=owner_password or password,
                            R=6,
                            allow=pikepdf.Permissions(),
                        ),
                    )
            except pikepdf.PasswordError as exc:
                raise HTTPException(status_code=400, detail="This PDF is already password protected.") from exc
            return _as_download(output_path, output_path.name, tmpdir)

        if tool_id == "text-layout":
            # The editor uploads one page at a time; OCR only runs for pages without text.
            with _open_pdf(input_path) as doc:
                if not 0 <= page < len(doc):
                    raise HTTPException(status_code=400, detail="Page out of range.")
                with _heavy_jobs:
                    layout = text_edit.analyze_page(doc, page)
            shutil.rmtree(tmpdir, ignore_errors=True)
            return JSONResponse(layout, headers={"cache-control": "no-store"})

        if tool_id == "edit-text":
            try:
                raw_edits = json.loads(edits or "[]")
            except json.JSONDecodeError as exc:
                raise HTTPException(status_code=400, detail="Invalid text edits.") from exc
            output_path = tmpdir / f"{stem}_edited.pdf"
            with _open_pdf(input_path) as doc:
                try:
                    cleaned = text_edit.clean_edits(raw_edits, len(doc))
                except (TypeError, ValueError) as exc:
                    raise HTTPException(status_code=400, detail="Invalid text edits.") from exc
                with _heavy_jobs:
                    warnings = text_edit.apply_edits(doc, cleaned)
                    # No subset_fonts(): it would rewrite the document's original fonts too.
                    doc.save(str(output_path), garbage=3, deflate=True)
            headers = {"x-forge-warnings": json.dumps(warnings)} if warnings else None
            return _as_download(output_path, output_path.name, tmpdir, headers)

        if tool_id == "pdf-to-pdfa":
            output_path = tmpdir / f"{stem}_pdfa.pdf"
            _convert_to_pdfa(input_path, output_path)
            return _as_download(output_path, output_path.name, tmpdir)

        if tool_id == "repair-pdf":
            output_path = tmpdir / f"{stem}_repaired.pdf"
            try:
                with pikepdf.open(str(input_path), attempt_recovery=True) as pdf:
                    pdf.save(str(output_path))
            except pikepdf.PasswordError as exc:
                raise HTTPException(status_code=400, detail="This PDF is password protected. Unlock it first.") from exc
            except pikepdf.PdfError:
                # qpdf could not recover it; let MuPDF try its own reconstruction.
                with pymupdf.open(str(input_path)) as doc:
                    doc.save(str(output_path), garbage=3, deflate=True)
            return _as_download(output_path, output_path.name, tmpdir)

        raise HTTPException(status_code=404, detail="Unknown tool ID.")

    except HTTPException:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise
    except Exception as exc:  # pragma: no cover
        logger.exception("Unexpected tool processing error for tool_id=%s", tool_id)
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise HTTPException(status_code=500, detail="Failed to process file.") from exc


@app.exception_handler(StarletteHTTPException)
async def http_exc_handler(_, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


@app.exception_handler(RequestValidationError)
async def validation_exc_handler(_, exc: RequestValidationError):
    return JSONResponse(status_code=400, content={"error": "Invalid request."})
