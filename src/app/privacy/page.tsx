import Link from 'next/link';
import LegalLangSync from '@/components/LegalLangSync';
import {
  Dumbbell,
  ArrowLeft,
  ShieldCheck,
  Lock,
  HardDrive,
  AlertTriangle,
  FileText,
  Sparkles,
  Camera,
  Mic,
  Barcode,
  Trash2,
  Users
} from 'lucide-react';
import type { Metadata } from 'next';
import { SUPPORT_EMAIL, LEGAL_LAST_UPDATED, LEGAL_VERSION } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Privacy Policy | ASCEND',
  description: 'ASCEND Powerlifting & Fitness WebApp Privacy Policy. 100% offline, on-device local storage, transparent AI disclosures, Google Play Data Safety compliance, and user data deletion.',
};

export default function PrivacyPage() {
  return (
    <main id="main-content" className="min-h-screen bg-bg-primary text-text-primary px-4 py-8 max-w-xl mx-auto space-y-6">
      <LegalLangSync />
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 pb-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 group transition-transform active:scale-95"
        >
          <div className="w-8 h-8 rounded-lg bg-bg-secondary border border-border flex items-center justify-center text-accent">
            <Dumbbell className="w-4 h-4" />
          </div>
          <span className="text-lg font-black tracking-tight font-mono text-text-primary group-hover:text-accent transition-colors">
            ASCEND
          </span>
        </Link>

        <Link
          href="/"
          className="btn-secondary py-1.5 px-3 text-xs font-mono flex items-center gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Dashboard</span>
        </Link>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-emerald-400">
          <ShieldCheck className="w-6 h-6" />
          <h1 className="text-xl sm:text-2xl font-black font-mono tracking-tight">
            PRIVACY POLICY
          </h1>
        </div>
        <p className="text-xs text-text-muted font-mono">
          Last Updated: {LEGAL_LAST_UPDATED} • Version {LEGAL_VERSION} • Global &amp; Google Play Store Compliant
        </p>
      </div>

      {/* Guarantee Card */}
      <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono space-y-1.5">
        <div className="flex items-center gap-2 font-bold text-sm">
          <Lock className="w-4 h-4" />
          <span>Local-First Default &amp; Transparent Cloud Privacy</span>
        </div>
        <p className="text-2xs opacity-90 leading-relaxed">
          ASCEND is engineered with privacy as a foundational principle. By default, ASCEND operates in <strong>Guest Mode (100% local-first)</strong> with zero cloud tracking. For trainees who choose to link a cloud account or enable push reminders, your data is protected with strict Row Level Security (RLS), zero advertising monetization, and instantaneous 0-day cascade account deletion.
        </p>
      </div>

      {/* Sections */}
      <div className="space-y-6 text-xs font-mono text-text-secondary leading-relaxed">
        {/* Section 1 */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-accent" />
            1. Information Storage: Guest Mode vs. Optional Cloud Account
          </h2>
          <p className="text-2xs">
            ASCEND gives athletes full control over how and where their training data is stored:
          </p>
          <ul className="list-disc list-inside text-2xs space-y-1.5 pl-2">
            <li><strong>Guest Mode (Default &amp; On-Device):</strong> All application data is stored locally in client-side Web Storage (<code className="text-text-primary bg-bg-secondary px-1 py-0.5 rounded">localStorage</code> under the <code className="text-text-primary bg-bg-secondary px-1 py-0.5 rounded">ascend_store</code> key). In Guest Mode, zero workout records, PRs, or nutritional entries ever touch any remote server.</li>
            <li><strong>Optional Cloud Sync (Google OAuth &amp; Supabase):</strong> If you choose to sign in to protect your data across device changes, your profile, PRs, workouts, meals, body metrics, and custom routines are backed up to a private, encrypted Supabase PostgreSQL database. Every table is guarded by strict Row Level Security (RLS) policies enforcing that only your authenticated user ID can read or modify your records.</li>
            <li><strong>Optional Push Notifications (Reminder Center):</strong> If you explicitly opt in to reminders (hydration, meal timing, workout notifications), your device web push subscription token (<code className="text-text-primary bg-bg-secondary px-1 py-0.5 rounded">endpoint</code>, <code className="text-text-primary bg-bg-secondary px-1 py-0.5 rounded">p256dh</code>, <code className="text-text-primary bg-bg-secondary px-1 py-0.5 rounded">auth</code>) and reminder schedules are stored strictly to deliver your chosen alerts. Reminder dispatch is scheduled through Upstash QStash, which processes the delivery timing and your push endpoint — nothing else. You can modify preferences or unsubscribe at any time.</li>
            <li><strong>Progress Photos (Device-Only):</strong> Photos you add in Progress are stored only in this device&apos;s local storage (key <code className="text-text-primary bg-bg-secondary px-1 py-0.5 rounded">ascend_progress_photos_v1</code>, up to 24 photos). They are never uploaded, never synced to the cloud, and are deleted when you delete the photo or wipe app data.</li>
            <li><strong>Feedback Messages:</strong> If you send feedback from inside the app, your message (and the name/email you optionally type into the form) is stored in our Supabase database so we can respond. When email forwarding is configured on the server, a copy is also emailed to our support inbox via Resend (transactional email provider).</li>
          </ul>
          <p className="text-2xs text-amber-300/80 pt-1">
            <strong>Important Notice for Guest Mode:</strong> If you remain in Guest Mode without a cloud account or exported backup file, clearing your browser history, site data, or cache will permanently erase your data. Regular exports via the <em>Data Vault</em> are strongly advised.
          </p>
        </section>

        {/* Section 2: AI & Cloud Services */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            2. Generative Athletic Intelligence &amp; Data Handling (Groq, OpenRouter, Google Gemini)
          </h2>
          <p className="text-2xs">
            ASCEND includes optional athletic utilities powered by privacy-hardened machine learning providers (such as the Autoregulated Coach, Macro Lens Photo Estimator, Natural Language Voice Logger, and Exercise Substitutions):
          </p>
          <ul className="list-disc list-inside text-2xs space-y-1.5 pl-2">
            <li><strong>Multi-Provider Fallback Chain:</strong> AI requests are attempted in order — Groq Cloud (LPU inference), then OpenRouter, then Google Gemini — and stop at the first successful response. Meal photos are processed by Groq or Gemini only; they are never sent to OpenRouter (photos are skipped at that stage by design).</li>
            <li><strong>Meal Photo Handling &amp; Provider Data Retention:</strong> When using the optional Macro Lens photo scanner, meal images are transmitted in-memory over encrypted TLS to commercial AI developer APIs (Groq Cloud LPU and Google Gemini API). ASCEND does not permanently store meal photos on its servers. Upstream API providers retain operational logs for temporary security and abuse detection windows (typically up to 30 days pursuant to standard commercial API terms), and do not train models on API customer data on commercial developer tiers. Meal photos are strictly <em>never</em> sent to public crowd-sourced or free-tier third-party training pools.</li>
            <li><strong>Voice Logging — How Speech Recognition Works:</strong> In the ASCEND Android app, the hands-free voice logger uses native on-device speech recognition — your audio does not leave your device. In a web browser, speech recognition is provided by the browser (Web Speech API), and depending on your browser your audio may be processed on the browser provider&apos;s servers to produce the transcript. ASCEND itself never stores raw audio recordings; only the resulting text transcript is sent to the AI provider to extract exercise, weight, and reps.</li>
            <li><strong>100% On-Device Offline Manual Entry:</strong> AI meal scanning is completely optional. Trainees can log foods manually using ASCEND&apos;s built-in on-device food database and offline estimation engine, which operates 100% locally with zero network transmission.</li>
            <li><strong>Opt-In and On-Demand:</strong> Network requests to AI endpoints are executed <em>only</em> when you explicitly initiate an analysis. No background scraping or automated image transmission ever occurs.</li>
            <li><strong>Zero Personal Identifiers Transmitted:</strong> We never transmit your personal contact details, email addresses, names, or device identifiers to AI providers. Only the specific anonymized training numbers or meal photo necessary to process your request is sent.</li>
            <li><strong>Server-Side Key Management:</strong> All API credentials are managed exclusively on ASCEND backend servers via secure environment variables. Client-supplied API keys are never accepted or processed, preventing key injection attacks.</li>
            <li><strong>In-App Content Reporting:</strong> In strict compliance with Google Play Store AI Policies, ASCEND provides an integrated in-app reporting button (flag icon) next to all AI outputs. Users can immediately report unsafe, inaccurate, or offensive responses, which suppresses the output locally and logs the report for safety reviews.</li>
          </ul>
        </section>

        {/* Section 3: Hardware Permissions */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <Barcode className="w-4 h-4 text-accent" />
            3. Device Hardware Permissions &amp; Third-Party Lookups
          </h2>
          <div className="space-y-2 text-2xs">
            <p>
              <strong>Camera Permission:</strong> Camera access is requested strictly when you activate the live barcode scanner or capture a meal photo. Camera video frames are processed in-memory in real time for barcode recognition or meal estimation; video feeds and photos are never recorded, surveilled, or permanently stored on any remote server.
            </p>
            <p>
              <strong>Microphone &amp; Speech-to-Text:</strong> Microphone access is used strictly for the hands-free voice workout logger. In the Android app, transcription happens on-device via native speech recognition. In a web browser, transcription uses the browser&apos;s speech recognition (Web Speech API), which may process audio on the browser provider&apos;s servers. ASCEND never stores raw audio recordings; only the transcript text is used to log exercise, reps, and weight.
            </p>
            <p>
              <strong>Open Food Facts API:</strong> When scanning a food barcode, the app queries the public, open-source Open Food Facts database using the numeric barcode to retrieve nutritional information. These requests are anonymous and contain zero user identifiers.
            </p>
            <p>
              <strong>Haptics &amp; Audio:</strong> Vibration and audio chime capabilities are utilized strictly for the rest interval timer and in-app action confirmations.
            </p>
          </div>
        </section>

        {/* Section 4: Google Play Data Safety Form Disclosure */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-accent" />
            4. Google Play Store &amp; App Store Data Safety Declarations
          </h2>
          <div className="p-3 rounded-lg bg-bg-secondary border border-border/80 text-2xs space-y-2">
            <p className="font-semibold text-text-primary">Summary of Data Practices for App Store Reviewers &amp; Trainees:</p>
            <div className="space-y-1.5 text-2xs">
              <p>• <strong>Personal Info (Optional):</strong> Name and email are collected only when you explicitly sign in with Google OAuth for cloud backup. Not collected in Guest Mode.</p>
              <p>• <strong>Health &amp; Fitness:</strong> Workout logs, personal records, bodyweight, and nutrition. Stored 100% locally on-device in Guest Mode; synced with TLS 1.3 encryption to a private Supabase PostgreSQL database with Row Level Security in Cloud Mode.</p>
              <p>• <strong>Health Connect (Android, optional):</strong> If you turn on Health Connect sync in Settings, ASCEND reads only your step counts, sleep duration, and body weight from Health Connect, on this device, to power your readiness score and body-metrics log. Sync is off by default, happens only while the app is open, and can be turned off at any time in Settings or revoked in Health Connect. Imported weights are marked &ldquo;Health Connect&rdquo; and you can edit or delete them like any other entry. You can also remove ASCEND&rsquo;s access entirely in the Health Connect app.</p>
              <p>• <strong>Device &amp; Other Identifiers:</strong> Web Push subscription tokens (endpoint and cryptographic keys) are stored solely for delivering user-configured workout and habit reminders when push notifications are enabled.</p>
              <p>• <strong>Data Shared with Third Parties:</strong> None with advertisers, data brokers, or marketing networks. Third-party API communication is strictly user-initiated (Google Gemini for athletic coaching, Open Food Facts for barcode lookups, Web Push for reminders).</p>
              <p>• <strong>Tracking &amp; Diagnostics:</strong> Zero advertising tracking, zero cross-app tracking, zero marketing cookies. Anonymous diagnostics (Google Analytics 4, Microsoft Clarity, Sentry error monitoring) load <em>only</em> if you explicitly opt in via the consent banner or Settings toggle, and transmit only sanitized, non-identifying app events — never workout, nutrition, or body data. In the standard build none of these services are configured, so nothing is collected.</p>
              <p>• <strong>Data Deletion:</strong> 1-tap local device wiping and instant 0-day cascade cloud account deletion via in-app settings or the external deletion portal.</p>
            </div>
          </div>
        </section>

        {/* Section 5: Account & Data Deletion (Google Play Mandatory) */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-danger" />
            5. User Data Deletion &amp; Account Eradication
          </h2>
          <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-xs text-text-secondary space-y-2">
            <p className="text-2xs">
              Google Play requires clear disclosure of how users can request or execute complete deletion of their account and data. In ASCEND:
            </p>
            <ul className="list-disc list-inside text-2xs space-y-1.5 pl-1">
              <li><strong>Instant In-App Deletion:</strong> Open <em>Settings &rarr; Account &amp; Privacy &rarr; Delete My Account</em>. This immediately and permanently deletes your Supabase cloud account, all synchronized workout, PR, meal, and biometric records, and wipes all device storage.</li>
              <li><strong>External Web Deletion Portal:</strong> In compliance with Google Play Data Safety requirements, you can also initiate deletion without having the app installed via our dedicated <Link href="/delete-account" className="text-accent underline font-semibold">Account &amp; Data Deletion Request Page</Link>.</li>
              <li><strong>Zero Retention Policy:</strong> Wiping or requesting deletion results in immediate 0-day erasure across cloud databases and authentication directories.</li>
              <li><strong>Manual Support Inquiries:</strong> Contact our privacy team at <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent underline font-mono">{SUPPORT_EMAIL}</a>.</li>
            </ul>
          </div>
        </section>

        {/* Section 6: Children's Privacy */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <Users className="w-4 h-4 text-accent" />
            6. Children&apos;s Privacy (COPPA &amp; GDPR-K)
          </h2>
          <p className="text-2xs">
            ASCEND is designed for athletes and gym trainees aged 13 and older (or 16 and older in the European Economic Area). We do not knowingly collect, solicit, or maintain personal information from children under the age of 13. If you believe a child under 13 has provided data through the app, please wipe the device local storage or contact us to assist.
          </p>
        </section>

        {/* Section 7: Medical & Safety Notice */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-amber-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            7. Health, Fitness &amp; Safety Notice
          </h2>
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200/90 text-2xs space-y-1.5">
            <p>
              ASCEND is an analytical workout journal and mathematical strength calculator. It is NOT a medical device and does NOT provide medical advice, clinical diagnosis, or rehabilitation prescriptions. Resistance training carries inherent risks of injury. Always consult a licensed healthcare professional before beginning any physical exercise regimen.
            </p>
            <p>
              For complete details, please read our dedicated <Link href="/disclaimer" className="text-accent underline font-semibold">Medical &amp; Safety Disclaimer</Link>.
            </p>
          </div>
        </section>

        {/* Section 8: Data Retention & Your Rights */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <FileText className="w-4 h-4 text-accent" />
            8. Data Retention &amp; Your Rights
          </h2>
          <div className="space-y-2 text-2xs">
            <p>
              <strong>Retention:</strong> Cloud data is kept only while your account exists — account deletion triggers immediate, zero-day erasure across all databases and authentication records. Guest Mode data lives in your device&apos;s local storage until you clear site data, reset the app, or delete it yourself. AI provider request logs are retained by the providers only for their standard short abuse-detection windows (typically up to 30 days); ASCEND keeps no copy.
            </p>
            <p>
              <strong>Your rights:</strong> You can access and export all of your local data at any time via Settings &rarr; Data Vault (JSON backup), correct anything in the app itself, and delete everything via Settings &rarr; Delete Account or the <Link href="/delete-account" className="text-accent underline font-semibold">Account &amp; Data Deletion Request Page</Link>. For access, rectification, portability, or erasure requests you cannot complete yourself, email <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent underline font-mono">{SUPPORT_EMAIL}</a> and we will act within 30 days.
            </p>
          </div>
        </section>
      </div>

      <div className="pt-4 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
        <Link
          href="/terms"
          className="text-2xs font-mono text-accent-text hover:underline"
        >
          View Terms of Service &rarr;
        </Link>
        <Link
          href="/"
          className="btn-primary inline-flex items-center justify-center gap-2 py-2 px-5 text-xs font-bold font-mono"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Dashboard</span>
        </Link>
      </div>
    </main>
  );
}
