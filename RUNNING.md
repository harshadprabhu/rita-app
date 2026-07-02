# RITA — Running, Testing & Hosting Guide

This covers two things:

1. **Local development loop** — how to run the app on your machine and iterate fast (change → see it → rerun).
2. **Hosting** — how to deploy the backend (Supabase) and the frontend (web/PWA + mobile apps).

The app has two halves:

- **Frontend**: an Expo / React Native app (runs on iOS, Android, and Web/PWA from one codebase).
- **Backend**: Supabase (Postgres + Auth + Storage + Edge Functions + cron). There is no separate backend server to run — the "web admin console" is the same Expo app running on web.

---

## 0. One-time machine setup

Install these once:

- **Node.js 20 LTS** (you already have Node).
- **Git**.
- For Android testing: **Android Studio** (gives you the Android emulator + SDK). On first launch, open *More Actions → Virtual Device Manager* and create a device (e.g. Pixel 7, API 34).
- For backend work: **Supabase CLI** — `npm install -g supabase`.
- (Optional, for cloud builds) **EAS CLI** — `npm install -g eas-cli`, then `eas login`.

> iOS simulators require a Mac. On Windows you'll test iOS via a physical iPhone (Expo Go / dev build) or skip to Android + Web.

---

## 1. Environment variables

The app reads two public env vars from a `.env` file in the project root:

```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
```

- `.env` is gitignored — never commit real keys.
- These are the **public/anon** values (safe for the client). They come from the Supabase dashboard → *Project Settings → API*.
- Until you provision Supabase (Section 4), these stay as placeholders and login/data won't work — but the UI still renders.

After editing `.env`, **restart** the dev server (env is read at startup, not hot-reloaded).

---

## 2. The fast local dev loop (recommended day-to-day)

This is your "make many changes, test, rerun" workflow.

```bash
cd rita-app
npx expo start
```

This starts the Metro bundler and shows a menu. Then pick a target:

| Press | Target | Notes |
|-------|--------|-------|
| `w`   | **Web browser** | Fastest loop. Best for UI/layout work. Opens http://localhost:8081 |
| `a`   | **Android** | Opens the running Android emulator (start it from Android Studio first), or a USB-connected phone |
| `i`   | **iOS** | Mac only |
| `r`   | **Reload** the app | |
| `c`   | **Clear** the Metro cache and restart | Use this when things get weird after big changes |

**Hot reload is automatic** — save a file and the app updates in place. You rarely need to fully restart. You only need to stop/restart (`Ctrl+C` then `npx expo start`) when you:

- change `.env`,
- change `app.json` / `metro.config.js` / `babel.config.js`,
- install/remove a dependency.

### Testing on a physical phone (no emulator needed)

1. Install **Expo Go** from the App Store / Play Store.
2. Run `npx expo start` and scan the QR code with the phone (same Wi-Fi network).
3. If the phone and PC aren't on the same network, use a tunnel: `npx expo start --tunnel`.

> **Expo Go caveat:** Expo Go is great for UI iteration, but a few native features (push notifications, some image/file pickers) only work fully in a **development build** (see below). For pure screen/flow/styling work, Expo Go + Web are perfect.

### Development build (most accurate testing)

When you need the real native modules (push notifications, etc.):

```bash
# One-time per project:
eas login
eas init                 # links/creates an EAS project, writes the projectId into app.json
eas build:configure      # creates eas.json

# Build a dev client you install on the device/emulator:
eas build --profile development --platform android
```

Install the resulting `.apk` on your emulator/phone, then run `npx expo start --dev-client` and it connects to that build with hot reload — same fast loop, but with full native support.

### Known quirks on this machine (already worked around)

- Your project path contains a space (`Hemant Prabhu`). `metro.config.js` already quotes the Tailwind CLI path to handle this, and a `patch-package` patch fixes a NativeWind Windows-path bug. Both apply automatically — don't remove them.
- If a **web export** ever fails the first time with a `nativewind/global.css` "could not be found" error, just run the command again — it's a one-time CSS-generation race and succeeds on the second run (the cache is then warm).

---

## 3. Iterating on the backend locally (optional but nice)

You have two options for the backend while developing:

### Option A — point at a hosted Supabase "dev" project (simplest)

Just put a real (non-production) Supabase project's URL + anon key in `.env`. Your local app talks to the cloud. No Docker needed. Good enough for most work.

### Option B — full local Supabase stack (offline, fast, disposable)

Requires **Docker Desktop**.

```bash
cd rita-app
supabase start            # boots local Postgres + Auth + Storage + Studio in Docker
supabase db reset         # applies everything in supabase/migrations to the local DB
```

`supabase start` prints a local API URL and anon key — put those in `.env` to develop fully offline. To run an edge function locally:

```bash
supabase functions serve check-sla-breaches
```

Stop everything with `supabase stop`.

---

## 4. Hosting the backend (Supabase) — do this first

The frontend is useless without the backend, so set this up first.

### 4.1 Create the project

1. Go to https://supabase.com → **New project**. Pick a region close to your stores, set a strong DB password.
2. Copy the **Project URL** and **anon key** (*Project Settings → API*) into your production `.env` (and into your web host's env vars later).

### 4.2 Link the CLI and push the schema

```bash
cd rita-app
supabase login
supabase link --project-ref YOUR-PROJECT-REF     # ref is in the dashboard URL
supabase db push                                  # applies supabase/migrations/* to the cloud DB
```

This creates all tables, enums, the 4-role `profiles` table, tickets, chat, audit logs, and the **RLS policies**.

### 4.3 Create the storage bucket

In the dashboard → **Storage** → create a bucket named **`ticket-attachments`** (public read is fine for this app, since the code uses `getPublicUrl`).

### 4.4 Deploy the Edge Functions

> **No AI API key needed.** The RITA bot's triage runs entirely in the app via a
> local keyword classifier (`lib/utils/categoryClassifier.ts`). Only these two
> server-side helpers get deployed. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
> are injected automatically — you don't set any secrets.

```bash
supabase functions deploy check-sla-breaches
supabase functions deploy dispatch-ticket
```

### 4.5 Wire up the SLA cron

Open `supabase/migrations/20260630000002_sla_cron.sql`, replace `<PROJECT_REF>` and `<ANON_KEY>` with your real values, then run it (dashboard → **SQL Editor**, paste & run, or `supabase db push` if you keep it as a migration). This schedules `check-sla-breaches` every 5 minutes.

### 4.6 Configure Auth

Dashboard → **Authentication → Providers**:

- Enable **Email** (password) and, if you want OTP login, enable **Email OTP**.
- Under **URL Configuration**, add your web app's URL (Section 5) to the redirect allow-list.

### 4.7 Seed the first admin

Sign up once through the app (or dashboard → Authentication → Add user), then in **SQL Editor** promote that user:

```sql
update profiles set role = 'admin', approval_status = 'approved', is_active = true
where id = 'THE-AUTH-USER-UUID';
```

From then on, that admin can provision everyone else in-app.

---

## 5. Hosting the frontend — Web / PWA

The web build is static files — host them anywhere.

### Build

```bash
cd rita-app
npx expo export -p web        # outputs to ./dist  (re-run once if the CSS race hits)
```

### Deploy (pick one)

**Vercel / Netlify / Cloudflare Pages** (easiest):

- Connect the repo (or drag-and-drop the `dist` folder).
- Build command: `npx expo export -p web`
- Output directory: `dist`
- Add env vars `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in the host's dashboard.
- Add a **rewrite/redirect** so all routes serve the app (SPA-style): e.g. on Netlify a `_redirects` file with `/* /index.html 200`, or on Vercel a catch-all rewrite. (Expo static export also emits per-route HTML, so plain static hosting works too.)

**Supabase Hosting / any static host:** upload the `dist` folder.

The web build already includes the **PWA manifest** ("RITA POS Triage", navy theme) from `app.json`, so users can "Add to Home Screen."

---

## 6. Hosting the frontend — Mobile apps (iOS & Android)

Use **EAS Build** (Expo's cloud build service — no Mac needed for iOS).

```bash
eas login
eas init                       # one-time: links an EAS project
eas build:configure            # one-time: creates eas.json with build profiles
```

### Internal testing builds (share with your team before stores)

```bash
eas build --profile preview --platform android   # installable .apk
eas build --profile preview --platform ios       # needs an Apple Developer account for device installs
```

EAS gives you a link to download/install the build.

### Production store builds

```bash
eas build --profile production --platform android   # .aab for Play Store
eas build --profile production --platform ios        # for App Store
eas submit --platform android                        # uploads to Play Console
eas submit --platform ios                            # uploads to App Store Connect
```

Store listings, screenshots, and review are done in Google Play Console / App Store Connect.

### Over-the-air (OTA) updates — push JS changes without a new store build

```bash
eas update --branch production --message "Fix ticket list spacing"
```

Great for the "many changes" phase: most JS/UI fixes ship instantly via OTA; you only need a new native build when you change native config or add a native dependency.

---

## 7. Typical workflow summary

**While developing (your main loop):**
```bash
npx expo start      # press w (web) or a (Android), edit files, watch hot reload
npm run typecheck   # before committing, catch type errors
```

**When you change the database:**
```bash
# create a new file in supabase/migrations/ with your SQL, then:
supabase db push            # to the cloud, or `supabase db reset` locally
```

**When you change an edge function:**
```bash
supabase functions deploy <function-name>
```

**To ship frontend changes:**
- Web: redeploy `dist` (or let your Git host auto-build).
- Mobile JS-only change: `eas update`.
- Mobile native change: `eas build` + `eas submit`.
