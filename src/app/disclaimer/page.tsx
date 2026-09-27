import Link from 'next/link';
import { Dumbbell, ArrowLeft, AlertTriangle, HeartPulse, ShieldAlert, CheckCircle2 } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Medical & Physical Activity Disclaimer | ASCEND',
  description: 'Physical Activity Readiness, heavy resistance training disclaimers, gym safety protocols, and health advisories for ASCEND users.',
};

export default function DisclaimerPage() {
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
        <div className="flex items-center gap-2 text-amber-400">
          <HeartPulse className="w-6 h-6" />
          <h1 className="text-xl sm:text-2xl font-black font-mono tracking-tight uppercase">
            MEDICAL &amp; SAFETY DISCLAIMER
          </h1>
        </div>
        <p className="text-xs text-text-muted font-mono">
          Physical Activity Readiness Advisory • Please Read Carefully
        </p>
      </div>

      {/* Primary Alert Banner */}
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200/90 text-xs font-mono space-y-2">
        <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>NOT MEDICAL OR PROFESSIONAL TRAINING ADVICE</span>
        </div>
        <p className="text-2xs leading-relaxed">
          ASCEND is an analytical workout log and mathematical strength calculator. The content, level rankings, 1RM estimates, and macro calculations are for informational and motivational purposes only. ASCEND does not provide medical advice, diagnosis, treatment, or individualized sports coaching.
        </p>
      </div>

      <div className="space-y-6 text-xs font-mono text-text-secondary leading-relaxed">
        {/* PAR-Q Questions */}
        <section className="space-y-2.5">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-accent" />
            1. Physical Activity Readiness (PAR-Q) Screening
          </h2>
          <p className="text-2xs">
            Prior to engaging in heavy strength training or testing 1-Rep Max personal records, ask yourself the following fundamental health questions:
          </p>
          <div className="p-3 rounded-xl bg-bg-secondary border border-border/80 space-y-2 text-2xs">
            <p>1. Has your doctor ever said you have a heart condition or high blood pressure?</p>
            <p>2. Do you feel pain in your chest when performing physical activity?</p>
            <p>3. Do you ever lose balance because of dizziness or lose consciousness?</p>
            <p>4. Do you have a bone, joint, or spinal problem that could be aggravated by heavy lifting?</p>
            <p>5. Are you currently taking medication for blood pressure or a heart condition?</p>
          </div>
          <p className="text-2xs text-amber-300/90">
            <strong>If you answered YES to any of these questions:</strong> You must consult a licensed physician and obtain medical clearance before attempting any maximal lifts or high-intensity training.
          </p>
        </section>

        {/* Barbell & Gym Safety */}
        <section className="space-y-2.5">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <Dumbbell className="w-4 h-4 text-accent" />
            2. Barbell &amp; Powerlifting Safety Protocol
          </h2>
          <ul className="space-y-2 text-2xs">
            <li className="flex items-start gap-2 p-2 rounded bg-bg-secondary border border-border/60">
              <CheckCircle2 className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
              <span><strong>Always Use Spotters or Safety Pins:</strong> Never perform heavy barbell bench presses or squats without properly positioned safety catches or an attentive spotter.</span>
            </li>
            <li className="flex items-start gap-2 p-2 rounded bg-bg-secondary border border-border/60">
              <CheckCircle2 className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
              <span><strong>Barbell Collars:</strong> Always secure barbell plates with locking collars or clamps to prevent uneven weight displacement during lifts.</span>
            </li>
            <li className="flex items-start gap-2 p-2 rounded bg-bg-secondary border border-border/60">
              <CheckCircle2 className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
              <span><strong>Valsalva Maneuver Awareness:</strong> Intra-abdominal pressure bracing temporarily spikes blood pressure. Lifters with vascular conditions must exercise extreme caution.</span>
            </li>
          </ul>
        </section>

        {/* Nutrition Disclaimer */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-text-primary">
            3. Nutrition &amp; Macro Estimations
          </h2>
          <p className="text-2xs">
            Macronutrient and caloric calculations provided within ASCEND are approximations based on generalized nutritional databases. Individual metabolic rates, digestive efficiency, and dietary requirements vary considerably. Consult a registered dietitian or healthcare provider for clinical dietary guidance.
          </p>
        </section>

        {/* Voluntary Participation */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-text-primary">
            4. Voluntary Assumption of Risk
          </h2>
          <p className="text-2xs">
            By using ASCEND, you acknowledge that all physical exercises, programs, and PR attempts are conducted entirely at your own risk. ASCEND and its developers shall not be liable for any injury, accident, disability, or adverse health outcome resulting from your training.
          </p>
        </section>
      </div>

      <div className="pt-4 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
        <Link
          href="/terms"
          className="text-2xs font-mono text-accent hover:underline"
        >
          View Full Terms of Service &rarr;
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
