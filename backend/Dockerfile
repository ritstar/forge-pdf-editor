FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libqpdf-dev \
    qpdf \
    ghostscript \
    libreoffice \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    shared-mime-info \
    fonts-dejavu-core \
    fonts-liberation \
    # Font library for text edits (app/font_library.py): look-alikes of Arial, Times, Courier
    # (croscore), Calibri (carlito), Cambria (caladea), the classic PostScript fonts (urw-base35),
    # Noto incl. Devanagari, and popular open families.
    fonts-croscore \
    fonts-crosextra-carlito \
    fonts-crosextra-caladea \
    fonts-urw-base35 \
    fonts-noto-core \
    fonts-noto-mono \
    fonts-roboto-unhinted \
    fonts-open-sans \
    fonts-lato \
    fonts-ebgaramond \
    fonts-adobe-sourcesans3 \
    tesseract-ocr-eng \
    tesseract-ocr-hin \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s "$(dirname "$(find /usr/share/tesseract-ocr -name eng.traineddata | head -n 1)")" /usr/share/tessdata

# PyMuPDF ships Tesseract itself and only needs the language data for OCR.
ENV TESSDATA_PREFIX=/usr/share/tessdata

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY app /app/app

RUN addgroup --system appgroup \
    && adduser --system --ingroup appgroup appuser \
    && chown -R appuser:appgroup /app

USER appuser

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
