import Link from 'next/link';
import {
  Dumbbell,
  ArrowLeft,
  AlertTriangle,
  HeartPulse,
  ShieldAlert,
  CheckCircle2,
  Sparkles,
  Droplet,
  Utensils
} from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Medical & Safety Disclaimer | ASCEND',
  description: 'Physical Activity Readiness, heavy resistance training disclaimers, AI guidance notices, supplement safety protocols, and health advisories for ASCEND users.',
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
          Physical Activity Readiness &amp; Training Safety Protocols • Please Read Carefully
        </p>
      </div>

      {/* Primary Alert Banner */}
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200/90 text-xs font-mono space-y-2">
        <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>NOT MEDICAL, CLINICAL OR PROFESSIONAL ATHLETIC ADVICE</span>
        </div>
        <p className="text-2xs leading-relaxed">
          ASCEND is an analytical workout journal, mathematical strength standards calculator, and habit tracker. The features, 1RM estimations, AI coaching insights, workout plan generators, hydration targets, and nutritional calculations are provided solely for informational and motivational purposes. ASCEND does not provide medical advice, diagnosis, treatment, physical therapy, or individualized clinical prescriptions.
        </p>
      </div>

      <div className="space-y-6 text-xs font-mono text-text-secondary leading-relaxed">
        {/* PAR-Q Questions */}
        <section className="space-y-2.5">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-accent" />
            1. Physical Activity Readiness Questionnaire (PAR-Q)
          </h2>
          <p className="text-2xs">
            Prior to engaging in heavy strength training, powerlifting, or testing 1-Rep Max personal records, ask yourself the following fundamental health questions:
          </p>
          <div className="p-3 rounded-xl bg-bg-secondary border border-border/80 space-y-2 text-2xs">
            <p>1. Has a physician ever diagnosed you with a cardiovascular condition, heart murmur, or hypertension?</p>
            <p>2. Do you experience chest pain, tightness, or shortness of breath during physical exertion or at rest?</p>
            <p>3. Do you ever experience loss of balance, dizziness, lightheadedness, or loss of consciousness?</p>
            <p>4. Do you have a bone, tendon, spinal, or joint disorder (e.g. herniated disc) that could be aggravated by heavy axial loading?</p>
            <p>5. Are you currently prescribed medication for blood pressure, heart rate, or kidney function?</p>
            <p>6. Do you know of any other medical or physical condition that should prevent you from strenuous lifting?</p>
          </div>
          <p className="text-2xs text-amber-300/90">
            <strong>If you answered YES to any question:</strong> You must consult a qualified physician and obtain medical clearance before attempting heavy lifts or high-intensity resistance training.
          </p>
        </section>

        {/* Barbell & Gym Safety */}
        <section className="space-y-2.5">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <Dumbbell className="w-4 h-4 text-accent" />
            2. Barbell &amp; Powerlifting Safety Protocol
          </h2>
          <ul className="space-y-2 text-2xs">
            <li className="flex items-start gap-2 p-2.5 rounded-lg bg-bg-secondary border border-border/60">
              <CheckCircle2 className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
              <span><strong>Always Use Spotters or Safety Pins:</strong> Never perform maximal barbell bench presses or squats without correctly positioned safety catches or an experienced spotter.</span>
            </li>
            <li className="flex items-start gap-2 p-2.5 rounded-lg bg-bg-secondary border border-border/60">
              <CheckCircle2 className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
              <span><strong>Locking Collars:</strong> Always secure barbell plates with locking collars or clamps to avoid sudden weight shifting and severe asymmetrical spinal loading.</span>
            </li>
            <li className="flex items-start gap-2 p-2.5 rounded-lg bg-bg-secondary border border-border/60">
              <CheckCircle2 className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
              <span><strong>Valsalva Maneuver Awareness:</strong> Intra-abdominal pressure bracing temporarily spikes systolic and diastolic blood pressure. Lifters with cardiovascular or vascular conditions must exercise extreme caution.</span>
            </li>
            <li className="flex items-start gap-2 p-2.5 rounded-lg bg-bg-secondary border border-border/60">
              <CheckCircle2 className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
              <span><strong>Warm-up Progression:</strong> Always ramp up gradually using the built-in Barbell Plate Calculator warm-up stages before handling working weights or attempting PRs.</span>
            </li>
          </ul>
        </section>

        {/* Section 3: AI Coach & Workout Generator */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            3. AI Coach &amp; Automated Workout Plans
          </h2>
          <p className="text-2xs">
            The AI Coach and split generators utilize heuristic algorithms and Google Gemini large language models. AI recommendations are synthetic and may not account for individual biomechanics, past injuries, structural asymmetries, or recovery limitations. Always use common sense and cease any exercise that causes sharp, joint, or neurological pain.
          </p>
        </section>

        {/* Section 4: Hydration & Creatine Safety */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <Droplet className="w-4 h-4 text-cyan-400" />
            4. Hydration &amp; Creatine Supplementation
          </h2>
          <p className="text-2xs">
            Calculated hydration targets (~35 ml/kg + training bonus) and creatine saturation models (3–5g daily) are standard scientific guidelines for healthy adults. Individuals with chronic renal (kidney) disease, liver impairment, or electrolyte imbalances should never alter fluid intake or supplement with creatine monohydrate without explicit guidance from their nephrologist or physician.
          </p>
        </section>

        {/* Section 5: Nutrition Disclaimer */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <Utensils className="w-4 h-4 text-emerald-400" />
            5. Nutrition &amp; Macronutrient Estimations
          </h2>
          <p className="text-2xs">
            Nutritional values retrieved via the barcode scanner, food staple database, and AI photo estimations are mathematical approximations. Variations exist between agricultural batches, restaurant preparations, and food formulations. These figures are not intended to treat metabolic disorders or eating conditions.
          </p>
        </section>

        {/* Section 6: Voluntary Participation */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-text-primary">
            6. Voluntary Assumption of Risk
          </h2>
          <p className="text-2xs">
            By utilizing ASCEND, you acknowledge and agree that your participation in all physical training, lifting sessions, nutritional modifications, and PR attempts is conducted entirely at your own volition and discretion. To the fullest extent permissible by law, ASCEND and its developers disclaim any liability for injury, illness, accident, or damage resulting from your use of the application.
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
