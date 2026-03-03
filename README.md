# Forge PDF Editor

Forge PDF Editor is a Firebase-backed PDF workspace with user accounts, Google login, saved signatures, fill-and-sign support, and persistent drafts.

## Live App

- Production: https://forge-pdf-editor.vercel.app

## Available Features

### Workspace and Account
- Authentication: Email/password login and Google OAuth.
- User dashboard: User-scoped document list, recent activity, and quick access to tools.
- Sign/Edit entry card: Dedicated upload card to start PDF editing quickly.
- Draft persistence: Autosave and resume document drafts.
- Document management: Delete drafts and clean up related storage.
- Signature library: Save and reuse signatures across documents.
- Legal/info pages: About, Privacy Policy, Terms of Service, Contact.

### PDF Editor
- Multi-page editing: Add and position text, images, and signatures.
- Fill & Sign: Detect and fill form fields (text, checkbox, radio, dropdown/list).
- Quick fill actions: Fast date and initials insertion.
- Export options: Export edited PDFs and page images.

### Available PDF Tools
- Merge PDF: Combine multiple PDFs in custom order.
- Split PDF: Extract a page range into a new PDF.
- JPG to PDF: Convert JPG/PNG images into a PDF document.
- PDF to JPG: Convert PDF pages to JPG (single or ZIP download).
- Page Numbers: Add page numbers with configurable format and position.
- Add Watermark: Apply text watermark with opacity and styling controls.
- Rotate PDF: Rotate individual pages or all pages and export.
- Organize PDF: Rearrange pages (drag-and-drop), mark pages for deletion, undo actions, and view change history.

## Coming Soon Features

- Compress PDF: Reduce file size while optimizing quality.
- PDF to Word: Convert PDF to DOC/DOCX.
- PDF to PowerPoint: Convert PDF to PPT/PPTX.
- PDF to Excel: Extract PDF data into spreadsheet format.
- Word to PDF: Convert DOC/DOCX files to PDF.
- PowerPoint to PDF: Convert PPT/PPTX files to PDF.
- Excel to PDF: Convert spreadsheet files to PDF.
- HTML to PDF: Convert webpages/HTML content to PDF.
- Unlock PDF: Remove PDF password security.
- Protect PDF: Encrypt PDF files with password protection.
- PDF to PDF/A: Convert PDF to archival PDF/A format.
- Repair PDF: Attempt recovery for damaged/corrupted PDF files.

## Tech Stack

- Next.js 16 (App Router)
- React 19
- Firebase Auth + Firestore
- Vercel Blob (for fast, native Next.js object storage)
- `react-pdf` + `pdfjs-dist`
- `pdf-lib`

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local`:

```bash
# Firebase Client SDK
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...

# Firebase Admin SDK (Server-side)
FIREBASE_ADMIN_PROJECT_ID=...
FIREBASE_ADMIN_CLIENT_EMAIL=...
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Vercel Blob Token
BLOB_READ_WRITE_TOKEN="..."

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

3. Create a Firebase Project in the [Firebase Console](https://console.firebase.google.com/).

4. Enable Firebase Services:
    - **Authentication**: Enable Email/Password and Google providers.
    - **Firestore**: Create a database in "Production mode" and apply rules from `firestore.rules`.

5. Create a Vercel Blob store:
    - Go to Vercel Dashboard > Storage > Create Database > Blob.
    - Set Access to **Public**.
    - Copy the `BLOB_READ_WRITE_TOKEN`.

6. Start dev server:

```bash
npm run dev
```

## Firebase Rules

The app expects Firestore rules to be configured for user data protection.
See `firestore.rules` in the root directory.

## Draft Model

Each document has one latest draft row in the `drafts` subcollection of the document in Firestore.
Draft snapshot includes editor overlays plus form fill values.

## Notes

- All document and signature data is tied to authenticated users.
- Never expose Firebase Admin keys in client-side code.
- Dashboard footer includes project credit and dynamic year rendering.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```
