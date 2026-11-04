# ASCEND Final Certification — Round 1c-1: Security Audit

- **Build audited:** master `62e25543` (production service worker cache `ascend-62e2554-cache`, re-verified by read-only `curl` of `/sw.js` during this round)
- **Date:** 2026-11-04
- **Scope & method:** code/policy-level review of the repository at the audited commit, plus safe read-only production checks (HTTP response headers via `curl -sI`, service-worker identity). Per the audit charter boundaries: **no attacks on production, no write attempts against the production Supabase project, no test-account creation, no credential probing.** Anything requiring live exploitation is recorded as NOT TESTED with the reason.
- **Live DB verification performed:** one read-only metadata query through the Supabase connector (service_role OpenAPI view, `GET /rest/v1/`) listing table/column names only — no row data read, nothing written. The connector holds only the service_role key, which bypasses RLS by design, so it cannot be used to probe RLS enforcement.
- **Headline result:** **No P0 and no P1 findings.** The security posture is unusually mature for a solo-built app: layered rate limiting, fail-closed AI quotas, owner-scoped RLS in the repo SQL, and zero HTML-injection sinks in the source. Residual items are P3/low observations, listed in §9.

---

## 1. Response headers & CSP

**Evidence:** `curl -sI https://ascendtonext.vercel.app/` and `curl -sI https://ascendtonext.vercel.app/api/coach` (read-only, 2026-11-04). Both responses carry the identical header set defined in `next.config.js` (`headers()` for `/:path*`); API routes additionally pass through the middleware floor (§4.1).

| Header | Production value (abridged) | Status |
|---|---|---|
| Content-Security-Policy | `default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' + allowlisted telemetry origins; script-src-attr 'none'; object-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: + supabase/OFF/google hosts; connect-src 'self' + supabase (https/wss), OFF, analytics, sentry ingest; worker-src 'self' blob:; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; report-uri /api/csp-report; report-to csp` | PASS with documented deviation (§1.1) |
| Strict-Transport-Security | `max-age=63072000; includeSubDomains; preload` | PASS |
| X-Content-Type-Options | `nosniff` | PASS |
| Referrer-Policy | `strict-origin-when-cross-origin` (and `no-referrer` + `no-store` on `/delete-account` via a route-specific header block in `next.config.js`) | PASS |
| Permissions-Policy | `camera=(self), microphone=(self), geolocation=(), interest-cohort=()` | PASS |
| X-Frame-Options | `DENY` (redundant with `frame-ancestors 'none'` — defense in depth) | PASS |
| X-XSS-Protection | `1; mode=block` | INFO — legacy header, ignored by modern browsers; harmless |
| Reporting-Endpoints | `csp="/api/csp-report"` | PASS |

### 1.1 The two deliberate CSP deviations (verified in code, accepted risk)

- **`script-src 'unsafe-inline'`** — retained on purpose and documented at length in `next.config.js`. The app's pages are statically prerendered; Next's inline flight-data scripts never receive a per-request nonce (a nonce mechanism was built and live-tested on 2026-10-29: nonce present in the header, on 0 of 8 inline scripts served). Removing `'unsafe-inline'` without forcing app-wide dynamic rendering would break hydration. Compensating controls verified in this round: zero `dangerouslySetInnerHTML`/`__html`/`eval` sinks in `src` (§7), `script-src-attr 'none'`, `object-src 'none'`, and live violation reporting to `/api/csp-report`.
- **`'wasm-unsafe-eval'` scope** — present **only** in `script-src`. It permits `WebAssembly.instantiateStreaming/compileStreaming` (required by the MediaPipe Pose Landmarker used by Form Coach) and does **not** enable JavaScript `eval()` — there is no `'unsafe-eval'` token anywhere in the policy. Correctly minimal.

**Finding SEC-1c-01 (Info):** header/CSP posture is complete and consistent between page and API responses; the two deviations above are engineered decisions with working compensations, not oversights.

## 2. Dependencies

**Method disclosure:** `npm audit` could **not** be run in this sandbox — the egress proxy refuses the npm advisory endpoint (`403 policy_denied` on `POST /-/npm/v1/security/audits/quick`), and direct egress fails TLS. As an equivalent, every package+version in `package-lock.json` at the audited commit was queried against the **OSV.dev** advisory database (the same upstream data npm audit draws on, via a different endpoint):

| Tree | Packages scanned | Packages with known vulns | Critical | High | Moderate | Low |
|---|---|---|---|---|---|---|
| Production (`dependencies`, incl. transitive) | 160 | **0** | 0 | 0 | 0 | 0 |
| Full tree (incl. devDependencies) | 621 | 2 | 0 | 0 | 2 | 0 |

The two full-tree hits are dev-tooling only and do not ship:
- `glob@13.0.6` — GHSA-3g3m-2fjr-6pw4 (moderate; AbortSignal cancellation bypass → post-timeout filesystem traversal in glob CLI contexts)
- `minimatch@3.1.5` — GHSA-g3hv-75wg-m249 (moderate; ReDoS via globparts amplification)

**Finding SEC-1c-02 (Pass):** production dependency tree has zero known vulnerabilities as of 2026-11-04; two moderate dev-only advisories exist for routine patching. (An `npm audit` run in CI — where the registry endpoint is reachable — remains the canonical check; NOT RUN here for the environment reason above.)

## 3. Secrets in the repository

**Evidence:** `git grep` over the tracked tree for key-shaped material (`sk-…`, `AKIA…`, PEM private-key blocks, hardcoded `service_role` assignments, long JWT-shaped strings), `git ls-files` for env files, and `.gitignore` review.

- The only JWT-shaped strings in the repo are the **public Supabase demo keys** in `tests/security-integration-gate.test.ts:13,15` (issuer `supabase-demo` — the well-known local-development demo credentials published by Supabase itself). They are not the production project's keys. **Not a finding.**
- No private keys, cloud access keys, or provider API keys anywhere in tracked source.
- Only `.env.example` is tracked. `.gitignore` covers `.env` and `.env*` (with the example presumably force-added/negated).
- `SUPABASE_SERVICE_ROLE_KEY` is *referenced* (env lookup only, never a literal) in exactly six server-side modules: the five API routes that need it (`auth/delete-account`, `feedback`, `notifications/dispatch`, `notifications/preferences`, `notifications/subscribe`) and `src/lib/rate-limit.ts`. Import-graph check: `rate-limit.ts` is imported only by API routes and `src/middleware.ts` — never by a client component. Client error components (`src/app/error.tsx`, `global-error.tsx`, `components/ErrorState.tsx`) import only the pure `redactSecrets` function from `src/lib/server-security.ts`; that module contains no key material (its key getters read `process.env` at runtime, which is undefined for non-`NEXT_PUBLIC_` names in a browser bundle), so nothing secret can ship to the client through it.

**Finding SEC-1c-03 (Pass):** no secret material in the repository; the service-role key is confined to server-only modules.

## 4. API routes

### 4.1 Central floor — `src/middleware.ts`

Every `/api/*` request passes an edge middleware that (a) applies a per-IP ceiling of **300 req/min** *before* routing, and (b) **404s any path not in a 13-route allowlist** (`KNOWN_API_ROUTES`, `src/middleware.ts:38`) that exactly matches the route inventory in `src/app/api`. The rate-limit key is the first `x-forwarded-for` entry, accepted only if it parses as an IP (`clientIp`, validated format); there is deliberately **no `x-real-ip` fallback** (not set by Vercel's edge, hence spoofable). Limiter is per-instance in-memory at the edge — a floor, with the stricter distributed limiter below it.

### 4.2 Distributed limiter — `src/lib/rate-limit.ts`

Per-route limits run through `checkRateLimit` (`src/lib/rate-limit.ts:274`), backed by the Supabase RPC `ascend_check_rate_limit` (SECURITY DEFINER, §6) via the service-role key, with an anchored fixed-window in-memory fallback. Design points verified:

- **Fail-closed option:** AI routes and other expensive paths pass `failClosed: true` — if the distributed limiter is unreachable *or the service key is absent entirely*, the check throws and the route returns **503** instead of silently degrading to per-instance counting (which would multiply caps by instance count).
- **IP extraction** (`getClientIp`, `src/lib/rate-limit.ts:132`) trusts only the first `x-forwarded-for` entry and only when it parses as an IP; `cf-connecting-ip`/`x-real-ip` are explicitly rejected as spoofable on this host. Unparseable → single shared `127.0.0.1` bucket (fail-safe, not a bypass).

### 4.3 Per-route review (all 13 routes read in full)

| Route | Auth | Validation | Rate limit | Notes |
|---|---|---|---|---|
| `POST /api/ai/scan-meal` | Optional Bearer (quota tier); bad token → 401 | MIME allowlist (jpeg/png/webp/heic/heif); 10 MB image cap; streaming-capped body reads (12 MB multipart / 16 MB JSON); notes ≤1000 chars; hidden ingredients ≤30×100 chars | 20/min/IP, fail-closed + per-actor daily quota | Model output sanitized + totals recomputed server-side (§5) |
| `POST /api/ai/coach` (also exported as `/api/coach`) | Same quota scheme | 64 KB body cap; field truncations (context 10k, instruction 1k, exercise 150) | 25/min/IP, fail-closed + quota | Output schema-validated + guardrail-scanned before return (§5) |
| `POST /api/ai/coach-chat` | Same quota scheme | 2,000-char message (per `COACH_CHAT_MAX_MESSAGE_CHARS` enforcement), history sanitized + capped, context ≤12,000 chars, evidence ≤30 strings | 10/min/IP fail-closed + 30/day/IP chat cap + quota | Safety stop & topic gate run *before* any provider call (§5) |
| `POST /api/ai/parse-meal` | Same quota scheme | 4 KB body cap; query ≤500 chars | 25/min/IP, fail-closed + quota | Model items clamped to sane maxima; totals recomputed |
| `POST /api/ai/parse-voice` | Same quota scheme | 4 KB body cap; transcript ≤1,000 chars | 25/min/IP, fail-closed + quota | Output clamped (weight 0..500 kg-equiv, reps 1..1000, RPE 1..10) before the client auto-applies it |
| `GET /api/barcode` | None (public data) | Code sanitized to digits only, length 5–30; upstream URL is a fixed host with the sanitized code interpolated | 60/min/IP (not fail-closed) | Proxies Open Food Facts v2→v0 with 6.5 s aborts both stages; no SSRF surface (fixed host, digits-only path segment) |
| `POST /api/feedback` | Optional Bearer — valid token anchors identity (email forced from session); guests accepted as anonymous | 32 KB streamed body cap; `sanitizeFeedbackSubmission` caps every field and allowlist-filters guest diagnostics | 10/10 min/IP (not fail-closed) | Inserts via service role; user content HTML-escaped into the notification email (§7). Documented deliberate exception: keeps an anon-key fallback for the DB insert (fails soft to email-only) — see route header comment; accepted design, flagged here for the record |
| `POST /api/auth/delete-account` | **Required:** verified Bearer token *or* single-use signed deletion token (15-min, nonce-consumed); email alone never authorizes; body email must match authenticated identity (403 otherwise) | 64 KB body cap | 5/15 min/IP | Enumeration-safe verification flow (identical 200 copy + timing normalization delay); refuses with 503 in production if the service key is missing rather than running a doomed anon purge; per-table results redacted; partial deletion = HTTP 207 with honest status, never a false success |
| `POST /api/notifications/dispatch` | **Required:** QStash signature (Upstash `Receiver.verify`) *or* `CRON_SECRET` Bearer compared with `crypto.timingSafeEqual`; fails closed with 500 if no auth is configured at all | Body read capped at 64 KB *before* signature verification | None (deliberate: secret-authenticated; QStash egress IPs rotate) | Aggregate-counters-only response; expired subscriptions (404/410) reaped |
| `POST/DELETE /api/notifications/subscribe` | Optional Bearer; ownership enforced | Endpoint must match a recognized web-push service URL shape; encryption keys required | 30/min/IP both verbs | Upsert cannot re-own or null out another account's subscription (403 `ENDPOINT_OWNED`, lookup errors fail closed); unsubscribe requires the per-subscription delete token (SHA-256 hash stored) or verified ownership; refuses anon-key fallback for writes (503) |
| `GET/POST /api/notifications/preferences` | POST requires verified Bearer (401 otherwise — no silent discard); GET returns only the shared defaults constant when unauthenticated | Full allowlist validator: enum days, `HH:MM` regex times, boolean types; invalid fields fall back to defaults | 30/min/IP both verbs | No per-user data is exposed unauthenticated |
| `POST /api/csp-report` | None (browser report sink) | 32 KB body cap; logged content redacted and CR/LF-stripped (log-injection guard) | 60/min/IP | Always 204 |

**Cross-route observations:**

- **Error leakage (P3, SEC-1c-04):** several routes return `redactSecrets(error.message)` in 500 bodies (e.g. `scan-meal`, `ai/coach`, `parse-meal`, `parse-voice`, notification routes). `redactSecrets` (`src/lib/server-security.ts`) strips provider key shapes, JWTs, bearer tokens and `key=`/`token=`-style assignments, so no credential leakage was found — but upstream provider/internal error text can still disclose operational detail (provider names, upstream status text). Low impact; a fixed generic message (the pattern `feedback` and `barcode` already use) would be tighter.
- **User-context scoping:** no route accepts a client-supplied user id for data access. The AI quota module is explicit about this: identity comes only from a Supabase-verified Bearer token or a server-derived `sha256(ip)` guest bucket (`src/lib/ai-quota.ts`); forged identity headers/body fields are never read, and a present-but-unverifiable token fails closed with 401 rather than downgrading to guest.
- **Non-fail-closed routes** (barcode, feedback, delete-account, notifications, csp-report) degrade to per-instance in-memory limits if the distributed backend is down. This is a documented, deliberate availability trade-off for cheap/public endpoints; the expensive and destructive paths (all AI routes) fail closed. Info only.

## 5. AI routes — prompt injection & the meal-photo rule

- **System prompts are server-side constants** in every AI route. Client input is interpolated only into delimited, labelled blocks (`<user_command>`, `<athlete_context>`, `<user_substitution>`) with explicit instruction-isolation text in the system prompt: enclosed text is passive data, never instructions.
- **Coach chat goes further** (`src/app/api/ai/coach-chat/route.ts`): the client-supplied `contextText` is screened by `findContextDirective` for instruction-like directives (override attempts, prompt extraction, role reassignment) and declined with static copy *before* any provider call; a deterministic topic gate (`isCoachChatInScope`) and a safety stop (pain/injury/disordered-eating → static refer-out, no model involved) also run pre-provider. Model replies are length-capped, stripped of model-written citations, scanned against health guardrails (`violatesCoachGuardrails`) and replaced with a static fallback on violation.
- **Legacy coach route** (`/api/ai/coach`) validates model JSON against per-task schemas (`validateCoachOutput`) and applies the same guardrail scan; the free-text `WORKOUT_COMMAND` channel gets the deterministic safety stop pre-provider.
- **Cost abuse:** three layers, all enforced before provider calls — per-minute IP limits (§4), per-actor daily quotas (signed-in 50/day, guest 10/day defaults; `src/lib/ai-quota.ts`), and a **fleet-wide 500/day cap** inside the provider layer (`DEFAULT_AI_DAILY_GLOBAL_CAP`, `src/lib/ai-provider.ts:27`, asserted by `assertAiDailyBudget` before every cascade). Residual risk is documented in the module itself: a sufficiently distributed caller can still exhaust the shared pool; per-actor caps raise the cost, they don't eliminate it.
- **Meal-photo provider rule — VERIFIED COMPLIANT.** The standing rule is that meal photos must never go to free-tier/third-party-logging vision models. In code: `OPENROUTER_VISION_MODELS` is an **empty array** (`src/lib/ai-provider.ts:172`), the vision cascade skips OpenRouter unless that list is non-empty (`src/lib/ai-provider.ts:433`), and `callOpenRouterVision` additionally throws on any model id ending in `:free` as a belt-and-braces guard. Meal photos therefore reach only first-party endpoints: **Groq** (`qwen/qwen3.8-27b`) and **Google Gemini** (`gemini-3.1-flash-lite`, `gemini-3.5-flash-lite`). OpenRouter `:free` models appear only in `OPENROUTER_TEXT_MODELS` — text-only routes (meal *text* parsing, coach), carrying no photo data.

**Finding SEC-1c-05 (Pass):** prompt-injection posture and photo-handling rules are implemented in code as designed, with pre-provider deterministic gates rather than prompt-only defenses.

## 6. Auth, session & account isolation (code level)

- **Client** (`src/lib/supabase/client.ts`, `config.ts`): browser client is constructed with the **anon key only**; `getSupabase()` returns null server-side. In production, credentials resolve from environment variables only — the localStorage custom-endpoint fallback is compiled to development builds and host-validated (`*.supabase.co` over https) even there. Session persistence is supabase-js default (localStorage) with auto-refresh.
  - *Observation (Info):* localStorage-held session tokens are readable by any JavaScript running on the origin, which raises the stakes of any future XSS. Current compensations are strong (zero injection sinks, §7; restrictive CSP, §1). Recorded as a standing consideration, not a defect.
- **Sign-out** (`SyncEngine.signOut`, `src/lib/supabase/sync.ts:831`): sets the `ascend_logged_out` flag (rehydration is explicitly blocked from resurrecting the old profile while it is set), ends the Supabase session, and — only when the user chooses the data-clearing path — purges local data via `purgeLocalAppData()` (`src/lib/storage.ts:66`): every `ascend_*` localStorage key except a small preserved set (backend config, theme, the logged-out flag itself), **plus Cache Storage** (`purgeAppCaches` deletes all `ascend-…-cache` caches, so service-worker-cached content does not survive a purge on a shared device). Default sign-out keeps local data — the correct behavior for an offline-first app whose data is the user's own.
- **Guest → account merge:** on sign-in the sync pull distinguishes a *guest migration / same-account* merge from a *cross-account switch* (`isCrossAccountSwitch`, `src/lib/supabase/sync.ts:1139`). Merge = union with tombstone protection (locally deleted rows are never resurrected; per-row newest-wins by `updatedAt`). Cross-account switch = replace semantics (the new account's server state wins), still filtered by local tombstones. No path was found by which account A's rows are written under account B's id: all cloud writes are keyed by the verified session user, and RLS (§6/§7 of the database doc) constrains rows to `auth.uid()`.

## 7. RLS & policies (repo SQL)

Full inventory in `database-integrity.md` §1/§3; security summary:

- **RLS is enabled on all 16 tables** in the repo SQL (`supabase/schema.sql` + migrations).
- **Every user-data table** (profiles, personal_records, workouts, meals, body_metrics, daily_habits, planned_workouts, custom_barcodes, coach_blocks, weekly_reviews, notification_preferences) has a single owner-scoped policy: `FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)` (profiles: `auth.uid() = id`). `notification_deliveries` is owner SELECT-only. No permissive (`USING (true)`) policy exists for any client role on any user table.
- **Server-only tables** (`api_rate_limits`, `consumed_deletion_nonces`, `user_feedback`, `push_subscriptions`, `notification_deliveries`) are service-role mediated: migration `2026101805` revokes all direct table privileges from `anon`/`authenticated` on the infrastructure tables and grants service_role only the operations the routes demonstrably use (least privilege). `api_rate_limits` has RLS on and **no client policy at all** — reachable only via the SECURITY DEFINER RPC or service role.
- **Historical permissive policies were closed:** the original guest-manageable `push_subscriptions` policy (`user_id IS NULL OR auth.uid() = user_id`, to anon+authenticated, 20261014) was dropped and replaced in `2026101803`; the original public INSERT policy on `user_feedback` was dropped in `2026101804`, leaving service-role-only access (the feedback route inserts with the service key or fails soft to email).
- **SECURITY DEFINER functions** (`ascend_check_rate_limit`, `claim_notification_delivery`, `cleanup_expired_deletion_nonces`) are hardened with `SET search_path = public, pg_temp` (`2026101803`; `schema.sql:331`), and `schema.sql:403` revokes EXECUTE on administrative definer functions from `anon`/`authenticated`.
- **coach tables (§16):** migration `2026102701_add_coach_tables_and_plan_extras.sql` is present in the repo and mirrors `schema.sql` §16; its header states it is never auto-applied (owner's dashboard action). **Live state verified read-only in this round:** `coach_blocks` and `weekly_reviews` **exist on the live project** with the expected columns, and `planned_workouts.extras` is present — so the tables were created live at some point. What remains unverified is the F-11 live round-trip and the live policy state (see NOT TESTED).

**No P1 candidate found:** no table in the repo SQL lacks RLS, and no client-facing policy is permissive.

## 8. XSS & injection surfaces

- **`dangerouslySetInnerHTML`: zero occurrences in `src`** (the single grep hit is a comment in `src/app/layout.tsx` explaining that the former inline theme script was moved to `public/theme-init.js`). No `__html` props, no `eval(`, no `new Function(` anywhere in `src`.
- **User content** (athlete names, workout/meal names, notes, feedback text) renders through React, which escapes by default; no raw-HTML rendering path exists.
- **Feedback email:** all interpolated user fields pass through `escapeHtml` in the route before entering the HTML email body.
- **URL parameters:** `?screen=` in onboarding is validated against a fixed allowlist of screen ids (`src/components/Onboarding.tsx:132`). OAuth `error`/`error_description` params are **never rendered verbatim** — neutral copy is shown and the URL is scrubbed via `history.replaceState`. The account-deletion token travels in the **URL fragment** (`#token=…`, `src/lib/deletion-url.ts`), which browsers never send to servers, so it cannot land in access logs; query-string tokens are deliberately never read.
- **Backup import** (the largest untrusted-file surface): 10 MB hard cap (`MAX_BACKUP_IMPORT_BYTES`, `src/lib/storage.ts:419`, tightened from 50 MB), shape gate requiring at least one recognized ASCEND field, and a recursive sanitizer (`sanitizeImportObject`, `src/lib/storage.ts:374`) that builds null-prototype objects and strips `__proto__`/`constructor`/`prototype` keys at any depth, plus credential-shaped keys (`customGeminiKey`, `apiKey`, `token`, `password`, `secret`) on both export and import. Progress photos are shape-filtered to `data:image/` URLs and capped at 24.
- **Share image** (`WeeklyRecapModal`): rendered from React DOM to PNG via html-to-image — user text reaches the image only as React-escaped DOM text; no HTML string is constructed.
- **SQL injection:** all database access is via supabase-js query builders / RPC parameters; no string-built SQL exists in application code.

**Finding SEC-1c-06 (Pass):** no injection sink found in the application source.

## 9. Privacy & data exposure

- **GA4** (`src/lib/telemetry.ts`, `TelemetryProvider.tsx`): loads **only after explicit consent** (`ascend_telemetry_consent === 'accepted'`); `anonymize_ip: true`; `ad_storage` denied even on acceptance. `trackSafeEvent` additionally blocklists any parameter whose name contains weight/rep/exercise/calorie/macro/email/name/note/food/message — event payloads are allowlisted UI events by design.
- **Vercel Analytics:** behind the same consent gate (deliberately — the project's privacy promise is no telemetry of any kind before opt-in).
- **Microsoft Clarity:** code loads it only if `NEXT_PUBLIC_CLARITY_ID` is configured *and* consent is accepted. Per project records Clarity is **not enabled** in production. **Observation (P3, SEC-1c-07):** Clarity is a session-replay tool; if it is ever enabled it would record screens containing health data. Recommendation: keep it disabled, or configure masking before enabling. (Production env values are not readable from this environment — status per project records, NOT independently verified.)
- **Sentry:** loaded as the browser CDN loader, again only after consent; there is **no `@sentry/*` package and no app-level `beforeSend` scrubber in the repo** — error reports rely on the loader's defaults and can include page URLs and console/network breadcrumbs. **Observation (P3, SEC-1c-08):** consider a scrubbing hook before widening Sentry use; current exposure is limited to error contexts, and server-side logs uniformly pass through `redactSecrets`.
- **Server logging:** provider errors are logged through `redactSecrets` everywhere checked; the CSP report sink additionally strips CR/LF (log forging) and caps length.
- **Local storage inventory** (keys observed in `src`; all under the `ascend_` namespace on the app origin, unencrypted at rest — the standard local-first PWA posture; device compromise is out of the app's control, and the purge path in §6 exists for shared devices):
  - `ascend_store` — the full athlete dataset (profile, workouts, PRs, meals, body metrics, habits, plans, coach state)
  - Discrete mirrors/fallbacks: `ascend_profile`, `ascend_prs`, `ascend_workouts`, `ascend_meals`, `ascend_custom_barcodes`, `ascend_emergency_snapshot`, `ascend_progress_photos_v1` (progress photos as data URLs), `ascend_active_draft` (in-progress workout)
  - Preferences/flags: `ascend_theme`, `ascend_has_custom_theme`, `ascend_notification_prefs`, `ascend_telemetry_consent`, `ascend_logged_out`, `ascend_guest_id`, tab/subtab memory keys, tips/prefs-asked flags
  - `ascend_supabase_url` / `ascend_supabase_anon_key` — dev-only custom-endpoint config (§6); preserved across data purges by design
  - Supabase session (`sb-…-auth-token`, managed by supabase-js) — access/refresh tokens
  - No IndexedDB usage exists in `src`.

## 10. Findings summary

| ID | Severity | Finding | Status |
|---|---|---|---|
| — | **P0** | **None** | — |
| — | **P1** | **None** | — |
| SEC-1c-04 | P3 | Several API routes return redacted internal/provider error text in 500 bodies; generic fixed messages (already used by `feedback`/`barcode`) would disclose less operational detail | Open — cosmetic hardening |
| SEC-1c-07 | P3 | Clarity session-replay is code-supported; enabling it without masking would expose health-data screens (currently not enabled, per project records) | Open — keep disabled / mask first |
| SEC-1c-08 | P3 | Sentry browser loader has no app-level `beforeSend` PII scrubber in the repo; error payloads may include URLs/breadcrumbs | Open — add scrubber if Sentry use widens |
| SEC-1c-01/02/03/05/06 | Pass | Headers/CSP; dependency tree (0 prod vulns via OSV); no repo secrets; AI prompt-injection + meal-photo rule; zero injection sinks | Verified |
| Info | Info | `X-XSS-Protection` legacy header; localStorage session tokens (supabase-js default) with strong compensations; non-fail-closed limiter degradation on cheap public routes (deliberate) | Recorded |

## 11. NOT TESTED (with reasons)

| Item | Reason |
|---|---|
| Live RLS enforcement probes (cross-user reads/writes with anon or another user's token) | Charter boundary: no test-account creation, no credential probing; the available connector holds only the service_role key, which bypasses RLS by design and therefore cannot validate it |
| Live policy/grant state inside the production database | No SQL-level read access in bounds this round; repo SQL is the evidence base, live tables/columns verified via OpenAPI metadata only |
| F-11 live Supabase round-trip for coach blocks sync | Requires a signed-in non-service-key session against the live DB (see above) |
| Live auth flows (password reset, OAuth round-trip, session expiry behavior) | Would require accounts/interaction with the production auth system — out of bounds |
| `npm audit` proper | Sandbox egress policy blocks the npm advisory endpoint; OSV.dev batch query used as the equivalent (same advisory corpus) |
| Production telemetry env configuration (whether Clarity/Sentry IDs are set in Vercel) | Vercel project env is not readable from this environment; assessed from code + project records |
| Penetration testing / active exploitation of any item above | Explicitly out of scope for this certification round |
