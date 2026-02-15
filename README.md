# Forge PDF Editor

Forge PDF Editor is now a full Supabase-backed PDF workspace with user accounts, Google login, saved signatures, and persistent document drafts.

## Live App

- Production: https://forge-pdf-editor.vercel.app

## Core Features

- Landing page + auth flow (`/`, `/login`, `/signup`)
- Email/password auth and Google OAuth
- User-scoped dashboard for uploaded PDFs
- Draft autosave per document
- Signature library per user (save once, reuse anytime)
- Multi-page PDF editing with text, image, and signature overlays
- Export edited PDF and current page image formats

## Tech Stack

- Next.js 16 (App Router)
- React 19
- Supabase Auth + Database + Storage
- `react-pdf` + `pdfjs-dist`
- `pdf-lib`

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create env file:

```bash
cp .env.example .env.local
```

3. Fill `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

4. Run SQL migrations in Supabase SQL Editor:

- `supabase/schema.sql`

5. Configure Auth providers in Supabase:

- Enable Email provider
- Enable Google provider
- Add redirect URLs:
  - `http://localhost:3000/auth/callback`
  - `https://forge-pdf-editor.vercel.app/auth/callback`

6. Start dev server:

```bash
npm run dev
```

## Supabase Storage Buckets

The app expects these private buckets:

- `documents`
- `draft_assets`
- `signatures`

The SQL migration also adds RLS storage policies that scope access to each user's folder prefix.

## Draft Model

Each document has one latest draft row in `document_drafts` keyed by `document_id`.
The editor autosaves after changes and also supports manual save.

## Notes

- All document and signature data is tied to authenticated users.
- Do not use a service role key in client-side code.
- If Google OAuth is enabled, ensure callback URL matches exactly in both Supabase and Google Cloud console.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```
