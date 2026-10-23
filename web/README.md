# Field Survey — Web

The browser version of the Field Survey mobile app, plus a public landing page.
It uses **the same Supabase project, Edge Functions, roles and data** as `mobile/`.
Nothing in `supabase/` was changed.

Stack: Vite + React + TypeScript, React Router, react-hook-form + zod, supabase-js, SheetJS (Excel).

## Run

```bash
cd web
cp .env.example .env        # same URL + anon key as mobile/.env (EXPO_PUBLIC_* -> VITE_*)
npm install
npm run dev                 # http://localhost:5173
npm run build               # static files in web/dist
```

`dist/` is a static single-page app. Host it on any static host (Netlify, Vercel, Cloudflare Pages, S3, nginx) with a fallback of all paths to `index.html`.

## Pages

| Path | Who | What |
|---|---|---|
| `/` | everyone | Landing page |
| `/login` | everyone | Sign in with mobile number or email + password (same accounts as the app) |
| `/app` | signed in | Home: add record, search, recent records, admin shortcuts |
| `/app/records` | signed in | Search by farmer name, survey no. (`312`, `312/4B`) or receipt no. (`RC-000123`) |
| `/app/records/new` | admin, user | Add a farmer equipment / service record |
| `/app/records/:id` | signed in | Details, receipt preview, print receipt; delete (admin) |
| `/app/reports` | admin | Weekly / monthly / custom Excel download and printable PDF |
| `/app/users` … | admin | Add, edit, deactivate, delete users |
| `/app/audit` | admin | Audit history |
| `/app/profile` | signed in | My profile, sign out |

Roles are enforced in the UI and again by RLS and the Edge Functions, exactly as for the mobile app.

## Notes

- Receipts use the same HTML as the mobile receipt (`src/lib/receipt.ts`) and print through the browser's print dialog; "Save as PDF" gives a PDF.
- Saving a record reuses one id per form as the idempotency key, so a retry after a dropped connection never creates a duplicate.
- The Edge Functions already send CORS headers (`ALLOWED_ORIGIN`, default `*`). To lock it down, set `ALLOWED_ORIGIN` to the web app's URL with `supabase secrets set`.
- Phone sign-in needs the Supabase phone provider enabled, same as the app.
