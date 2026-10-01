import Link from 'next/link';
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
  Barcode,
  Key
} from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | ASCEND',
  description: 'ASCEND Powerlifting WebApp Privacy Policy. 100% offline, on-device local storage, transparent AI disclosures, and complete user data ownership.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary px-4 py-8 max-w-xl mx-auto space-y-6">
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
          Last Updated: October 2026 • Version 2.2 • Effective Worldwide
        </p>
      </div>

      {/* Guarantee Card */}
      <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono space-y-1.5">
        <div className="flex items-center gap-2 font-bold text-sm">
          <Lock className="w-4 h-4" />
          <span>100% Local-First Data Architecture Guarantee</span>
        </div>
        <p className="text-2xs opacity-90 leading-relaxed">
          ASCEND is engineered with privacy as a foundational principle. We do NOT harvest, monetize, sell, or sync your personal workouts, lift numbers, bodyweight metrics, or habits to any external database or cloud storage. Your data belongs exclusively to you and resides solely on your device.
        </p>
      </div>

      {/* Sections */}
      <div className="space-y-6 text-xs font-mono text-text-secondary leading-relaxed">
        {/* Section 1 */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-accent" />
            1. Information Stored Locally on Your Device
          </h2>
          <p className="text-2xs">
            All primary application data is stored locally in client-side Web Storage (<code className="text-text-primary bg-bg-secondary px-1 py-0.5 rounded">localStorage</code> under the <code className="text-text-primary bg-bg-secondary px-1 py-0.5 rounded">ascend_store</code> key) inside your device browser:
          </p>
          <ul className="list-disc list-inside text-2xs space-y-1 pl-2">
            <li><strong>Athlete Profile:</strong> Name/alias, biological sex, baseline bodyweight, height, and unit preferences (kg/lbs).</li>
            <li><strong>Strength &amp; Workouts:</strong> Personal records (PRs), workout sessions, individual sets, reps, active workout drafts, and custom workout plans.</li>
            <li><strong>Daily Habits &amp; Nutrition:</strong> Water intake batches, creatine daily logs and container supply, meal entries, daily macro goals, and pinned food staples.</li>
            <li><strong>UI Preferences:</strong> Theme selection (OLED Dark or Premium Light).</li>
          </ul>
          <p className="text-2xs text-amber-300/80 pt-1">
            <strong>Important Notice:</strong> Because this information is stored locally on your device, clearing your browser history, site data, or cache without an exported backup file will permanently erase your data. Regular exports via the <em>Data Vault</em> are strongly advised.
          </p>
        </section>

        {/* Section 2: AI & Cloud Services */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            2. Generative AI Features &amp; Data Handling (Google Gemini)
          </h2>
          <p className="text-2xs">
            ASCEND includes optional generative AI capabilities powered by Google Gemini (such as the AI Training Coach, AI Photo Meal Scanner, and Natural Language Meal Logging):
          </p>
          <ul className="list-disc list-inside text-2xs space-y-1.5 pl-2">
            <li><strong>Opt-In and On-Demand:</strong> Network requests to the Gemini API are executed <em>only</em> when you explicitly interact with an AI feature (e.g. asking the AI Coach a question, scanning a meal photo, or requesting natural language meal parsing).</li>
            <li><strong>No Personal Identifiers:</strong> We never transmit your personal contact details, email addresses, or full workout histories to AI providers. Only the specific prompt, recent athletic context necessary to answer, or food image is sent for processing.</li>
            <li><strong>Custom Gemini API Key Security:</strong> If you supply a custom Google Gemini API Key in Settings, that key is stored strictly on your local device in <code className="text-text-primary bg-bg-secondary px-1 py-0.5 rounded">localStorage</code>. It is never transmitted to, collected by, or stored on any ASCEND backend servers.</li>
          </ul>
        </section>

        {/* Section 3: Third-Party Lookups & Hardware Permissions */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <Barcode className="w-4 h-4 text-accent" />
            3. Barcode Scanning &amp; Device Permissions
          </h2>
          <div className="space-y-2 text-2xs">
            <p>
              <strong>Open Food Facts API:</strong> When using the barcode lookup feature, the app queries the public, open-source Open Food Facts database using the numeric barcode to retrieve nutritional information. These requests are anonymous and contain no user identity or telemetry.
            </p>
            <p>
              <strong>Camera Permission:</strong> Camera access is requested strictly when you activate the live barcode scanner or capture a meal photo. Camera video streams are analyzed locally in real-time or processed directly for meal recognition; video feeds are never recorded, tracked, or stored.
            </p>
            <p>
              <strong>Haptics &amp; Audio:</strong> Vibration and audio alert capabilities are utilized strictly for the rest interval timer and action confirmations.
            </p>
          </div>
        </section>

        {/* Section 4: Data Ownership & Rights */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <FileText className="w-4 h-4 text-accent" />
            4. User Rights, GDPR &amp; CCPA Compliance
          </h2>
          <p className="text-2xs">
            Under global privacy standards, including the EU General Data Protection Regulation (GDPR) and California Consumer Privacy Act (CCPA):
          </p>
          <ul className="list-disc list-inside text-2xs space-y-1.5 pl-2">
            <li><strong>Right to Portability:</strong> You can download a complete, unencrypted copy of your full athletic history in standard JSON format at any time using the <em>Data Vault</em>.</li>
            <li><strong>Right to Erasure:</strong> You can immediately and irreversibly delete all local storage records using the <em>Wipe All Data</em> action in the Data Vault.</li>
            <li><strong>Zero Tracking / Zero Cookies:</strong> ASCEND uses zero third-party advertising cookies, zero behavioral tracking pixels, and zero telemetry analytics frameworks.</li>
          </ul>
        </section>

        {/* Section 5: Medical Notice */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-amber-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            5. Health, Fitness &amp; Safety Notice
          </h2>
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200/90 text-2xs space-y-1.5">
            <p>
              ASCEND is an analytical workout journal and mathematical strength calculator. It is NOT a medical device and does NOT provide medical advice, diagnosis, or treatment. Resistance training carries inherent risks of injury. Always consult a healthcare professional before beginning any physical exercise regimen.
            </p>
            <p>
              For complete details, please read our dedicated <Link href="/disclaimer" className="text-accent underline font-semibold">Medical &amp; Safety Disclaimer</Link>.
            </p>
          </div>
        </section>
      </div>

      <div className="pt-4 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
        <Link
          href="/terms"
          className="text-2xs font-mono text-accent hover:underline"
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
    </div>
  );
}
