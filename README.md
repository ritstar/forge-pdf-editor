# Forge PDF Editor

Forge PDF Editor is a full PDF toolkit built with Next.js, Firebase, Vercel Blob, and a Dockerized FastAPI backend. It combines an authenticated PDF workspace with browser-based editing tools and server-powered file conversion and repair utilities.

## Live Deployment

- Frontend: https://forge-pdf-editor.vercel.app
- Backend API: https://forge-pdf-tools-api.onrender.com

## What It Includes

### Workspace

- Email/password authentication and Google sign-in
- User dashboard with recent drafts and tool history
- Persistent document drafts stored per user
- Signature library for reuse across documents
- Autosave and resume editing workflow
- Legal pages: About, Privacy Policy, Terms of Service, Contact

### Editor

- Multi-page PDF editing
- Text overlays with styling controls
- Image overlays
- Signature placement and reuse
- Interactive PDF form filling
- Quick actions for dates and initials
- Manual save plus autosave support
- Export edited documents

### Browser-Based PDF Tools

- Merge PDF
- Split PDF
- JPG to PDF
- PDF to JPG
- Add page numbers
- Add watermark
- Rotate PDF
- Organize PDF pages

### Backend-Powered PDF Tools

- Compress PDF
- PDF to Word
- PDF to PowerPoint
- PDF to Excel
- Word to PDF
- PowerPoint to PDF
- Excel to PDF
- HTML to PDF
- Unlock PDF
- Protect PDF
- PDF to PDF/A
- Repair PDF

## Stack

- Next.js 16 App Router
- React 19
- Firebase Auth
- Firestore
- Vercel Blob
- `react-pdf`
- `pdfjs-dist`
- `pdf-lib`
- FastAPI
- Docker
- LibreOffice, Ghostscript, qpdf, WeasyPrint, PyMuPDF

## Project Structure

```text
app/        Next.js routes, editor UI, tool pages, API routes
backend/    FastAPI service used for conversion/compression/repair tools
lib/        Shared client and app utilities
public/     Static assets
```

## Local Development

### 1. Install frontend dependencies

```bash
npm install
```

### 2. Create `.env.local`

```bash
# Firebase client SDK
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...

# Firebase Admin SDK
FIREBASE_ADMIN_PROJECT_ID=...
FIREBASE_ADMIN_CLIENT_EMAIL=...
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Vercel Blob
BLOB_READ_WRITE_TOKEN=...

# App URLs
NEXT_PUBLIC_APP_URL=http://localhost:3000
PDF_TOOLS_API_URL=http://localhost:8000
```

### 3. Configure Firebase

- Create a Firebase project
- Enable Email/Password auth
- Enable Google auth
- Create Firestore in production mode
- Apply rules from `firestore.rules`

### 4. Configure Vercel Blob

- Create a Blob store in Vercel
- Use a public-access Blob store
- Copy the read/write token into `.env.local`

### 5. Run the frontend

```bash
npm run dev
```

### 6. Run the backend with Docker

```bash
docker compose up --build pdf-tools-api
```

Frontend runs at `http://localhost:3000`.

Backend runs at `http://localhost:8000`.

## Production Deployment

### Frontend

- Hosted on Vercel
- Production branch: `main`
- Required env:

```bash
PDF_TOOLS_API_URL=https://forge-pdf-tools-api.onrender.com
```

### Backend

- Hosted on Render
- Production branch: `main`
- Uses `render.yaml`
- Docker image is built from `backend/Dockerfile`

Recommended Render env:

```bash
CORS_ORIGINS=https://forge-pdf-editor.vercel.app,http://localhost:3000
```

## Notes About Backend Tooling

- Backend-powered tools are proxied through the Next.js route at `app/api/pdf-tools/[toolId]/route.js`
- The browser talks to the Next.js app, and Next.js forwards requests to the FastAPI backend
- This keeps the backend URL configurable through `PDF_TOOLS_API_URL`

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## Current Status

- Frontend and backend are both wired for production
- `main` is the deployment branch for both Vercel and Render
- All currently listed tools in the app are implemented and exposed in the UI
