import Link from 'next/link';
import { Dumbbell, ArrowLeft, Scale, Shield, AlertTriangle, FileText, CheckCircle2, Sparkles, HardDrive, Flag } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service | ASCEND',
  description: 'ASCEND Powerlifting & Fitness WebApp Terms of Service and End-User Agreement. Medical disclaimers, local data ownership, AI feature terms, and limitations of liability.',
};

export default function TermsPage() {
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
        <div className="flex items-center gap-2 text-accent">
          <Scale className="w-6 h-6" />
          <h1 className="text-xl sm:text-2xl font-black font-mono tracking-tight">
            TERMS OF SERVICE
          </h1>
        </div>
        <p className="text-xs text-text-muted font-mono">
          Effective Date: October 2026 • Version 2.3 • Global &amp; Play Store Agreement
        </p>
      </div>

      {/* Summary Box */}
      <div className="p-4 rounded-xl bg-bg-secondary border border-border space-y-2 font-mono text-xs text-text-secondary">
        <span className="text-2xs uppercase tracking-wider font-bold text-accent block">
          Key Takeaways
        </span>
        <ul className="space-y-1.5 text-2xs">
          <li className="flex items-start gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <span>ASCEND is an analytical workout journal, NOT a doctor, physical therapist, or clinical dietitian.</span>
          </li>
          <li className="flex items-start gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <span>Heavy resistance training carries inherent risks of injury; you voluntarily assume all training risks.</span>
          </li>
          <li className="flex items-start gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <span>Your data is stored 100% locally on your device; you are responsible for maintaining your own backup files via the Data Vault.</span>
          </li>
          <li className="flex items-start gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <span>AI features are synthetic assistants with an integrated in-app reporting button for content review.</span>
          </li>
        </ul>
      </div>

      {/* Terms Content */}
      <div className="space-y-6 text-xs font-mono text-text-secondary leading-relaxed">
        {/* Section 1 */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-text-primary">
            1. Acceptance of Terms &amp; Age Eligibility
          </h2>
          <p className="text-2xs">
            By accessing or using the ASCEND application (&quot;ASCEND&quot;, &quot;Service&quot;, &quot;App&quot;), you confirm that you have read, understood, and agreed to be bound by these Terms of Service. If you do not agree, you must discontinue use immediately.
          </p>
          <p className="text-2xs">
            You must be at least 13 years of age (or 16 years of age in jurisdictions subject to GDPR-K) to use this Service. If you are under 18, you may use ASCEND only with the active involvement and consent of a parent or legal guardian.
          </p>
        </section>

        {/* Section 2 */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-amber-400 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            2. Medical &amp; Physical Activity Assumption of Risk
          </h2>
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200/90 text-2xs space-y-2">
            <p>
              <strong>WARNING:</strong> Weightlifting, powerlifting, and maximal strength attempts (such as 1-Rep Max squats, bench presses, and deadlifts) involve intrinsic physical hazards, including musculoskeletal strains, tears, joint injuries, drops, and acute cardiovascular strain.
            </p>
            <p>
              ASCEND provides mathematical estimations (e.g. Epley formula, DOTS coefficients, warm-up plate breakdowns) for informational and entertainment purposes only. ASCEND does not provide professional medical diagnosis, clinical treatment, or individualized medical coaching.
            </p>
            <p>
              You expressly agree that your participation in athletic activities tracked via ASCEND is voluntary, and you assume full responsibility for any risks, injuries, or damages that may arise. Always consult a physician before engaging in strenuous resistance programs.
            </p>
          </div>
        </section>

        {/* Section 3 */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-1.5">
            <HardDrive className="w-4 h-4 text-accent" />
            3. Local Data Storage &amp; User Backup Responsibilities
          </h2>
          <p className="text-2xs">
            ASCEND operates on a 100% client-side local architecture. Your personal records, body metrics, workouts, active drafts, and meals reside strictly within your device&apos;s browser memory (<code className="text-text-primary bg-bg-secondary px-1 py-0.5 rounded">localStorage</code>).
          </p>
          <p className="text-2xs">
            Because we do not store your data on remote cloud servers, ASCEND cannot recover your data if you clear your browser history, reset your device, or delete web storage without a previously exported backup file. You are solely responsible for downloading regular <code className="text-text-primary bg-bg-secondary px-1 py-0.5 rounded">.json</code> backups via the Data Vault.
          </p>
        </section>

        {/* Section 4 */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-accent" />
            4. Generative AI Terms, Reporting &amp; Prohibited Conduct
          </h2>
          <p className="text-2xs">
            ASCEND provides optional AI-assisted features (AI Coach, Meal Vision Scanning, Natural Language Voice Logger) powered by Google Gemini. Output generated by AI is synthetic and probabilistic. ASCEND does not warrant the clinical accuracy of AI nutrition estimates or the fitness suitability of AI training splits.
          </p>
          <p className="text-2xs">
            Users agree NOT to use AI features to generate abusive, offensive, defamatory, or harmful content, or to attempt prompt injection attacks against the service.
          </p>
          <p className="text-2xs">
            <strong>In-App Reporting:</strong> If you receive any objectionable, unsafe, or inappropriate AI output, you must report it using the integrated in-app flag button. Flagged content is immediately suppressed and logged for safety review in compliance with Google Play Store AI Policies.
          </p>
        </section>

        {/* Section 5 */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-text-primary">
            5. Intellectual Property &amp; Open Scientific Formulas
          </h2>
          <p className="text-2xs">
            The ASCEND brand, user interface, software code, and styling are protected by copyright and intellectual property laws. Scientific formulas utilized within the app (including the Epley equation for 1RM estimation and the DOTS polynomial scoring formula for bodyweight normalization) remain open mathematical standards credited to their respective researchers and powerlifting federations.
          </p>
        </section>

        {/* Section 6 */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-text-primary">
            6. Disclaimer of Warranties (&quot;As-Is&quot;)
          </h2>
          <p className="text-2xs">
            ASCEND IS PROVIDED ON AN &quot;AS-IS&quot; AND &quot;AS-AVAILABLE&quot; BASIS WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING FITNESS FOR A PARTICULAR PURPOSE, ACCURACY OF FORMULAS, OR UNINTERRUPTED AVAILABILITY.
          </p>
        </section>

        {/* Section 7 */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-text-primary">
            7. Limitation of Liability
          </h2>
          <p className="text-2xs">
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL ASCEND, ITS CREATORS, OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, PUNITIVE, OR CONSEQUENTIAL DAMAGES ARISING OUT OF YOUR USE OF THE APPLICATION, INCLUDING PHYSICAL INJURY, LOSS OF DATA, OR HARDWARE FAILURE.
          </p>
        </section>

        {/* Section 8 */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-text-primary">
            8. Contact &amp; Updates to Terms
          </h2>
          <p className="text-2xs">
            We reserve the right to modify these Terms of Service at any time. Continued use of the application following any modifications signifies your acceptance of the updated terms. For legal inquiries, contact <a href="mailto:support@ascendfit.app" className="text-accent underline font-mono">support@ascendfit.app</a>.
          </p>
        </section>
      </div>

      {/* Navigation */}
      <div className="pt-4 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
        <Link
          href="/privacy"
          className="text-2xs font-mono text-accent hover:underline"
        >
          View Privacy Policy &rarr;
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
