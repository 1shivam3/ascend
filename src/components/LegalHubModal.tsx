'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  X,
  ShieldCheck,
  Scale,
  HeartPulse,
  BookOpen,
  Lock,
  HardDrive,
  AlertTriangle,
  ExternalLink,
  CheckCircle2,
  Dumbbell
} from 'lucide-react';

interface LegalHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'privacy' | 'terms' | 'medical' | 'standards';
}

export default function LegalHubModal({
  isOpen,
  onClose,
  initialTab = 'privacy',
}: LegalHubModalProps) {
  const [activeTab, setActiveTab] = useState<'privacy' | 'terms' | 'medical' | 'standards'>(
    initialTab
  );

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content p-5 space-y-4 max-w-md w-full max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center text-accent">
              <Scale className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-base text-text-primary leading-tight">
                Legal &amp; Compliance Hub
              </h2>
              <p className="text-2xs text-text-muted font-mono">ASCEND v2.0 • Offline Powerlifting</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="grid grid-cols-4 gap-1 p-1 bg-bg-secondary rounded-xl border border-border/70 text-2xs font-mono font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('privacy')}
            className={`py-2 px-1 rounded-lg text-center transition-all ${
              activeTab === 'privacy'
                ? 'bg-accent text-bg-primary font-bold shadow-xs'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            Privacy
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('terms')}
            className={`py-2 px-1 rounded-lg text-center transition-all ${
              activeTab === 'terms'
                ? 'bg-accent text-bg-primary font-bold shadow-xs'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            Terms
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('medical')}
            className={`py-2 px-1 rounded-lg text-center transition-all ${
              activeTab === 'medical'
                ? 'bg-accent text-bg-primary font-bold shadow-xs'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            Safety
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('standards')}
            className={`py-2 px-1 rounded-lg text-center transition-all ${
              activeTab === 'standards'
                ? 'bg-accent text-bg-primary font-bold shadow-xs'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            Formulas
          </button>
        </div>

        {/* TAB 1: PRIVACY */}
        {activeTab === 'privacy' && (
          <div className="space-y-3.5 animate-fade-in text-xs font-mono text-text-secondary">
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-2xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-xs">
                <Lock className="w-3.5 h-3.5" />
                <span>100% On-Device Local Data Guarantee</span>
              </div>
              <p className="leading-relaxed">
                ASCEND operates without cloud tracking databases. Your PRs, workouts, and body metrics are saved strictly in your device&apos;s local storage.
              </p>
            </div>

            <div className="space-y-2.5 leading-relaxed text-2xs">
              <p>
                <strong>Data Collection:</strong> We collect only what you type (athlete name, bodyweight, height, PRs, workouts, nutrition). We do not record telemetry or advertise.
              </p>
              <p>
                <strong>AI &amp; External APIs:</strong> AI Coach and meal recognition use Google Gemini on-demand. Personal identifiers are never attached. If you provide a custom API key, it stays strictly in local device storage.
              </p>
              <p>
                <strong>GDPR &amp; CCPA Rights:</strong> You can export a complete `.json` copy of your data anytime from the Data Vault, or purge all local records with 1 tap.
              </p>
              <p>
                <strong>Cookies:</strong> Zero third-party ad cookies. Only essential functional localStorage keys (`ascend_store`) are used.
              </p>
            </div>

            <div className="pt-2 flex justify-between items-center text-2xs border-t border-border/60">
              <Link
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline flex items-center gap-1"
              >
                <span>Read Full Privacy Policy</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </div>
        )}

        {/* TAB 2: TERMS OF SERVICE */}
        {activeTab === 'terms' && (
          <div className="space-y-3.5 animate-fade-in text-xs font-mono text-text-secondary">
            <div className="p-3 rounded-xl bg-bg-secondary border border-border/80 space-y-1.5 text-2xs">
              <span className="font-bold text-text-primary flex items-center gap-1.5 text-xs">
                <Scale className="w-3.5 h-3.5 text-accent" />
                User Agreement &amp; Liability Cap
              </span>
              <p className="leading-relaxed">
                By using ASCEND, you acknowledge that all physical training is voluntary and conducted at your own risk. ASCEND is provided &quot;as-is&quot; without warranties.
              </p>
            </div>

            <div className="space-y-2.5 leading-relaxed text-2xs">
              <p>
                <strong>1. Assumption of Risk:</strong> Heavy resistance training involves risks of musculoskeletal injuries and cardiovascular stress. You voluntarily assume all such risks.
              </p>
              <p>
                <strong>2. User Backup Responsibility:</strong> Because data is stored locally on your device, ASCEND cannot recover lost data if you clear your browser without an exported backup.
              </p>
              <p>
                <strong>3. Intellectual Property:</strong> Software code and ASCEND branding are proprietary. Scientific formulas (Epley, DOTS) remain open scientific standards.
              </p>
            </div>

            <div className="pt-2 flex justify-between items-center text-2xs border-t border-border/60">
              <Link
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline flex items-center gap-1"
              >
                <span>Read Full Terms of Service</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </div>
        )}

        {/* TAB 3: MEDICAL & SAFETY (PAR-Q) */}
        {activeTab === 'medical' && (
          <div className="space-y-3.5 animate-fade-in text-xs font-mono text-text-secondary">
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200/90 text-2xs space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-amber-400 text-xs">
                <HeartPulse className="w-4 h-4" />
                <span>NOT MEDICAL OR COACHING ADVICE</span>
              </div>
              <p className="leading-relaxed">
                ASCEND is an analytical logbook. It is NOT a doctor, physical therapist, or certified coach. Always consult a physician prior to heavy lifting programs.
              </p>
            </div>

            <div className="space-y-2 leading-relaxed text-2xs">
              <span className="font-bold text-text-primary block">
                Physical Activity Readiness (PAR-Q) Questions:
              </span>
              <ul className="space-y-1 list-disc list-inside pl-1 text-text-muted">
                <li>Do you have high blood pressure or a heart condition?</li>
                <li>Do you experience chest pain or dizziness during exercise?</li>
                <li>Do you have joint or spinal issues aggravated by heavy loads?</li>
              </ul>
              <p className="text-amber-300 font-semibold pt-1">
                If you answered YES to any question, obtain medical clearance prior to testing 1RM lifts.
              </p>
              <p className="text-text-muted text-3xs pt-1">
                Hydration guidelines and creatine trackers are for informational reference only. Individuals with renal conditions or hypertension should consult a physician.
              </p>
            </div>

            <div className="pt-2 flex justify-between items-center text-2xs border-t border-border/60">
              <Link
                href="/disclaimer"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline flex items-center gap-1"
              >
                <span>Read Medical Disclaimer</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </div>
        )}

        {/* TAB 4: FORMULAS & STRENGTH STANDARDS */}
        {activeTab === 'standards' && (
          <div className="space-y-3.5 animate-fade-in text-xs font-mono text-text-secondary">
            <div className="p-3 rounded-xl bg-bg-secondary border border-border/80 space-y-2 text-2xs">
              <span className="font-bold text-text-primary flex items-center gap-1.5 text-xs">
                <BookOpen className="w-3.5 h-3.5 text-accent" />
                Scientific Powerlifting Formulas
              </span>
              <p>
                <strong>Epley 1-Rep Max Equation:</strong><br />
                <code className="text-accent">1RM = weight × (1 + reps / 30)</code>
              </p>
              <p>
                <strong>Official DOTS Coefficient:</strong><br />
                Normalizes strength across different bodyweight classes for fair pound-for-pound comparisons in powerlifting.
              </p>
            </div>

            <div className="space-y-1.5 text-2xs">
              <span className="font-bold text-text-primary block">
                7-Tier Exercise Rank Hierarchy:
              </span>
              <div className="grid grid-cols-2 gap-1 text-[11px]">
                <span className="p-1 rounded bg-bg-secondary border border-border/60">1. FOUNDATION</span>
                <span className="p-1 rounded bg-bg-secondary border border-border/60">2. TRAINED</span>
                <span className="p-1 rounded bg-bg-secondary border border-border/60">3. SKILLED</span>
                <span className="p-1 rounded bg-bg-secondary border border-border/60">4. ADVANCED</span>
                <span className="p-1 rounded bg-bg-secondary border border-border/60">5. ELITE</span>
                <span className="p-1 rounded bg-bg-secondary border border-border/60">6. MASTER</span>
                <span className="p-1 rounded bg-bg-secondary border border-border/60 col-span-2 text-center text-accent font-bold">
                  7. GRANDMASTER
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <button
          type="button"
          onClick={onClose}
          className="btn-primary w-full py-2.5 text-xs font-bold text-center font-mono"
        >
          I Acknowledge &amp; Agree
        </button>
      </div>
    </div>
  );
}
