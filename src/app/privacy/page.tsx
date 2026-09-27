import Link from 'next/link';
import { Dumbbell, ArrowLeft, ShieldCheck, Lock, HardDrive, AlertTriangle, FileText } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy & Terms | ASCEND',
  description: 'ASCEND Powerlifting WebApp Privacy Policy and Legal Terms. 100% offline, on-device local storage with complete user data ownership.',
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
            PRIVACY POLICY &amp; TERMS
          </h1>
        </div>
        <p className="text-xs text-text-muted font-mono">
          Last Updated: September 2026 • Effective Worldwide
        </p>
      </div>

      {/* Guarantee Card */}
      <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono space-y-1.5">
        <div className="flex items-center gap-2 font-bold text-sm">
          <Lock className="w-4 h-4" />
          <span>100% On-Device Local Data Guarantee</span>
        </div>
        <p className="text-2xs opacity-90 leading-relaxed">
          ASCEND is designed privacy-first. We do NOT harvest, monetize, or transmit your bodyweight, lifts, or workouts to external cloud servers. Your data stays in your browser.
        </p>
      </div>

      {/* Sections */}
      <div className="space-y-6 text-xs font-mono text-text-secondary leading-relaxed">
        {/* Section 1 */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-accent" />
            1. Data Stored and Collection Methods
          </h2>
          <p className="text-2xs">
            We store only the information you explicitly provide: athlete alias, biological sex, bodyweight measurements, height records, personal records (PRs), workout logs, and daily meal nutrition.
          </p>
          <p className="text-2xs">
            This information is held in client-side HTML5 Local Storage (`localStorage`). If you clear your browser history or cache without an exported backup file, this data will be purged.
          </p>
        </section>

        {/* Section 2 */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-amber-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            2. Medical &amp; Fitness Activity Disclaimer
          </h2>
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200/90 text-2xs space-y-1.5">
            <p>
              <strong>IMPORTANT HEALTH ADVISORY:</strong> Heavy resistance training, barbell squats, bench pressing, and deadlifting carry substantial risks of musculoskeletal injury or cardiovascular strain.
            </p>
            <p>
              ASCEND is solely a digital logbook and mathematical strength calculator. It is NOT medical advice, physical therapy, or tailored coaching. Always obtain medical clearance from a certified physician before starting heavy training.
            </p>
          </div>
        </section>

        {/* Section 3 */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <FileText className="w-4 h-4 text-accent" />
            3. GDPR &amp; CCPA Compliance
          </h2>
          <p className="text-2xs">
            Under global privacy frameworks (including the European Union General Data Protection Regulation and California Consumer Privacy Act), you retain uncompromised rights:
          </p>
          <ul className="list-disc list-inside text-2xs space-y-1.5 pl-2">
            <li><strong>Right to Portability:</strong> Export your complete data vault in standard JSON format anytime.</li>
            <li><strong>Right to Deletion:</strong> Wipe all stored information with one click via Data Vault Reset.</li>
            <li><strong>No Tracking:</strong> Zero cross-site tracking, zero telemetry, zero analytics scripts.</li>
          </ul>
        </section>

        {/* Section 4 */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-text-primary">
            4. Scientific Formulations &amp; Intellectual Property
          </h2>
          <p className="text-2xs">
            - One-Rep Maximums are calculated using the standard Epley Equation: 1RM = weight × (1 + reps/30).
          </p>
          <p className="text-2xs">
            - Relative powerlifting scoring applies the official DOTS coefficient formula developed by powerlifting federations.
          </p>
        </section>
      </div>

      <div className="pt-4 border-t border-border/60 text-center">
        <Link
          href="/"
          className="btn-primary inline-flex items-center justify-center gap-2 py-2.5 px-6 text-xs font-bold font-mono"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Dashboard</span>
        </Link>
      </div>
    </div>
  );
}
