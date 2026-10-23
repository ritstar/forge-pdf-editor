<div align="center">

<img src="public/forge-mark.svg" width="72" height="72" alt="Forge PDF logo" />

# Forge PDF

**The PDF toolkit that just works.**
Edit, sign, convert, compress and organize PDFs — right in your browser.

[**Live app →**](https://forge-pdf-editor.vercel.app) &nbsp;·&nbsp; [Features](#-features) &nbsp;·&nbsp; [Architecture](#-architecture) &nbsp;·&nbsp; [Quick start](#-quick-start) &nbsp;·&nbsp; [Deployment](#-deployment)

![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.156-009688?logo=fastapi&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-Auth%20%2B%20Firestore-FFCA28?logo=firebase&logoColor=black)
![Vercel](https://img.shields.io/badge/Frontend-Vercel-000000?logo=vercel&logoColor=white)
![Render](https://img.shields.io/badge/Backend-Render-46E3B7?logo=render&logoColor=black)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)

<br />

<img src="docs/screenshots/landing.png" alt="Forge PDF landing page" width="900" />

</div>

---

## ✨ Highlights

- **21 tools, one workspace** — organize, optimize, convert, edit & sign, and secure PDFs.
- **Private by default** — merge, split, organize, rotate, watermark, page numbers and image conversion run **entirely in your browser**. Those files never leave your device.
- **A real editor** — rewrite the text already in a PDF (scans too, via OCR) in a matching font, add text, images and reusable signatures, fill PDF forms, undo/redo, autosaved drafts, page thumbnails, touch support.
- **Speaks every script** — exports embed subset Noto fonts on demand, so `₹`, `Привет`, `café` and `नमस्ते` come out as real, searchable text.
- **Pro-grade engines** — Ghostscript compression that never makes files bigger, layout-preserving PDF → Word (pdf2docx), table extraction to Excel, LibreOffice Office conversion, AES-256 encryption.
- **Polished UI** — a cohesive design system with light & dark themes, responsive down to phones.
- **Cold-start aware** — the free-tier backend sleeps when idle; the app wakes it early, shows progress, and queues your job instead of failing.

---

## 📸 Screenshots

| Dashboard | Editor |
| :---: | :---: |
| <img src="docs/screenshots/dashboard.png" alt="Dashboard" /> | <img src="docs/screenshots/editor.png" alt="Editor" /> |
| **Editor — dark theme** | **Organize pages** |
| <img src="docs/screenshots/editor-dark.png" alt="Editor in dark theme" /> | <img src="docs/screenshots/organize.png" alt="Organize PDF tool" /> |
| **Sign up** | **Landing — dark theme** |
| <img src="docs/screenshots/signup-dark.png" alt="Sign up page" /> | <img src="docs/screenshots/landing-dark.png" alt="Landing page in dark theme" /> |

---

## 🧰 Features

### The toolbox

🔒 = runs in your browser (files never uploaded) &nbsp;·&nbsp; ☁️ = processed by the conversion server, temporary files deleted immediately &nbsp;·&nbsp; 💾 = edited in your browser, document and drafts saved privately to your workspace

| Category | Tool | Runs | Powered by |
| --- | --- | :---: | --- |
| **Organize** | Merge PDF — drag to reorder | 🔒 | `@cantoo/pdf-lib` |
| | Split PDF — extract a range or every page to a ZIP | 🔒 | `@cantoo/pdf-lib`, `fflate` |
| | Organize PDF — reorder / remove pages visually, with undo | 🔒 | `@cantoo/pdf-lib`, `react-pdf` |
| | Rotate PDF — per page or all, respects existing rotation | 🔒 | `@cantoo/pdf-lib` |
| **Optimize** | Compress PDF — 3 levels, shows savings, never larger than input | ☁️ | Ghostscript + pikepdf |
| | Repair PDF | ☁️ | pikepdf (qpdf), PyMuPDF fallback |
| | PDF to PDF/A | ☁️ | Ghostscript |
| **Convert to PDF** | Word, PowerPoint, Excel to PDF | ☁️ | LibreOffice |
| | Image to PDF — A4 / Letter / fit, orientation, margins, EXIF-aware | 🔒 | `@cantoo/pdf-lib` |
| | HTML to PDF — file or pasted markup (external resources blocked) | ☁️ | WeasyPrint |
| **Convert from PDF** | PDF to Word — layout, tables and images preserved | ☁️ | pdf2docx (PyMuPDF fallback) |
| | PDF to Excel — real table detection | ☁️ | PyMuPDF `find_tables` |
| | PDF to PowerPoint — slides match the page aspect | ☁️ | PyMuPDF + python-pptx |
| | PDF to JPG / PNG — standard or high quality, ZIP download | 🔒 | `pdf.js`, `fflate` |
| **Edit & Sign** | Edit & Sign PDF (the editor) | 💾 | `react-pdf`, `@cantoo/pdf-lib` |
| | Page Numbers — position picker, formats, start number, skip cover | 🔒 | `@cantoo/pdf-lib` |
| | Add Watermark — live preview, colors, opacity, any language | 🔒 | `@cantoo/pdf-lib`, Noto fonts |
| **Security** | Protect PDF — AES-256 with confirm & show-password | ☁️ | pikepdf |
| | Unlock PDF — clear "wrong password" feedback | ☁️ | pikepdf |

### The editor

- Full-screen workspace: command bar, page thumbnails, canvas, and a properties inspector
- **Edit existing text** in place, keeping the original font when it contains every character typed (even subset fonts); otherwise the same family from the server's font library or a metric-compatible look-alike (Arial → Arimo, Calibri → Carlito, …). Any installed font can be picked instead. On scans the typeface (and bold/italic) is detected by comparing the recognised words' shapes with the installed fonts. Scanned pages are read with OCR (English + Hindi) and painted over in the sampled paper color ☁️
- Text with size, color and bold; images; **saved signatures** with automatic white-background removal
- **Fill & sign** — detects interactive form fields (text, checkbox, radio, dropdown); quick-fill name, email, address, phone, date and initials when a PDF has none
- Floating item toolbar, layers panel, keyboard shortcuts (<kbd>⌘Z</kbd> / <kbd>⇧⌘Z</kbd>, <kbd>⌘S</kbd>, <kbd>Del</kbd>, arrow-key nudge)
- Pointer events for mouse, touch and pen; side panels become drawers on tablets and phones
- **Autosave** with a live status, flush on navigation, unsaved-changes guard
- Exports to PDF, PNG or JPG; placement is correct on rotated and cropped pages

### The workspace

- Email/password and Google sign-in with secure httpOnly session cookies
- Dashboard with searchable documents, recent activity and every tool grouped by category
- Uploads go straight from the browser to Vercel Blob (no 4.5 MB serverless limit), up to 50 MB

---

## 🏗 Architecture

```mermaid
flowchart LR
    subgraph Browser["🖥️ Browser"]
        UI["Next.js app<br/>React 19"]
        LOCAL["In-browser tools<br/>pdf-lib · pdf.js · fflate"]
    end

    subgraph Vercel["▲ Vercel"]
        PROXY["proxy.js<br/>session check"]
        API["API routes<br/>/api/session · /api/blob/*<br/>/api/pdf-tools/*"]
    end

    subgraph Google["🔥 Firebase"]
        AUTH["Auth"]
        FS["Firestore<br/>documents · drafts<br/>signatures · tool_history"]
    end

    BLOB[("Vercel Blob<br/>PDFs & signatures")]

    subgraph Render["☁️ Render (Docker)"]
        BE["FastAPI<br/>LibreOffice · Ghostscript<br/>pikepdf · PyMuPDF · pdf2docx<br/>WeasyPrint · Tesseract · fontTools"]
    end

    UI --> LOCAL
    UI -- "sign in" --> AUTH
    UI -- "drafts, history" --> FS
    UI -- "page requests" --> PROXY
    UI --> API
    API -- "client upload token" --> UI
    UI -- "direct upload" --> BLOB
    API -- "signed tool token" --> UI
    UI -- "direct upload + token" --> BE
    API -. "fallback proxy / health ping" .-> BE
```

### How server tools stay fast and safe

1. The browser asks `GET /api/pdf-tools/:toolId` for a **10-minute, tool-scoped HMAC token** (requires a signed-in session).
2. It uploads **directly to the FastAPI backend** with that token — no Vercel body limit, one less hop.
3. If the backend isn't reachable from the browser (CORS, preview domains) or rejects the token, the client falls back to `POST /api/pdf-tools/:toolId`, which streams through Next.js with the shared secret.
4. The backend validates input, enforces a 50 MB limit and per-user rate limits, runs heavy jobs off the event loop with timeouts and a concurrency cap, and deletes temporary files right after responding.

### Free-tier cold starts, handled

<img src="docs/screenshots/server-wakeup.png" alt="Waking up the conversion server notice" width="300" align="right" />

Render's free tier sleeps the backend after ~15 minutes idle. Instead of a mysterious timeout:

- **Pre-warm** — the dashboard pings the backend as soon as you sign in.
- **Tell the user** — server tools poll `GET /api/pdf-tools/status` and show *"Waking up the conversion server…"* with elapsed time.
- **Never drop a click** — pressing **Convert** during a cold start queues the job (*"Waiting for server…"*) and sends it once the server answers.
- **Stay quiet when warm** — readiness is remembered for 10 minutes, so hopping between tools shows nothing.

> 💡 Want zero waiting? Upgrade the Render plan, or point a free uptime monitor at `/health` every 10–14 minutes (this uses your free instance hours).

<br clear="right" />

---

## 🧱 Tech stack

| Layer | Technology |
| --- | --- |
| **Frontend** | Next.js 16 (App Router, Turbopack), React 19, Inter, lucide-react |
| **PDF in the browser** | [`@cantoo/pdf-lib`](https://www.npmjs.com/package/@cantoo/pdf-lib) (maintained pdf-lib fork), [`@cantoo/fontkit`](https://www.npmjs.com/package/@cantoo/fontkit), `react-pdf` 10 / `pdf.js` 5 (self-hosted worker), `fflate` |
| **Fonts** | Noto Sans & Noto Sans Devanagari (SIL OFL), lazy-loaded and subset into exports |
| **Auth & data** | Firebase Auth, Firestore, Firebase Admin (session cookies) |
| **Storage** | Vercel Blob with client-upload tokens |
| **Backend** | FastAPI · uvicorn · LibreOffice · Ghostscript · pikepdf 10 · PyMuPDF 1.28 · pdf2docx · WeasyPrint 70 · python-docx · python-pptx · openpyxl |
| **Hosting** | Vercel (frontend) · Render, Docker (backend) |

---

## 🔐 Security

- **Sessions** — httpOnly, `SameSite=Lax` session cookies verified in `proxy.js` and on every API route; safe `?next=` redirects only.
- **Firestore rules** — users can only read and write their own records and can't create or transfer data for anyone else.
- **Uploads** — short-lived Vercel Blob client tokens restricted to the caller's own path, allowed MIME types and size; deletes are checked against the owner's path prefix.
- **Backend** — shared-secret or signed tool tokens, client filenames never touch the filesystem, strict input validation, per-user rate limits, subprocess timeouts, no external fetches for HTML rendering.
- **Headers** — CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, strict referrer and permissions policies in production.

---

## 🚀 Quick start

### Prerequisites

- Node.js 20.9+ and npm
- A Firebase project (Auth with Email/Password + Google, and Firestore)
- A **public** Vercel Blob store
- Docker (for the conversion backend) — optional if you only use in-browser tools

### 1. Install

```bash
git clone https://github.com/ritstar/forge-pdf-editor.git
cd forge-pdf-editor
npm install
```

### 2. Configure `.env.local`

```bash
# Firebase client SDK
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...

# Firebase Admin SDK (server only)
FIREBASE_ADMIN_PROJECT_ID=...
FIREBASE_ADMIN_CLIENT_EMAIL=...
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Vercel Blob
BLOB_READ_WRITE_TOKEN=...

# Conversion backend
PDF_TOOLS_API_URL=http://localhost:8000
PDF_TOOLS_API_SECRET=change-me-to-a-long-random-string
# Optional: backend URL as reachable from the browser, if it differs from PDF_TOOLS_API_URL
# PDF_TOOLS_PUBLIC_URL=https://forge-pdf-tools-api.onrender.com
```

### 3. Set up Firebase

1. Enable **Email/Password** and **Google** sign-in providers.
2. Create Firestore in production mode.
3. Publish the rules from [`firestore.rules`](firestore.rules).

### 4. Run it

```bash
# Frontend → http://localhost:3000
npm run dev

# Backend → http://localhost:8000 (reads .env.local; set PDF_TOOLS_API_SECRET there)
docker compose up --build pdf-tools-api
```

---

## ⚙️ Configuration reference

### Frontend (Vercel)

| Variable | Required | Description |
| --- | :---: | --- |
| `NEXT_PUBLIC_FIREBASE_*` | ✅ | Firebase web app config |
| `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY` | ✅ | Service account for session cookies |
| `BLOB_READ_WRITE_TOKEN` | ✅ | Vercel Blob store token |
| `PDF_TOOLS_API_URL` | ✅ | Backend base URL used by the server |
| `PDF_TOOLS_API_SECRET` | ✅ | Shared secret; also signs browser tool tokens |
| `PDF_TOOLS_PUBLIC_URL` | | Backend URL for browsers, if different |

### Backend (Render / Docker)

| Variable | Default | Description |
| --- | --- | --- |
| `PDF_TOOLS_API_SECRET` | — | Must match the frontend |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated origins allowed to upload directly |
| `MAX_UPLOAD_BYTES` | `52428800` | Upload limit (50 MB) |
| `SUBPROCESS_TIMEOUT_SECONDS` | `100` | Timeout for LibreOffice / Ghostscript |
| `MAX_CONCURRENT_CONVERSIONS` | `2` | Heavy jobs allowed in parallel |
| `PDF2DOCX_MAX_PAGES` | `150` | Longer documents use the fast text-based Word conversion |
| `OCR_LANGUAGES` | `eng+hin` | Tesseract languages for reading scanned pages in Edit text |
| `OCR_DPI` | `300` | Resolution scanned pages are read at |
| `TESSDATA_PREFIX` | set in the image | Folder with Tesseract language data; without it, scanned pages can't be edited |
| `FONT_DIRS` | bundled + system font folders | Folders (`:`-separated) indexed for the text-edit font library and picker |

---

## 🌍 Deployment

| Part | Platform | Branch | Notes |
| --- | --- | --- | --- |
| Frontend | Vercel | `main` | Set the frontend variables above |
| Backend | Render (Docker) | `main` | Defined in [`render.yaml`](render.yaml), built from [`backend/Dockerfile`](backend/Dockerfile); health check `/health` |
| Firestore rules | Firebase console / CLI | — | Re-publish `firestore.rules` whenever it changes |

Production:

- App — <https://forge-pdf-editor.vercel.app>
- API — <https://forge-pdf-tools-api.onrender.com/health>

Make sure the backend's `CORS_ORIGINS` includes your frontend origin so browsers can upload directly; other origins (like preview deployments) automatically use the proxy.

---

## 🗂 Project structure

```text
app/
├── page.js                 Landing page
├── login/ · signup/        Split-screen auth
├── app/                    Dashboard
├── editor/[documentId]/    Full-screen PDF editor
├── tools/                  One route per tool (shared ToolShell layout)
├── api/
│   ├── session/            Create / clear session cookies
│   ├── blob/upload|delete  Client upload tokens, owner-checked deletes
│   └── pdf-tools/          Tool tokens, streaming proxy, backend status
├── components/             ForgeEditor, ToolShell, headers, dashboard, UI primitives
└── utils/                  PDF generation, fonts, coordinates, hooks
backend/
├── app/main.py             FastAPI conversion service
├── app/text_edit.py        Edit text: finds lines (OCR for scans), rewrites them in place
├── app/font_library.py     Installed fonts, PDF font name matching, subset embedding
├── app/font_detect.py      Typeface detection on scans from word shapes
├── app/fonts/              Bundled Noto fonts (OFL), the fallback of last resort
├── Dockerfile              LibreOffice, Ghostscript, Tesseract, the font library
└── requirements.txt
lib/                        Firebase, server helpers, tool catalog
public/fonts/               Noto fonts (OFL) for Unicode exports
proxy.js                    Auth gate for app routes (Next.js 16 proxy)
firestore.rules             Firestore security rules
```

---

## 🛠 Scripts

```bash
npm run dev      # start the dev server
npm run build    # production build
npm run start    # serve the production build
npm run lint     # ESLint
```

---

## 🙏 Credits

- Built by [**RitstaR**](https://github.com/ritstar)
- Fonts: [Noto Sans](https://github.com/notofonts/latin-greek-cyrillic) and [Noto Sans Devanagari](https://github.com/notofonts/devanagari) — SIL Open Font License ([`public/fonts/OFL.txt`](public/fonts/OFL.txt))
- Text-edit font library (installed from Debian in the backend image, each under its own license): Arimo, Tinos and Cousine (Croscore), Carlito, Caladea, the URW base35 fonts, Noto, Roboto, Open Sans, Lato, EB Garamond, Source Sans 3, Liberation and DejaVu
- [Tesseract](https://github.com/tesseract-ocr/tesseract) for OCR and [fontTools](https://github.com/fonttools/fonttools) for font matching and subsetting
- Standing on the shoulders of [pdf.js](https://github.com/mozilla/pdf.js), [pdf-lib](https://github.com/Hopding/pdf-lib) & [Cantoo's fork](https://github.com/cantoo-scribe/pdf-lib), [qpdf / pikepdf](https://github.com/pikepdf/pikepdf), [PyMuPDF](https://github.com/pymupdf/PyMuPDF), [pdf2docx](https://github.com/ArtifexSoftware/pdf2docx), [Ghostscript](https://www.ghostscript.com/), [LibreOffice](https://www.libreoffice.org/) and [WeasyPrint](https://weasyprint.org/)

<div align="center">
<br />
<sub>If Forge PDF saved you a trip to a paid PDF app, consider giving it a ⭐</sub>
</div>
