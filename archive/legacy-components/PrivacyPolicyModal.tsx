'use client';

import React from 'react';
import { X, ShieldCheck, Lock, HardDrive, AlertTriangle, FileText, Sparkles, Barcode, Trash2, Camera, Mic } from 'lucide-react';
import Link from 'next/link';

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
              <p className="text-3xs text-text-muted font-mono">ASCEND v2.3 • Global &amp; Play Store Compliant</p>
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
            ASCEND does not harvest, monetize, sell, or sync your personal fitness records. All calculations, PRs, workouts, and body metrics reside strictly within your device&apos;s browser memory.
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
              We collect only the information you voluntarily input: your athlete name, biological sex, bodyweight, height, personal records (PRs), workout logs, weekly schedule, hydration, creatine, and nutrition macros.
            </p>
            <p className="text-2xs">
              This data is stored solely in your device&apos;s local storage (<code className="text-text-primary">localStorage</code>). We operate no remote cloud user databases, logins, or tracking pixels.
            </p>
          </div>

          {/* Section 2 */}
          <div className="space-y-1">
            <h4 className="font-bold text-text-primary flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              2. Generative AI (Google Gemini) &amp; Safety Reporting
            </h4>
            <p className="text-2xs">
              Optional AI tools (Coach, Meal Photo Scanner, Voice Logger) communicate with Google Gemini on-demand. Personal identifiers are never sent. If you add a custom Gemini API Key, it is saved exclusively in local memory.
            </p>
            <p className="text-2xs text-accent">
              • In-App Reporting: Users can report inappropriate, inaccurate, or unsafe AI outputs directly using the flag button next to any AI advice.
            </p>
          </div>

          {/* Section 3 */}
          <div className="space-y-1">
            <h4 className="font-bold text-text-primary flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-accent" />
              3. Device Permissions (Camera &amp; Microphone)
            </h4>
            <p className="text-2xs">
              Camera access is used strictly for in-memory barcode scanning and meal photo analysis. Microphone access is used for hands-free speech-to-text workout dictation. Audio and video streams are never recorded or stored remotely.
            </p>
          </div>

          {/* Section 4 */}
          <div className="space-y-1">
            <h4 className="font-bold text-text-primary flex items-center gap-1.5">
              <Trash2 className="w-3.5 h-3.5 text-danger" />
              4. Complete User Data Deletion (Play Store Compliant)
            </h4>
            <p className="text-2xs">
              You maintain 100% control over your data. You can delete all your records, profile, and history anytime by going to <strong>Settings &rarr; Data Vault &rarr; Wipe All Data</strong>. Because data is stored locally, wiping leaves zero residual copies on any server.
            </p>
          </div>

          {/* Section 5 */}
          <div className="space-y-1">
            <h4 className="font-bold text-text-primary flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              5. Medical &amp; Physical Activity Disclaimer
            </h4>
            <p className="text-2xs text-amber-200/90 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20">
              <strong>CRITICAL NOTICE:</strong> Heavy resistance training involves inherent risks of physical injury. ASCEND is an analytical tracking tool, NOT a physician, physical therapist, or registered dietitian. Always consult a qualified healthcare professional prior to starting or intensifying any strength program.
            </p>
          </div>
        </div>

        <div className="flex gap-2 pt-2 border-t border-border/60">
          <Link
            href="/privacy"
            target="_blank"
            className="btn-secondary flex-1 py-2 text-xs font-mono text-center"
          >
            Full Legal Document &rarr;
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="btn-primary flex-1 py-2 text-xs font-bold text-center"
          >
            I Understand &amp; Agree
          </button>
        </div>
      </div>
    </div>
  );
}
