# Native app store distribution — scoping plan

## Context

Rocky wants to know what's actually involved in moving Harrows-dashboard and Harrows-Install-EOD from installable PWAs ("Add to Home Screen") to real App Store / Play Store apps. This is currently a scoping question, not a request to implement — the goal of this plan is an honest, concrete picture of the work, cost, and risk before any code gets written.

Both apps are plain Vite/React SPAs with **zero native tooling today** (no Capacitor/Cordova/React Native/Expo). Confirmed starting point: **no Apple Developer account, no Google Play Console account, no Mac** — everything in Section 1 starts from zero. Confirmed sequencing: **pilot with Harrows-Install-EOD first (Android, then iOS), before touching the dashboard.**

The realistic path is **Capacitor**, configured to load the live Vercel-hosted domain (`server.url`) rather than bundling `dist/` into the binary — this keeps the existing web app as the source of truth, gets free web-content updates with no store resubmission, and avoids CORS changes (both apps' `api/index.js` already allowlist their real production origins, not a `capacitor://` scheme).

This is mostly **not a coding problem**. The gating items are accounts, a Mac (or Mac-in-the-cloud CI), and store review turnaround — all outside any repo, and all needed before implementation starts.

## Phase 0 — Prerequisites (blocks everything else; start immediately)

None of this is code. Budget **1–3 weeks**, dominated by Apple's org-account verification lead time.

- **Apple Developer Program** — US$99/yr. Enroll as an **Organization** (not Individual) so the app is published under Harrows' name — requires a D-U-N-S number (check if Harrows already has one at dnb.com; if not, registering one adds real lead time, 1–2 weeks).
- **Google Play Console** — US$25 one-time. Faster verification than Apple's, but Organization accounts also increasingly require a D-U-N-S number.
- **A Mac, or Mac-in-the-cloud CI** — Xcode builds and iOS code signing only happen on macOS. Rocky's environment is Windows throughout this project, so this is a real decision, not a formality. Realistic options: GitHub Actions `macos-latest` runner (paid macOS minutes, but no hardware to own), or a managed service like Ionic Appflow that builds iOS binaries without owning a Mac. **Android has no such constraint** — buildable entirely on Windows/CI — which is part of why Android-first de-risks this.
- **Code signing**: Apple needs a distribution certificate (1yr) + provisioning profile (expires, needs a human to renew) + an APNs key if push is ever added. Android needs an upload keystore + Play App Signing enrollment (store the keystore + password durably — losing it without Play App Signing is unrecoverable).
- **App icons & splash** — Install-EOD already has a source hardhat-icon master (`gen-icons.cjs`) and brand colors (`#1E293B`); needs a 1024×1024 iOS master + Android adaptive-icon layers, generated via `@capacitor/assets` once a clean source exists.
- **Privacy Policy URL** — mandatory for both stores, must be a real hosted page. Neither app has one today. Given Clerk auth + Supabase + job-site photos + (Install-EOD) PIN-based installer accounts, this needs to actually describe what's collected, not be boilerplate.
- **Store listing content** — screenshots (iOS: 6.7"/5.5"; Android: phone), description, category, support contact, Android feature graphic (1024×500).
- **Privacy questionnaires** — Apple's "App Privacy" and Google's "Data Safety" forms, answered by a person, not generated.
- **Account ownership** — enroll both developer accounts under a Harrows organizational identity (not a personal login), add Rocky + a backup person as actual Users-and-Access members.

## Phase 1 — Install-EOD Capacitor scaffold, Android only

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Harrows Install EOD" "co.nz.harrows.installeod" --web-dir=dist
npx cap add android
```

`capacitor.config.ts`:
```ts
import type { CapacitorConfig } from '@capacitor/cli'
const config: CapacitorConfig = {
  appId: 'co.nz.harrows.installeod',
  appName: 'Harrows Install EOD',
  webDir: 'dist',
  server: { url: 'https://installs.harrows.co.nz', androidScheme: 'https' },
}
export default config
```

No `vite.config.ts` changes needed — the app isn't bundling `dist/` into the shell, just pointing the WebView at the real site. `AppRoot.tsx`'s `window.location.pathname === '/report'` escape hatch and the installer PIN/localStorage token flow (`src/lib/api.ts`, `src/utils/installerSession.ts`) work unchanged under this model since it's a genuine browser navigation context. Decide up front whether the shipped app's default route should be `/report` (installer flow) or `/` (office/Clerk shell) — likely `/report` given the primary native-app audience is field installers.

Icons/splash: `npm install -D @capacitor/assets` → `npx capacitor-assets generate --iconBackgroundColor '#1E293B' --splashBackgroundColor '#1E293B'`.

Build/test loop: `npx cap sync` after any plugin change, `npx cap open android` to build/run via Android Studio on a real device.

## Phase 2 — Validate the riskiest assumptions, fix if needed

Two existing web APIs this app's core workflow depends on are known rough edges inside a WebView — this is exactly why Install-EOD pilots first:

- **`<input type="file" capture="environment">`** (`src/components/PhotoUpload.tsx`) — inconsistent camera-launch behavior across Android WebView versions historically. If it misbehaves in testing, replace with **`@capacitor/camera`** for the native build — feed its output into the existing `resizeForUpload()` canvas-resize logic, which can stay as-is.
- **`navigator.share({ files: [pdfFile] })`** (`src/utils/emailDraft.ts`'s `shareOrDraftReportEmail`) — Web Share API-with-files support inside Capacitor's WebView is inconsistent. Replace with **`@capacitor/share`** if testing shows problems.
- Both fixes can be gated behind `Capacitor.isNativePlatform()` so the plain web/PWA version at `installs.harrows.co.nz` keeps using the current web APIs unchanged — not a hard fork.
- New permission declarations once `@capacitor/camera` is added: `NSCameraUsageDescription` (`Info.plist`) and `android.permission.CAMERA` (`AndroidManifest.xml`).

Test end-to-end on a real Android device: installer PIN login → take a photo for a report → submit → confirm the PDF share-sheet flow actually attaches to Gmail/Mail.

## Phase 3 — Install-EOD iOS

Once Phase 0's Apple enrollment + Mac/CI path exist: `npx cap add ios`, build via the chosen Mac/CI route, TestFlight to a real iPhone, confirm the same photo-capture and share-sheet flows before submitting for review.

## Phase 4 — Install-EOD store submission (both platforms)

Privacy policy, listing content, screenshots, data-safety/privacy questionnaires, first submission. Google Play review: hours to ~2 days typically (longer for a brand-new developer account). **Apple App Review is the long pole** — 24–48hrs typically, sometimes longer, and any rejection resets the clock.

## Phase 5 — Harrows-dashboard (separate phase, after Install-EOD is proven)

Same Capacitor scaffold pattern (Android + iOS), no camera/share concerns (dashboard doesn't use either — its `Permissions-Policy` explicitly disables camera). The one real lift:

**Web Push (VAPID) doesn't reach a native shell.** Dashboard has a fully-wired pipeline today — `PushManager.subscribe()` in `src/tabs/HundredGoals.tsx` → `POST /api/push/subscribe` → Supabase `push_subscriptions` table → sent via `web-push`+VAPID from the cron job `api/team/remind-clockin.js`. None of that reaches a native iOS/Android app. Needs, as its own sub-phase:
- A new Firebase project (FCM) — can unify both platforms under one `firebase-admin` server SDK (FCM wraps APNs for iOS too), avoiding hand-rolled APNs HTTP/2.
- Client: `@capacitor/push-notifications`, registering for a native device token (different shape than a Web Push subscription).
- Server: a new table (e.g. `native_push_tokens`) alongside the existing `push_subscriptions` — purely additive, existing web-push code path untouched — plus a new/parallel send path from the same cron.
- Note for `.env.example`: `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VITE_VAPID_PUBLIC_KEY` are currently required by the code but missing from `.env.example` — worth fixing regardless of this project.

## Update model, once live (either app)

- **Web-content changes** (React/UI/most backend changes) ship the instant `main` deploys to Vercel — no new store build, no review, since the app is just loading the live URL.
- **Native-shell changes** (new plugin, new permission, icon change, `appId`/config changes) need a new binary + full store review each time — budget days, not hours, and batch these rather than shipping one per tweak.

## Ongoing maintenance (forever, not one-time)

- Apple cert/provisioning profile renewal (~yearly, ~an hour if nothing's wrong) — needs a human with Apple ID access to notice and act.
- Developer account access: owned by a Harrows org identity, Rocky + a backup person as actual members — not a single shared personal login.
- Mac/CI dependency recurs on every iOS native-shell rebuild, not just once — this is why CI-based Mac access (GitHub Actions macOS runner, or a managed build service) is the more sustainable default over acquiring physical Mac hardware.

## Alternative worth knowing about (not the recommendation)

**Android-only Trusted Web Activity** (via Bubblewrap or PWABuilder) — wraps the existing PWA manifest into a Play-Store app with no Xcode/Mac requirement and much less setup than Capacitor. Real option if Play Store presence alone were urgent. Doesn't touch iOS at all, and doesn't improve on the camera/share reliability question since there's no native plugin ecosystem — so it doesn't actually de-risk Install-EOD's core open question the way the Capacitor pilot does. Given confirmed iPhone use, this isn't the primary path here, but it's a legitimate fallback to know about.

## Critical files (Install-EOD pilot)

- `C:\Users\rockyj\Harrows-Install-EOD\vite.config.ts` — confirm no changes needed
- `C:\Users\rockyj\Harrows-Install-EOD\api\index.js` — confirm CORS allowlist already covers `https://installs.harrows.co.nz` (it does)
- `C:\Users\rockyj\Harrows-Install-EOD\src\AppRoot.tsx` — confirm the `/report` escape hatch behaves correctly as the app's initial route if chosen as default
- `C:\Users\rockyj\Harrows-Install-EOD\src\components\PhotoUpload.tsx` — camera capture, candidate for `@capacitor/camera` swap
- `C:\Users\rockyj\Harrows-Install-EOD\src\utils\emailDraft.ts` — share-to-email, candidate for `@capacitor/share` swap
- New: `capacitor.config.ts`, `android/` platform folder (both committed to the repo, not build artifacts)

## Verification (once Phase 1–2 code exists)

1. `npx cap sync && npx cap open android`, build a debug APK via Android Studio, install on a real Android phone.
2. Walk the installer flow end-to-end: PIN login at `/report` → New Report → take a photo via Camera button → submit → confirm the PDF share-sheet actually opens with the file attached (this is the flow most likely to expose the `capture`/`navigator.share` WebView reliability question).
3. Compare against the same flow in a normal mobile browser tab (already validated working this session) to isolate any WebView-specific regression.
4. Only proceed to Phase 3 (iOS) once Phase 2's Android testing is clean.
