# Performance Audit — ASCEND Final Certification, Round 1c-2

- **Build audited:** master `62e25543`, local production build.
  **Every timing in this document is a LOCAL-BUILD LAB number**:
  loopback HTTP to `next start` on a shared, CPU-only VM, headless
  Chromium. They are floors, useful for relative comparisons and
  payload accounting — **they are not production field data** and say
  nothing about a mid-range phone on a 4G connection. Payload sizes
  (bytes on the wire) *are* build facts and transfer to production
  unchanged, modulo CDN compression parity.
- Production spot checks (§5) were made with curl from this sandbox —
  through its egress proxy, which inflates latency; noted inline.

## 1. Bundle facts (from the audited build output)

| Measure | Value |
|---|---|
| JS chunks (`.next/static/chunks`, 66 files) | 4,157,323 B raw / **1,090,232 B gzip** total |
| CSS (all chunks) | 102,018 B raw / 17,249 B gzip |
| Root main files (framework + shared, 5 files) | 442,275 B raw / 131,638 B gzip |
| Largest single chunk | `2t7f…js` — 353,285 B raw / 112,416 B gzip (app code + English dictionary) |

The 1.09 MB gzip total is the *whole application* — every tab, modal
and the Form Coach UI — split across 66 chunks; what a first load
actually transfers is measured in §2.

## 2. First-load transfer (measured, browser network + resource timing)

| | Cold (fresh profile → onboarding entry) | Warm (returning, onboarded → app shell) |
|---|---|---|
| Scripts loaded | 27 | 33 |
| **Script transfer (encoded)** | **572 KiB** | **606 KiB** |
| Total transfer (all resources) | 636 KiB | 670 KiB |
| DOMContentLoaded | 250 ms | 263 ms |
| Load event | 687 ms | 302 ms |
| First paint / FCP / LCP | 392 ms | 280 ms |
| Long tasks (>50 ms) during load + 4 s | 3 (98 / 182 / 76 ms) | 2 (169 / 80 ms) |
| Service worker controlling | yes (registered on first load) | yes |
| MediaPipe requests | **0** | **0** |

Largest scripts on the wire (encoded / decoded): `2t7f` 112,707 /
353,285 · `2mx7` 73,237 / 233,875 · **`2haj` 63,744 / 294,489 (Hindi
dictionary — §3)** · `0woc` 63,042 / 243,566 · `1n7l` 43,484 /
190,620 · `2gfs` 41,385 / 150,383 · `2nyo` 33,494 / 145,327.

The long tasks are startup hydration + first render on this VM's
shared CPU; their count (2–3) and size (≤182 ms) are recorded as lab
observations, not as an interaction-latency verdict.

## 3. PERF-2 — verified and quantified (P3)

The known PERF-2 item (inactive i18n dictionary) is **confirmed in the
audited build, end-to-end**:

- `src/lib/i18n/index.ts` statically imports **both** dictionaries
  (`en.ts` 183 KB source, `hi.ts` 313 KB source), so the Hindi
  dictionary is bundled for every user.
- Its chunk (`2hajkbvkwoigj.js`, 294,489 B raw / 64,960 B gzip on
  disk) was observed **in the initial network load of an
  English-language session in both profiles** — 63,744 B encoded on
  the wire, the 3rd-largest script transferred, ≈11 % of the cold
  script payload.
- The "~65 KB gzip" figure carried since the pre-Play program is
  accurate (64,960 B). Lazy-loading the non-active dictionary remains
  the single largest identified payload saving; nothing else in the
  load is comparably wasteful.

## 4. Asset weights (`public/`)

| Asset | Size | Loading |
|---|---|---|
| `mediapipe/` total | 25,208,837 B | **Lazy — confirmed** (below) |
| — `wasm/` (both SIMD + noSIMD builds) | 19,431,091 B | one variant fetched at runtime (~9.2 MB) |
| — `models/pose_landmarker_lite.task` | 5,777,746 B | fetched with the wasm |
| `images/splash-athlete.jpg` (only raster) | 532,382 B | splash screen only |
| Icons (svg + png set) | ~250 KB total | manifest/browser |
| Fonts (`.next/static/media`, all subsets/families) | 440,364 B on disk | self-hosted woff2 via `next/font` |

- **MediaPipe laziness is verified three ways:** (1) zero
  `mediapipe` requests in both measured first loads; (2) the service
  worker's 33-entry precache contains no MediaPipe (or image) entries
  — it is shell-only; (3) code: the pose stack loads from
  `src/features/form-coach/services/pose/PoseLandmarkerService.ts`
  when the feature opens. First Form Coach use therefore downloads
  ≈**15.0 MB** (one 9.2 MB wasm variant + 0.2 MB JS glue + 5.6 MB
  model) — a one-time, on-demand cost, correctly kept out of the
  initial load; its download *time* on a real network was not
  measured.
- Fonts: Inter (`display: optional`), Barlow Condensed, and Noto Sans
  Devanagari (`preload: false`, `display: swap`) are self-hosted;
  browsers fetch only the subsets a page's glyphs need, so the
  440 KB disk total is not a per-load figure.
- Exercise demos are inline SVG/SMIL (code) — no media weight.

## 5. Production spot checks (curl, via sandbox proxy)

- `GET https://ascendtonext.vercel.app/` → 200; **TTFB 1.46 s**,
  total 1.46 s; HTML **4,047 B gzip** (18,015 B uncompressed) — a
  thin SPA shell, as expected.
- `GET /sw.js` → 200; TTFB 0.87 s; 2,854 B gzip; served cache name
  `ascend-62e2554-cache` — production is exactly the audited commit.
- Caveat: both timings traverse this sandbox's egress proxy and a
  cold TLS handshake from an unusual geography; treat them as "the
  documents are small and served", **not** as user-perceived latency.

## 6. Local data weight (measured)

The onboarded audit profile's `localStorage` totals **19,011 B**
across 7 keys — `ascend_store` 12,164 B (profile, 4 plans,
preferences), `ascend_emergency_snapshot` 6,205 B, the rest small.
There is no storage pressure at onboarding scale. The store is a
single JSON document (zustand persist), so multi-year history growth
is linear in logged data; heavy-use store size and its parse cost
were **not measured** (no synthetic multi-year profile was built).

## 7. NOT TESTED / not measured

- **Production field performance** — no CrUX/RUM data, no real-user
  timings; the §2 numbers must not be quoted as production speed.
- Real-device CPU/network behaviour (mid-range Android on 4G is the
  demographic case) — no hardware available.
- Lighthouse — not present in this environment; paint timings here
  come from the Navigation/Performance Timing APIs only.
- Interaction latency (INP-class) beyond the load-time long-task
  counts in §2; tab-switch and workout-logging responsiveness were
  exercised functionally in Round 1b-2 but not instrumented.
- Form Coach first-use download duration and pose-inference frame
  rate on any hardware (the VM's SwiftShader path was already shown
  non-representative in the PR #93/#94 work).
- Bundle delta vs the November 1 certification build — the earlier
  program did not record a comparable chunk inventory, so no honest
  trend line exists.
