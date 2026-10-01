'use client';

import React from 'react';
import { X, ShieldCheck, Lock, HardDrive, AlertTriangle, FileText, Sparkles, Barcode } from 'lucide-react';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PrivacyPolicyModal({ isOpen, onClose }: PrivacyPolicyModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content p-5 space-y-4 max-w-md w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-base text-text-primary leading-tight">
                Privacy Policy &amp; Legal Terms
              </h2>
              <p className="text-2xs text-text-muted font-mono">ASCEND v2.2 • Offline-First Privacy</p>
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

        {/* Highlight Banner */}
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono space-y-1">
          <div className="flex items-center gap-1.5 font-bold">
            <Lock className="w-3.5 h-3.5" />
            <span>100% On-Device Local Privacy Guarantee</span>
          </div>
          <p className="text-2xs opacity-90 leading-relaxed">
            ASCEND does not transmit, harvest, monetize, or sell your personal fitness records. All calculations, PRs, workouts, and body metrics reside strictly within your device&apos;s browser memory.
          </p>
        </div>

        {/* Content Sections */}
        <div className="space-y-4 text-xs font-mono text-text-secondary leading-relaxed pr-1">
          {/* Section 1 */}
          <div className="space-y-1">
            <h4 className="font-bold text-text-primary flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-accent" />
              1. Information Collection &amp; Local Storage
            </h4>
            <p className="text-2xs">
              We collect only the information you voluntarily input: your athlete name, biological sex, bodyweight, height, personal records (PRs), workout logs, hydration, creatine, and nutrition macros.
            </p>
            <p className="text-2xs">
              This data is stored solely in your device&apos;s local storage (<code className="text-text-primary">localStorage</code>). We operate no remote cloud user databases, logins, or tracking pixels.
            </p>
          </div>

          {/* Section 2 */}
          <div className="space-y-1">
            <h4 className="font-bold text-text-primary flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              2. Generative AI (Google Gemini) &amp; Barcode Lookups
            </h4>
            <p className="text-2xs">
              Optional AI tools (Coach, Meal Photo Scanner, Natural Language Meal Log) communicate with Google Gemini only when triggered on-demand. Personal identifiers are never sent. If you add a custom Gemini API Key, it is saved exclusively in your device&apos;s local memory. Barcode scans query Open Food Facts anonymously.
            </p>
          </div>

          {/* Section 3 */}
          <div className="space-y-1">
            <h4 className="font-bold text-text-primary flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              3. Medical &amp; Physical Activity Disclaimer
            </h4>
            <p className="text-2xs text-amber-200/90 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20">
              <strong>CRITICAL NOTICE:</strong> Heavy resistance training and powerlifting involve inherent risks of physical injury. ASCEND is an analytical tracking tool, NOT a licensed medical professional, physical therapist, or personal trainer. Always consult a qualified physician prior to starting or intensifying any strength program.
            </p>
          </div>

          {/* Section 4 */}
          <div className="space-y-1">
            <h4 className="font-bold text-text-primary flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-accent" />
              4. Data Ownership &amp; Portability (GDPR &amp; CCPA)
            </h4>
            <p className="text-2xs">
              Under GDPR and CCPA privacy standards, you maintain complete ownership of your fitness data:
            </p>
            <ul className="list-disc list-inside text-2xs space-y-1 pl-1">
              <li><strong>Right to Export:</strong> Download a full <code className="text-text-primary">.json</code> copy of your data anytime via the Data Vault.</li>
              <li><strong>Right to Erasure:</strong> Purge all local data from your device instantly via &quot;Delete WebApp Data&quot;.</li>
              <li><strong>Zero Tracking:</strong> Zero telemetry or advertising cookies.</li>
            </ul>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="btn-primary w-full py-2.5 text-xs font-bold text-center"
        >
          I Understand &amp; Agree
        </button>
      </div>
    </div>
  );
}
