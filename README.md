# Keyword Management System

An advanced, professional Google Ads **keyword management hub** for an agency
(**Global Surat**) and its client (**Khushan**) to collaborate from one place.

- Add / edit / **pause** / **hold** / remove keywords from a single interface
- **B2B Keywords** and **Brand & Series** lists, **Negative Keywords**, and **Geo & Seeds**
- **Full activity log** that clearly shows whether each change was made by the **Client** or the **Agency**
- **Import** your existing Excel research and **export** a **Google Ads Editor-ready CSV** (or a full Excel backup)
- **No duplicates** — enforced by the database, with a dedup preview on import
- **Permanent storage** in Neon Postgres — data survives refresh *and* redeploys

---

## Tech

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Neon Postgres (`postgres.js`) · SheetJS (`xlsx`) · `jose` sessions.

## Accounts (default)

| Role   | Username       | Password          |
| ------ | -------------- | ----------------- |
| Client | `Khushan`      | `Khushan@007`     |
| Agency | `Global Surat` | `GlobalSurat@007` |

> You can change these any time via environment variables (`CLIENT_PASSWORD`, `AGENCY_PASSWORD`, etc.) without touching code.

---

## 1. Create the database (Neon) — one time, ~2 minutes

1. Go to **https://neon.tech** and sign up (free).
2. Create a project (any name, e.g. *keyword-manager*).
3. Open **Connection Details** → choose the **Pooled connection** → copy the string.
   It looks like:
   `postgres://USER:PASSWORD@ep-xxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require`

That's it — the app creates all tables automatically on first use.

## 2. Run locally (optional)

```bash
npm install
cp .env.example .env.local      # then paste your DATABASE_URL + a SESSION_SECRET
npm run dev                     # http://localhost:3000
```

Generate a session secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## 3. Push to GitHub

```bash
git init
git add .
git commit -m "Keyword Management System"
git branch -M main
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```

## 4. Deploy on Vercel

1. Go to **https://vercel.com** → **Add New… → Project** → import your GitHub repo.
2. Before deploying, open **Environment Variables** and add:

   | Name              | Value                                              |
   | ----------------- | -------------------------------------------------- |
   | `DATABASE_URL`    | your Neon **pooled** connection string             |
   | `SESSION_SECRET`  | a long random string                               |
   | `CLIENT_PASSWORD` | `Khushan@007` (or a new one)                       |
   | `AGENCY_PASSWORD` | `GlobalSurat@007` (or a new one)                   |

   > Tip: you can also add the **Neon** integration from the Vercel Marketplace, which sets `DATABASE_URL` for you. If it sets a different variable name, copy its value into `DATABASE_URL`.

3. Click **Deploy**. Done.

Because all data lives in Neon Postgres, **nothing resets on redeploy** — your keywords and activity log persist permanently.

---

## Using the app

- **Keywords** — switch between *B2B* and *Brand & Series* tabs; search, filter by status, add, edit, pause, hold, remove. Removed items are kept (soft-deleted) and can be restored; only the agency can permanently delete.
- **Negative Keywords** — manage exclusion terms by category.
- **Geo & Seeds** — geographic tiers (GTA / Ontario / National) and seed terms/URLs.
- **Activity Log** — filter by **Client**, **Agency**, action, or search. Every change is attributed.
- **Import / Export** — drop your `.xlsx` to preview *new vs duplicate* counts, then import; export a Google Ads CSV or a full Excel backup.

### Importing your Excel file
The importer auto-detects these sheets (names are matched loosely):
`B2B Keywords`, `Brand & Series`, `Negative Keywords`, `Geo & Seeds`.
Re-importing the same file is safe — duplicates are skipped, never doubled.

### Exporting to Google Ads
Download **Google Ads Editor CSV**, then in Google Ads Editor use
**Account → Import** (or paste) to bulk-upload. *On hold* and *paused* map to
*Paused*; *removed* keywords are excluded.
