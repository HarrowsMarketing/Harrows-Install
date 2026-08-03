# Local dev setup

**You don't need any of this for a small/quick change.** For a simple edit (copy tweak, move
a button, adjust a style), just describe the change — Claude edits the file and pushes
straight to `main`, and Vercel deploys it. No local servers, no env vars required.

Everything below is only needed when you actually want to click through the app yourself
before shipping (testing a bigger feature, checking something visually, debugging behavior
that depends on real data).

No `.env` ships in this repo (correctly gitignored — see CLAUDE.md). First time running
locally, or whenever `.env` is missing/stale, pull it from Vercel instead of asking Rocky
for values one at a time.

## One-time / as-needed: pull env vars from Vercel

```
npx vercel login <email>          # device-flow login, opens a browser approval link
npx vercel link --yes --project harrows-install
npx vercel env pull .env --environment=production
```

Notes:
- **Pull `production`, not `development`** — this project has no vars configured under the
  Development environment in Vercel, so `--environment=development` comes back with almost
  nothing (just `VERCEL_OIDC_TOKEN`). Production has the real `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `BLOB_READ_WRITE_TOKEN`, `CLERK_SECRET_KEY`,
  `VITE_CLERK_PUBLISHABLE_KEY`, `INSTALLER_SESSION_SECRET`, `ANTHROPIC_API_KEY`.
- **If `vercel login`/`vercel env pull` fails with `unable to verify the first certificate`**,
  this network intercepts TLS. Prefix the command with `NODE_TLS_REJECT_UNAUTHORIZED=0` (same
  workaround CLAUDE.md documents for local `curl` debugging).
- `vercel link` will error with a project-name validation message if you let it try to
  auto-detect/create a project from the directory name — pass `--project harrows-install`
  explicitly instead of running `link` bare.
- `vercel link` also adds `.vercel` and `.env*` to `.gitignore` if they're not already there —
  that's expected and fine to commit.

## Every session: run both servers

Two processes, not one — Vite doesn't proxy to anything by itself:

```
npm run dev       # Vite frontend, http://localhost:5173 (or next free port)
npm run server    # Express API on :3001, api/index.js via dev-server.js
```

- `VITE_`-prefixed env vars (e.g. `VITE_CLERK_PUBLISHABLE_KEY`) are baked in at Vite's
  startup — if you edit `.env` or just pulled it for the first time, **restart `npm run dev`**,
  a page refresh alone won't pick it up.
- If port 5173 says "in use" and Vite jumps to 5174, check whether an old dev server is
  actually still running before assuming it's fine to ignore — a stale instance started before
  `.env` existed will look like your changes "aren't updating" (they're just not being served).
  Find and kill it: `netstat -ano | grep LISTENING | grep :5173` then `taskkill //PID <pid> //F`.
- Double check which URL you're actually looking at. `https://installs.harrows.co.nz` is
  production — it only reflects what's been pushed to `main` and deployed, never your local
  edits. Local changes only show up on whatever `localhost:<port>` Vite just printed.

## Shipping a change

Same as any push to this repo (per CLAUDE.md): `git fetch` + check for divergence right
before pushing (not just at session start), confirm `git config user.email` is
`marketing@harrows.co.nz` (identity `HarrowsMarketing`), then push to `main` — Vercel
auto-deploys from there. No separate deploy step or manual build needed.
