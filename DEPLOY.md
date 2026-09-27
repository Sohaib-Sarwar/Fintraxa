# Deploying Fintraxa

Static Vite SPA. No server, no build-time secrets — everything the app talks to
(Supabase, the market data CDN) it talks to from the browser.

---

## What the app needs at runtime

| Variable | Value | Why |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://YOUR_PROJECT_REF.supabase.co` | Database and auth |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | Client key. Public by design — RLS on the server is what enforces access |
| `VITE_API_BASE_URL` | *(optional)* | Defaults to the live market data service. Set only to point at a fork |

Anything prefixed `VITE_` is **inlined into the JavaScript bundle**. A
service-role key, a database password or any other secret must never be set as a
`VITE_` variable — it would ship to every visitor. Find the publishable key at
**Supabase → Project Settings → API**.

---

## First deploy

### 1. Authenticate

```bash
npx vercel login
```

Opens a browser. Nothing else works until this succeeds — `npx vercel whoami`
should print your username afterwards.

### 2. Link the directory to a project

```bash
cd fintraxa-app
npx vercel link
```

Answer: link to existing project → no (first time), project name → `fintraxa`,
directory → `./`. This writes `.vercel/`, which is gitignored.

Vercel reads `vercel.json` for the framework, build command and output
directory, so accept whatever it detects — the file overrides it.

### 3. Set the environment variables

```bash
npx vercel env add VITE_SUPABASE_URL production
npx vercel env add VITE_SUPABASE_PUBLISHABLE_KEY production
```

Each prompts for the value. Repeat with `preview` in place of `production` if
you want preview deployments to work against the same project — they will
otherwise build and then fail at runtime, because `src/lib/supabase.js` throws
when the variables are absent. That is deliberate: the alternative was a
misconfigured deploy rendering a confident `Rs 0` balance.

### 4. Deploy

```bash
npx vercel --prod
```

### 5. Point Supabase auth at the deployed URL

**Supabase → Authentication → URL Configuration**:

- **Site URL** → `https://your-app.vercel.app`
- **Redirect URLs** → add `https://your-app.vercel.app/auth` and, for previews,
  `https://*-your-team.vercel.app/auth`

Without this, confirmation and password-reset links point at whichever
environment was configured last. The app passes `emailRedirectTo` explicitly, so
the address must be on the allow-list or Supabase rejects it.

---

## Subsequent deploys

```bash
npm run verify        # lint + unit tests + build
npm run test:contract # is the live API still returning what we read?
npx vercel --prod
```

Or connect the GitHub repo in the Vercel dashboard (**Project → Settings → Git**)
and every push to `main` deploys on its own.

---

## What `vercel.json` does

- **SPA rewrites** — every path that is not a file serves `index.html`, so a
  deep link like `/stocks/analytics` works on a cold load instead of 404ing.
- **Immutable asset caching** — `/assets/*` is content-hashed by Vite, so it is
  cached for a year. `index.html`, `sw.js` and the manifest are explicitly *not*
  cached, or a deploy would never reach anyone.
- **CSP** — `connect-src` is an allow-list: Supabase (including websockets for
  realtime), the market data CDN, and the FX rate API. Adding a new external
  call means adding it here, or the browser blocks it.
- **HSTS, nosniff, `frame-ancestors 'none'`** — standard hardening. The last one
  blocks clickjacking, which matters for an app with a money-moving UI.

---

## Verifying a deploy

1. Open the URL. You should land on `/auth`.
2. Sign in. The dashboard should show live prices, not purchase costs.
3. Check the freshness dot near a price list — it reports the **session the
   prices describe**, not when the file was fetched. Amber means the service's
   own scheduled refresh is overdue.
4. DevTools → Network: requests to `sohaib-sarwar.github.io` return `200`, and
   on a reload most are served by the service worker.
5. DevTools → Console: clean.

---

## If something is wrong

| Symptom | Cause |
|---|---|
| Blank page, console says "Missing VITE_SUPABASE_URL" | Env vars not set for that environment. They are per-environment; setting `production` does not set `preview`. |
| Deep links 404 on reload | `vercel.json` rewrites missing — check the file deployed. |
| Prices all equal purchase price | Market data fetch failing. Run `npm run test:contract`; a banner should also be showing on the Shares page. |
| Login works, then immediately signs out | Site URL / Redirect URLs in Supabase do not match the deployed origin. |
| A fetch is blocked with a CSP error | The host is not in `connect-src` in `vercel.json`. |
