'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Dumbbell,
  ArrowLeft,
  Trash2,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Mail,
  Loader2,
  HardDrive,
  CloudOff,
  ExternalLink,
} from 'lucide-react';

export default function DeleteAccountPage() {
  const [email, setEmail] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successDetails, setSuccessDetails] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    if (confirmText.trim().toUpperCase() !== 'DELETE') {
      setStatus('error');
      setErrorMessage('Please type "DELETE" into the confirmation field to confirm.');
      return;
    }

    setStatus('loading');
    setErrorMessage(null);

    try {
      const res = await fetch('/api/auth/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.message || 'Failed to process account deletion request.');
      }

      setStatus('success');
      setSuccessDetails(
        data?.message ||
          'Your ASCEND cloud account and associated database records have been permanently purged.'
      );
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(
        err?.message ||
          'Unable to complete deletion request automatically. Please contact support@ascendfit.app for manual processing.'
      );
    }
  };

  return (
    <main
      id="main-content"
      className="min-h-screen bg-bg-primary text-text-primary px-4 py-8 max-w-xl mx-auto space-y-6"
    >
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

      {/* Page Title */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-danger">
          <Trash2 className="w-6 h-6" />
          <h1 className="text-xl sm:text-2xl font-black font-mono tracking-tight">
            ACCOUNT &amp; DATA DELETION
          </h1>
        </div>
        <p className="text-xs text-text-muted font-mono">
          Google Play Store Data Safety &bull; GDPR Article 17 Right to Erasure &bull; CCPA Compliant
        </p>
      </div>

      {/* Transparency Guarantee Card */}
      <div className="p-4 rounded-xl bg-danger/10 border border-danger/30 text-xs font-mono space-y-2">
        <div className="flex items-center gap-2 font-bold text-sm text-danger">
          <ShieldAlert className="w-4 h-4" />
          <span>Complete &amp; Permanent Erasure Policy</span>
        </div>
        <p className="text-2xs text-text-secondary leading-relaxed">
          ASCEND enforces a strict zero-retention policy upon account deletion. When you delete your
          account, all associated personal and athletic data is permanently eradicated from our
          systems immediately with <strong>0 days retention</strong>.
        </p>
      </div>

      {/* What is deleted breakdown */}
      <div className="space-y-3 font-mono text-xs">
        <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
          <CloudOff className="w-4 h-4 text-accent" />
          Data Destroyed Upon Request
        </h2>
        <div className="p-3.5 rounded-xl bg-bg-secondary border border-border/70 space-y-2 text-2xs text-text-secondary">
          <ul className="list-disc list-inside space-y-1.5">
            <li>
              <strong>Athlete Identity:</strong> User profile, email address, display name, and
              authentication credentials in Supabase Auth.
            </li>
            <li>
              <strong>Strength &amp; Performance:</strong> All personal records (PRs), 1RM
              calculations, and progression milestones.
            </li>
            <li>
              <strong>Workout Records:</strong> All past workout sessions, exercises, sets, reps,
              RPE ratings, and saved workout plans.
            </li>
            <li>
              <strong>Nutrition &amp; Habits:</strong> Logged meals, macro totals, custom barcode
              lookups, water intake logs, and creatine records.
            </li>
            <li>
              <strong>Notifications &amp; Subscriptions:</strong> Push notification device tokens
              and reminder schedules.
            </li>
            <li>
              <strong>Local Cache:</strong> In-app deletion also wipes all browser and device{' '}
              <code className="text-text-primary bg-bg-primary px-1 py-0.5 rounded">localStorage</code>{' '}
              snapshots.
            </li>
          </ul>
        </div>
      </div>

      {/* Method 1: In-App Instructions */}
      <div className="space-y-3 font-mono text-xs">
        <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-accent" />
          Method 1: Direct In-App Deletion (Instant)
        </h2>
        <div className="p-3.5 rounded-xl bg-bg-secondary border border-border/70 space-y-2 text-2xs text-text-secondary">
          <p className="font-semibold text-text-primary">If you have the ASCEND app installed:</p>
          <ol className="list-decimal list-inside space-y-1.5 pl-1">
            <li>
              Open ASCEND and navigate to <strong>Settings</strong> (gear icon in the top header).
            </li>
            <li>
              Scroll to the <strong>Account &amp; Privacy</strong> section.
            </li>
            <li>
              (Optional) Tap <strong>Export my data</strong> to download an offline JSON backup.
            </li>
            <li>
              Tap <strong>Delete my account</strong>, review the warning, and confirm deletion.
            </li>
            <li>
              All cloud accounts and local device storage are immediately purged, returning the app
              to factory state.
            </li>
          </ol>
        </div>
      </div>

      {/* Method 2: Web Deletion Request Form */}
      <div className="space-y-3 font-mono text-xs">
        <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
          <Mail className="w-4 h-4 text-danger" />
          Method 2: External Web Deletion Request Form
        </h2>
        <div className="p-4 rounded-xl bg-bg-secondary border border-border/70 space-y-3">
          <p className="text-2xs text-text-secondary leading-relaxed">
            If you have uninstalled the app or cannot access your device, submit the registered Google
            or Supabase email address below to initiate complete account and cloud data purge:
          </p>

          {status === 'success' ? (
            <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 space-y-2">
              <div className="flex items-center gap-2 font-bold text-xs">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Account Deletion Processed</span>
              </div>
              <p className="text-2xs leading-relaxed opacity-90">{successDetails}</p>
              <div className="pt-2">
                <Link
                  href="/"
                  className="btn-primary inline-flex items-center gap-2 py-1.5 px-3 text-2xs font-mono"
                >
                  <ArrowLeft className="w-3 h-3" />
                  <span>Return to Home</span>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label
                  htmlFor="deletion-email"
                  className="block text-2xs uppercase tracking-wider font-bold text-text-muted mb-1"
                >
                  Registered Account Email
                </label>
                <input
                  id="deletion-email"
                  type="email"
                  required
                  placeholder="athlete@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={status === 'loading'}
                  className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-danger font-mono"
                />
              </div>

              <div>
                <label
                  htmlFor="deletion-confirm"
                  className="block text-2xs uppercase tracking-wider font-bold text-text-muted mb-1"
                >
                  Type &quot;DELETE&quot; to Confirm
                </label>
                <input
                  id="deletion-confirm"
                  type="text"
                  required
                  placeholder="DELETE"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  disabled={status === 'loading'}
                  className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-danger font-mono tracking-wider"
                />
              </div>

              {status === 'error' && errorMessage && (
                <div className="p-2.5 rounded-lg bg-danger/10 border border-danger/30 text-danger text-2xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={status === 'loading' || !email.trim() || confirmText.trim().toUpperCase() !== 'DELETE'}
                className="btn-danger w-full py-2.5 px-4 text-xs font-mono font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {status === 'loading' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing Deletion...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Permanently Delete Account &amp; Data</span>
                  </>
                )}
              </button>
            </form>
          )}

          <p className="text-3xs text-text-muted">
            For manual assistance or inquiries, email our privacy team directly at{' '}
            <a href="mailto:support@ascendfit.app" className="text-accent underline font-mono">
              support@ascendfit.app
            </a>
            . Manual requests are fulfilled within 24 hours.
          </p>
        </div>
      </div>

      {/* Footer Links */}
      <div className="pt-4 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
        <Link href="/privacy" className="text-2xs font-mono text-accent hover:underline">
          View Full Privacy Policy &rarr;
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
