# ASCEND — Google Play Compliance Checklist

Last audited: October 20, 2026 (branch `feat/overnight-build`, PR #13)
Production URLs (must stay live — Play reviewers fetch them):

- Privacy Policy: https://ascendtonext.vercel.app/privacy
- Terms of Service: https://ascendtonext.vercel.app/terms
- Health Disclaimer: https://ascendtonext.vercel.app/disclaimer
- **Account deletion URL: https://ascendtonext.vercel.app/delete-account**

## Status of every requirement

| Requirement | Status | Where / notes |
|---|---|---|
| Privacy policy (public URL, accurate) | ✅ Done | `/privacy` v2.4 — discloses Supabase sync, AI providers (Groq → OpenRouter → Google Gemini), Upstash QStash scheduling, Resend email, device-only progress photos, consent-gated diagnostics, retention + user rights. Contact email constant: `src/lib/legal.ts` (`SUPPORT_EMAIL`). **Must match the email in Play Console.** |
| Terms of service | ✅ Done | `/terms` v2.4 — 13+ eligibility, medical/assumption-of-risk section, multi-provider AI terms, deletion rights. |
| Health disclaimer (fitness/nutrition ≠ medical advice) | ✅ Done | Terms §2 + `/disclaimer` page + visible line in Settings legal area + link from Settings. |
| Account deletion in-app | ✅ Done | Settings → Delete Account (typed "DELETE" confirmation). Calls `/api/auth/delete-account`, which purges **all** user tables server-side (incl. `user_feedback`, `push_subscriptions`, `notification_preferences/deliveries`) **and** the Supabase Auth user via service role, then wipes all local `ascend_*`/`sb-*` storage. |
| Account deletion web URL (Play mandatory: app name + steps + submit) | ✅ Done | `/delete-account` — describes in-app steps and offers an email-verification flow (single-use token via Resend) for users who uninstalled. |
| Minimum age 13+ | ✅ Done | Onboarding details screen rejects age < 13 with a clear message and stores nothing (also enforced in Edit Profile: 13–120). Terms state 13+ (16+ in EEA). |
| Target SDK | ✅ Done | `android/variables.gradle`: compile/target SDK **36**, min SDK 24. Meets the Play requirement (API 36, Android 16) for new apps since Aug 31, 2026. |
| Notification permission (Android 13+) | ✅ Done | `POST_NOTIFICATIONS` added to `AndroidManifest.xml`. |
| Camera permission | ✅ Done | `CAMERA` declared; `<uses-feature android.hardware.camera required="false">` added — devices without a camera can still install. |
| App name | ✅ Done | `capacitor.config.ts` `appName: 'ASCEND'`, appId `com.ascend.training`. |
| Ads / tracking SDKs | ✅ None bundled | No ad SDKs. Analytics (GA4 / Microsoft Clarity / Sentry) exist in code but load **only** with explicit user consent **and** server env configuration — the standard production build has none configured, so nothing is collected. |
| Data Safety section | 📋 Answers prepared | See below — paste into Play Console. |
| Content rating (IARC) | 📋 Guidance below | User completes in Console. |
| Health apps declaration | 📋 Guidance below | User completes in Console. |
| Signed AAB | ⛔ User only | See checklist below. `scripts/build-apk.ps1` produces a **debug APK only** — not submittable. |
| **Reminder delivery (Android app)** | ✅ Resolved — local notifications | In-app reminders are scheduled **on-device** via `@capacitor/local-notifications` (see below). Web push remains the browser/PWA path. FCM is future-only. |

## Reminder delivery — how it works now

Reminder notifications use two delivery paths:

- **Browser / PWA:** web push (VAPID) via the existing `/api/notifications/*`
  backend and QStash dispatch — unchanged.
- **Android app (Capacitor):** web push cannot deliver inside the WebView when
  the app is closed, so reminders are scheduled **on the device** with
  `@capacitor/local-notifications` (`src/lib/local-notifications.ts`). The
  on-device planner mirrors the server dispatcher's rules (training days from
  the weekly schedule, meal times, water intervals across the awake window,
  weekly report, nothing inside quiet hours) over a rolling 14-day horizon,
  re-synced on app start, on preference/schedule changes, and on every
  foreground resume. The plugin merges `POST_NOTIFICATIONS` and
  `RECEIVE_BOOT_COMPLETED` itself, so scheduled reminders survive reboot and
  fire while the app is closed.

**FCM is future-only:** native *server-initiated* push (announcements,
cloud-generated recaps sent to users who never open the app) would need
Firebase Cloud Messaging bridged to `/api/notifications/*`. It is **not**
required for the reminder features the app ships today.

## Data Safety section — prepared answers

Data is **encrypted in transit** (TLS everywhere). Users can request deletion: **Yes**
(in-app + web URL above). No data is sold. No ads.

| Data type (Play category) | Collected? | Shared? | Required/Optional | Purpose |
|---|---|---|---|---|
| Name (Personal info) | Yes, if account created | No | Optional (account) | Account management, app functionality |
| Email address (Personal info) | Yes, if account created | No | Optional (account) | Account management, account deletion verification |
| User IDs (Personal info) | Yes (Supabase account ID; anonymous guest ID on-device) | No | Required (guest ID is on-device only) | App functionality |
| Workouts, PRs, body metrics, nutrition (Health & fitness) | Yes | No | Optional (cloud sync; local-only in Guest Mode) | App functionality, personalization |
| Meal photos (Photos & videos) | Yes — only when the user uses AI meal scan; processed by Groq / Google Gemini APIs, **not stored on ASCEND servers** | Yes — with the AI service provider, for processing only | Optional (the scan feature) | App functionality |
| Progress photos | **No** — stored only on the user's device, never uploaded | No | — | — |
| Voice recordings | **No** — transcribed on-device; only the transcript text is sent for parsing | Text transcript only, to AI provider | Optional | App functionality |
| Push subscription endpoint (Device or other IDs) | Yes, if reminders enabled | Processed by Upstash QStash (scheduling) and the push service | Optional | App functionality (reminders) |
| Feedback messages (App activity / user-generated content) | Yes, if the user submits feedback | Emailed to support via Resend when configured | Optional | App functionality, support |
| Diagnostics / usage analytics | **No** in the standard build (consent-gated code, no provider configured) | No | — | If you ever set the GA/Clarity/Sentry env vars, update this answer **before** shipping that build. |
| Approximate/precise location | No | No | — | — |
| Financial info, contacts, calendar, SMS | No | No | — | — |

## Content rating guidance (IARC questionnaire)

- Category: **Utility / Health & Fitness** (not a game).
- Violence, sexual content, profanity, substances, gambling: **No** to all.
- User-generated content shared publicly: **No** (data is private to the account).
- Expected outcome: **Everyone / PEGI 3** equivalent.
- The questionnaire asks whether the app provides medical advice/diagnosis: answer
  **No** — ASCEND is tracking + general educational guidance, and says so in-app.

## Target audience

- Select **13–15, 16–17, 18+** (or simply 18+ and 13–17 bands). **Do not** select
  under-13 age groups — the app is not designed for children, onboarding blocks
  under-13, and selecting child audiences triggers the Families policy and
  Designed-for-Families requirements the app does not meet.

## Permissions declarations

| Permission | Why | Play form needed? |
|---|---|---|
| `INTERNET` | Cloud sync, AI features, Open Food Facts barcode lookup | No |
| `CAMERA` | Live barcode scanning + meal photo capture, only while the feature is in use | No (no background use). If asked: "Core functionality — user-initiated scanning." |
| `POST_NOTIFICATIONS` | User-configured workout / meal / water reminders | No declaration form; runtime prompt handled by the WebView/browser. |

## Health apps declaration (Play Console → App content → Health apps)

- Declare categories: **Activity and fitness tracking** and **Nutrition and weight management** (tracking only).
- Affirm: the app does **not** diagnose, treat, or claim to treat any medical
  condition; guidance is general educational information. This matches the in-app
  disclaimer (`/disclaimer`, Terms §2, Settings legal line).

## What ONLY the developer can do (Play Console checklist)

1. **Developer account** — create/verify a Google Play developer account ($25 one-time), complete identity verification.
2. **Create the app** — name "ASCEND", default language, app (not game), free.
3. **Signing + AAB** — generate an **upload keystore** (keep it backed up — losing it is painful), enroll in Play App Signing, build a **release AAB** (`bundleRelease` in Android Studio or Gradle) with `targetSdk 36` — Google Play rejects new apps targeting below Android 16 (API 36) since Aug 31, 2026. The repo's `build-apk.ps1` only makes a **debug APK — do not submit it**.
4. **Contact email** — set the Play Console developer contact email to match `SUPPORT_EMAIL` in `src/lib/legal.ts` (`shivamvats744@gmail.com`, temporary — user will swap in a dedicated app mailbox later; update both places together) **and make sure that mailbox actually receives mail** — reviewers and users use it, and it must match the privacy policy.
5. **App content forms** — paste in:
   - Privacy policy URL (above)
   - Account deletion URL (above)
   - Data Safety answers (table above)
   - Content rating (IARC — guidance above)
   - Target audience 13+ (above)
   - Health apps declaration (above)
   - Ads: **No ads**
   - App access: **"No login required — tap 'Continue as Guest'. All features available in guest mode; sign-in is optional cloud backup."**
   - News app: No. Government app: No. COVID-19: No.
6. **Store listing** — icon (repo has `public/icon-512.png` + maskable), feature graphic, screenshots, short/full description. Do not promise "medical" benefits. Scheduled reminders in the Android app are delivered on-device (local notifications) and are reliable; do not promise server-sent announcements (that would need the future FCM work above).
7. **Closed testing (new personal accounts)** — Play requires new personal developer accounts to run a **closed test with at least 12 opted-in testers for 14 days** before production access. Plan the calendar for it.
8. **Countries & release** — select distribution countries, complete the declarations, submit for review.

## If you change data practices later

Any new SDK, analytics provider, or data type must be reflected in **all three**
places at the same time: `/privacy`, the Data Safety answers above, and this file.
