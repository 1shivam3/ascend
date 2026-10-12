/**
 * Analytics, Monitoring & Feedback QA Suite
 * Validates GA4, Clarity, Sentry, Google Site Verification, and Feedback Modal integration.
 */

import fs from 'fs';
import path from 'path';

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
console.log('RUNNING: Analytics, Monitoring & Feedback QA Suite');
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

// ── TEST 2: Google Analytics 4 (GA4) Integration ───────────────────
console.log('\n--- TEST 2: Google Analytics 4 Integration ---');
assert(
  layoutContent.includes('https://www.googletagmanager.com/gtag/js?id=G-DV7VT2H5LP'),
  'Layout imports official gtag.js with Measurement ID G-DV7VT2H5LP'
);
assert(
  layoutContent.includes("gtag('config', 'G-DV7VT2H5LP'"),
  'Layout initializes gtag config with G-DV7VT2H5LP'
);

// ── TEST 3: Microsoft Clarity Integration ──────────────────────────
console.log('\n--- TEST 3: Microsoft Clarity Integration ---');
assert(
  layoutContent.includes('https://www.clarity.ms/tag/'),
  'Layout imports official Microsoft Clarity tag script'
);
assert(
  layoutContent.includes('"ywdt5rqnzv"'),
  'Clarity script initializes project ID ywdt5rqnzv'
);

// ── TEST 4: Sentry Crash & Error Tracking ──────────────────────────
console.log('\n--- TEST 4: Sentry Crash Tracking Integration ---');
assert(
  layoutContent.includes('https://js.sentry-cdn.com/5943361d29069b1cc12e20ca7d6e2f90.min.js'),
  'Layout includes Sentry zero-bloat browser CDN loader script'
);

// ── TEST 5: User Feedback & Review Modal ───────────────────────────
console.log('\n--- TEST 5: Feedback Modal & Triggers ---');
const feedbackModalExists = fs.existsSync(path.join(process.cwd(), 'src/components/FeedbackModal.tsx'));
assert(feedbackModalExists, 'FeedbackModal.tsx component exists');

const settingsContent = fs.readFileSync(path.join(process.cwd(), 'src/components/SettingsModal.tsx'), 'utf-8');
assert(
  settingsContent.includes('FeedbackModal'),
  'SettingsModal imports and renders FeedbackModal'
);
assert(
  settingsContent.includes('Feedback, Reviews & Bug Reports') || settingsContent.includes('Feedback, Reviews &amp; Bug Reports'),
  'SettingsModal contains dedicated Community & Feedback section'
);

const quickActionContent = fs.readFileSync(path.join(process.cwd(), 'src/components/QuickActionSheetModal.tsx'), 'utf-8');
assert(
  quickActionContent.includes('FeedbackModal'),
  'QuickActionSheetModal imports and renders FeedbackModal'
);
assert(
  quickActionContent.includes('Leave Feedback'),
  'QuickActionSheetModal contains 1-tap feedback pill trigger'
);

// ── TEST 6: Feedback API Route ─────────────────────────────────────
console.log('\n--- TEST 6: Feedback API Route Verification ---');
const feedbackRouteExists = fs.existsSync(path.join(process.cwd(), 'src/app/api/feedback/route.ts'));
assert(feedbackRouteExists, 'src/app/api/feedback/route.ts route handler exists');

const routeContent = fs.readFileSync(path.join(process.cwd(), 'src/app/api/feedback/route.ts'), 'utf-8');
assert(routeContent.includes('checkRateLimit'), 'Feedback API route implements sliding window rate limiting');
assert(routeContent.includes('resend.com/emails'), 'Feedback API route delivers to Resend API');
assert(routeContent.includes('1shivamkrsingh3@gmail.com'), 'Feedback API route targets verified account owner email');

console.log('\n======================================================');
console.log(`TOTAL ASSERTIONS: ${passed + failed}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
console.log('======================================================\n');

if (failed > 0) {
  process.exit(1);
}
