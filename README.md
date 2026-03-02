# Forge PDF Editor

Forge PDF Editor is a Firebase-backed PDF workspace with user accounts, Google login, saved signatures, fill-and-sign support, and persistent drafts.

## Live App

- Production: https://forge-pdf-editor.vercel.app

## Core Features

- Landing page + auth flow (`/`, `/login`, `/signup`)
- Email/password auth and Google OAuth (via Firebase)
- User-scoped dashboard for uploaded PDFs
- Dashboard UX polish:
  - Activity history menu is compact, scrollable, and opened from the three-dots action at the end of header controls
  - Refresh action now animates the refresh icon on click
  - Explore tools are grouped with all "Coming Soon" tools shown in a separate bottom section
- Draft autosave per document (manual save also available)
- Delete draft documents from dashboard (with storage cleanup)
- Signature library per user (save once, reuse anytime)
- Multi-page PDF editing with text, image, and signature overlays
- Fill & Sign panel:
  - Detect and fill interactive PDF fields (text, checkbox, radio, dropdown/list)
  - Quick actions for date and initials
- Export edited PDF and current page image formats

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
