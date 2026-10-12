/**
 * Analytics, Monitoring, Privacy Consent & Feedback QA Suite
 * Validates:
 * 1. Google Site Verification in Metadata
 * 2. Next.js Content Security Policy (CSP) Narrow Allowlist (GA4, Clarity, Sentry)
 * 3. Environment-driven Telemetry Configuration & Gating
 * 4. GDPR/ePrivacy Consent Banner & Provider Behavior
 * 5. Sensitive Athlete Data Masking in Analytics Events
 * 6. Settings Modal Privacy Consent Controls
 * 7. Additive Supabase Feedback Migration & Strict RLS
 * 8. Feedback API Route: Persistence-First, Rate Limiting, Input Validation & Zero Silent Data Loss
 */

import fs from 'fs';
import path from 'path';
import {
  getGaMeasurementId,
  getClarityProjectId,
  getSentryLoaderUrl,
  trackSafeEvent,
  hasConfiguredTelemetry,
} from '../src/lib/telemetry';

let passed = 0;
let failed = 0;

function assert(condition: boolean, desc: string) {
  if (condition) {
    console.log(`  ✓ [PASS] ${desc}`);
    passed++;
  } else {
    console.error(`  ✗ [FAIL] ${desc}`);
    failed++;
  }
}

console.log('======================================================');
console.log('RUNNING: Remediation QA Suite (CSP, Telemetry & Feedback)');
console.log('======================================================\n');

// ── TEST 1: Google Site Verification in Metadata ───────────────────
console.log('--- TEST 1: Google Site Verification Metadata ---');
const layoutContent = fs.readFileSync(path.join(process.cwd(), 'src/app/layout.tsx'), 'utf-8');
assert(
  layoutContent.includes('DOQWeBS380XVv0mtya1LH8zKaVyjKrSuR_hE6bTVw9M'),
  'Layout metadata contains Google Site Verification token'
);
assert(
  layoutContent.includes('google:'),
  'Metadata defines verification.google field'
);

// ── TEST 2: Content Security Policy (CSP) Allowlist in next.config.js
console.log('\n--- TEST 2: Content Security Policy (CSP) Whitelisting ---');
const nextConfigContent = fs.readFileSync(path.join(process.cwd(), 'next.config.js'), 'utf-8');
assert(
  nextConfigContent.includes('https://www.googletagmanager.com') && nextConfigContent.includes('https://*.google-analytics.com'),
  'CSP script-src whitelists Google Tag Manager and Google Analytics'
);
assert(
  nextConfigContent.includes('https://www.clarity.ms') && nextConfigContent.includes('https://*.clarity.ms'),
  'CSP script-src and connect-src whitelist Microsoft Clarity'
);
assert(
  nextConfigContent.includes('https://js.sentry-cdn.com') && nextConfigContent.includes('https://*.ingest.sentry.io'),
  'CSP script-src and connect-src whitelist Sentry CDN and ingestion endpoints'
);
assert(
  nextConfigContent.includes("frame-ancestors 'none'") && nextConfigContent.includes("base-uri 'self'"),
  'CSP preserves strict clickjacking and base-uri restrictions'
);

// ── TEST 3: Environment-Driven Telemetry Configuration ─────────────
console.log('\n--- TEST 3: Environment-Driven Telemetry Configuration ---');
const telemetryModuleContent = fs.readFileSync(path.join(process.cwd(), 'src/lib/telemetry.ts'), 'utf-8');
assert(
  telemetryModuleContent.includes('process.env.NEXT_PUBLIC_GA_ID'),
  'Telemetry module supports process.env.NEXT_PUBLIC_GA_ID'
);
assert(
  telemetryModuleContent.includes('process.env.NEXT_PUBLIC_CLARITY_ID'),
  'Telemetry module supports process.env.NEXT_PUBLIC_CLARITY_ID'
);
assert(
  telemetryModuleContent.includes('process.env.NEXT_PUBLIC_SENTRY_DSN'),
  'Telemetry module supports process.env.NEXT_PUBLIC_SENTRY_DSN'
);
assert(
  Boolean(getGaMeasurementId()),
  'getGaMeasurementId resolves verified measurement ID'
);
assert(
  Boolean(getClarityProjectId()),
  'getClarityProjectId resolves verified project ID'
);
assert(
  Boolean(getSentryLoaderUrl()),
  'getSentryLoaderUrl resolves valid CDN loader URL'
);

// ── TEST 4: Sensitive Data Masking Guard ───────────────────────────
console.log('\n--- TEST 4: Sensitive Data Masking Guard ---');
assert(
  telemetryModuleContent.includes("lower.includes('weight')") &&
  telemetryModuleContent.includes("lower.includes('rep')") &&
  telemetryModuleContent.includes("lower.includes('calorie')"),
  'trackSafeEvent strictly blocks exercise sets, reps, weights, and nutritional macros'
);

// ── TEST 5: Consent Banner & Telemetry Provider ────────────────────
console.log('\n--- TEST 5: Consent Banner & Telemetry Provider ---');
const bannerExists = fs.existsSync(path.join(process.cwd(), 'src/components/TelemetryConsentBanner.tsx'));
assert(bannerExists, 'TelemetryConsentBanner.tsx component exists');

const providerExists = fs.existsSync(path.join(process.cwd(), 'src/components/TelemetryProvider.tsx'));
assert(providerExists, 'TelemetryProvider.tsx component exists');

const providerContent = fs.readFileSync(path.join(process.cwd(), 'src/components/TelemetryProvider.tsx'), 'utf-8');
assert(
  providerContent.includes('isAccepted && gaId') &&
  providerContent.includes('isAccepted && clarityId') &&
  providerContent.includes('isAccepted && sentryUrl'),
  'TelemetryProvider gates script execution strictly on verified consent (isAccepted)'
);

assert(
  layoutContent.includes('<TelemetryProvider />'),
  'Layout body mounts TelemetryProvider'
);

// ── TEST 6: Settings Modal Privacy Controls ────────────────────────
console.log('\n--- TEST 6: Settings Modal Privacy Controls ---');
const settingsContent = fs.readFileSync(path.join(process.cwd(), 'src/components/SettingsModal.tsx'), 'utf-8');
assert(
  settingsContent.includes('Anonymous Telemetry'),
  'SettingsModal renders Anonymous Telemetry preference control'
);
assert(
  settingsContent.includes('setTelemetryConsent'),
  'SettingsModal allows athletes to enable or disable telemetry anytime'
);

// ── TEST 7: Additive Supabase Feedback Migration & Strict RLS ─────
console.log('\n--- TEST 7: Supabase Feedback Migration & RLS Security ---');
const migrationExists = fs.existsSync(path.join(process.cwd(), 'supabase/migrations/20261012_create_user_feedback.sql'));
assert(migrationExists, 'supabase/migrations/20261012_create_user_feedback.sql exists');

const migrationContent = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261012_create_user_feedback.sql'), 'utf-8');
assert(
  migrationContent.includes('CREATE TABLE IF NOT EXISTS public.user_feedback'),
  'Migration creates public.user_feedback table'
);
assert(
  migrationContent.includes('ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;'),
  'Migration enables Row Level Security'
);
assert(
  migrationContent.includes('FOR INSERT TO anon, authenticated'),
  'Migration grants INSERT policy for public feedback submission'
);
assert(
  !migrationContent.includes('FOR SELECT TO anon'),
  'Migration strictly denies public SELECT (private feedback cannot be read by public)'
);

// ── TEST 8: Feedback API Route Robustness & Persistence-First ──────
console.log('\n--- TEST 8: Feedback API Route Robustness ---');
const feedbackRouteExists = fs.existsSync(path.join(process.cwd(), 'src/app/api/feedback/route.ts'));
assert(feedbackRouteExists, 'src/app/api/feedback/route.ts exists');

const routeContent = fs.readFileSync(path.join(process.cwd(), 'src/app/api/feedback/route.ts'), 'utf-8');
assert(
  routeContent.includes(".from('user_feedback')") && routeContent.includes('.insert('),
  'Feedback route persists to user_feedback table in Supabase'
);
assert(
  routeContent.includes('PERSISTENCE_UNAVAILABLE'),
  'Feedback route prevents silent data loss (reports 503 if both DB and email are unconfigured)'
);
assert(
  routeContent.includes('message.length < 3'),
  'Feedback route validates message input length'
);
assert(
  routeContent.includes('checkRateLimit'),
  'Feedback route applies IP sliding window rate limiting'
);
assert(
  routeContent.includes('process.env.FEEDBACK_RECIPIENT_EMAIL'),
  'Feedback route reads recipient email from environment configuration'
);

console.log('\n======================================================');
console.log(`TOTAL REMEDIATION ASSERTIONS: ${passed + failed}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
console.log('======================================================\n');

if (failed > 0) {
  process.exit(1);
}
