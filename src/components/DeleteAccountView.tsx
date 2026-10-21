'use client';

import React, { useState, useEffect } from 'react';
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
  KeyRound,
  Send,
  UserCheck,
} from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { SUPPORT_EMAIL } from '@/lib/legal';
import { toUserMessage } from '@/lib/user-error';

export type DeletionStatus =
  | 'idle'
  | 'requesting_token'
  | 'token_requested'
  | 'deleting'
  | 'complete'
  | 'partial'
  | 'skipped'
  | 'error';

export interface DeleteAccountViewProps {
  initialStatus?: DeletionStatus;
  initialStatusDetails?: string | null;
  initialErrorMessage?: string | null;
  initialSessionUser?: { email: string; accessToken: string } | null;
  initialEmail?: string;
  initialVerificationToken?: string;
}

export function DeleteAccountView(props: DeleteAccountViewProps) {
  const [email, setEmail] = useState<string>(props.initialEmail || '');
  const [verificationToken, setVerificationToken] = useState<string>(props.initialVerificationToken || '');
  const [confirmText, setConfirmText] = useState<string>('');
  const [status, setStatus] = useState<DeletionStatus>(props.initialStatus || 'idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(props.initialErrorMessage || null);
  const [statusDetails, setStatusDetails] = useState<string | null>(props.initialStatusDetails || null);

  // Authentication state for signed-in users
  const [sessionUser, setSessionUser] = useState<{
    email: string;
    accessToken: string;
  } | null>(props.initialSessionUser !== undefined ? props.initialSessionUser : null);
  const [isCheckingSession, setIsCheckingSession] = useState<boolean>(props.initialSessionUser === undefined);

  // 1. Detect existing Supabase session & URL query parameters on mount
  useEffect(() => {
    let mounted = true;

    async function checkAuthAndUrl() {
      // Check for token in URL fragment (#token=...&email=...) or query (?token=...&email=...)
      // URI fragments are never transmitted to server/edge hosting logs, ensuring zero hosting log leakage
      if (typeof window !== 'undefined') {
        let urlToken: string | null = null;
        let urlEmail: string | null = null;

        // 1. Check URI fragment (#...)
        if (window.location.hash && window.location.hash.length > 1) {
          const hashParams = new URLSearchParams(window.location.hash.slice(1));
          urlToken = hashParams.get('token');
          urlEmail = hashParams.get('email');
        }

        // 2. Check query string (?...) as fallback
        if (!urlToken) {
          const searchParams = new URLSearchParams(window.location.search);
          urlToken = searchParams.get('token');
          urlEmail = urlEmail || searchParams.get('email');
        }

        if (urlEmail) {
          setEmail(urlEmail.trim().toLowerCase());
        }
        if (urlToken) {
          setVerificationToken(urlToken.trim());
        }

        // Immediately scrub sensitive token from browser address bar, hash, and history to prevent leakage
        if ((urlToken || urlEmail || window.location.hash || window.location.search) && window.history?.replaceState) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }

      // Check for active Supabase session
      try {
        const supabase = getSupabase();
        if (supabase) {
          const { data: { session } } = await supabase.auth.getSession();
          if (mounted && session?.user && session.access_token) {
            setSessionUser({
              email: session.user.email || '',
              accessToken: session.access_token,
            });
            if (session.user.email) {
              setEmail(session.user.email);
            }
          }
        }
      } catch {
        // Non-blocking
      } finally {
        if (mounted) {
          setIsCheckingSession(false);
        }
      }
    }

    checkAuthAndUrl();
    return () => {
      mounted = false;
    };
  }, []);

  // 2. Request a time-limited single-use verification link/token
  const handleRequestToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMessage('Please enter your registered account email.');
      return;
    }

    setStatus('requesting_token');
    setErrorMessage(null);

    try {
      const res = await fetch('/api/auth/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'request_verification',
          email: email.trim().toLowerCase(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setStatus('token_requested');
        setStatusDetails(
          data?.message ||
            'If an account is associated with this email, a single-use verification link has been sent to your address.'
        );
        if (data.debugToken) {
          setVerificationToken(data.debugToken);
        }
      } else {
        setStatus('error');
        setErrorMessage(data?.message || 'Failed to request verification link. Please try again.');
      }
    } catch (err: any) {
      setStatus('error');
      // QA4-016: sanitize — raw fetch errors don't belong in the UI.
      setErrorMessage(toUserMessage(err, 'generic'));
    }
  };

  // 3. Submit account deletion
  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMessage('Registered account email is required.');
      return;
    }

    if (confirmText.trim().toUpperCase() !== 'DELETE') {
      setStatus('error');
      setErrorMessage('Please type "DELETE" into the confirmation field to confirm.');
      return;
    }

    // Require either a signed-in session OR a verification token
    if (!sessionUser && !verificationToken.trim()) {
      setStatus('error');
      setErrorMessage(
        'A single-use verification token is required when not signed in. Please click "Request Verification Link" first.'
      );
      return;
    }

    setStatus('deleting');
    setErrorMessage(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (sessionUser?.accessToken) {
        headers['Authorization'] = `Bearer ${sessionUser.accessToken}`;
      }

      const res = await fetch('/api/auth/delete-account', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          token: verificationToken.trim() || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));

      // Requirement 5: Accurately report complete, partial, and failed deletion
      if (res.status === 200 && data.cloudDeleted === true) {
        setStatus('complete');
        setStatusDetails(
          data?.message ||
            'Your ASCEND cloud account and all associated athletic data have been permanently purged.'
        );
        wipeLocalData();
      } else if (
        res.status === 200 &&
        data.cloudDeleted === false &&
        data.message?.includes('Cloud deletion skipped')
      ) {
        setStatus('skipped');
        setStatusDetails(
          data.message ||
            'Cloud deletion skipped: Cloud synchronization is not enabled in this environment. Local device data has been purged.'
        );
        wipeLocalData();
      } else if (res.status === 207 || (data.cloudDeleted === false && data.authPurged)) {
        setStatus('partial');
        setStatusDetails(
          data?.message ||
            `Partial deletion: Your login credentials and authentication account were purged, but some database records could not be fully cleared. Please contact ${SUPPORT_EMAIL} for manual verification.`
        );
        wipeLocalData();
      } else {
        setStatus('error');
        setErrorMessage(
          data?.message ||
            'Account deletion failed or unauthorized. No data was deleted. Please verify your credentials or request a new verification link.'
        );
      }
    } catch (err: any) {
      setStatus('error');
      // QA4-016: sanitize raw errors; keep the support path in the copy.
      setErrorMessage(
        `${toUserMessage(err, 'generic')} If it keeps happening, contact ${SUPPORT_EMAIL} for manual processing.`
      );
    }
  };

  /** Wipes client-side cache and tokens upon deletion */
  const wipeLocalData = () => {
    if (typeof window !== 'undefined') {
      try {
        const keysToRemove = [
          'ascend_store',
          'ascend_profile',
          'ascend_prs',
          'ascend_workouts',
          'ascend_meals',
          'ascend_body_metrics',
          'ascend_emergency_snapshot',
          'ascend_planned_workouts',
          'ascend_telemetry_consent',
          'ascend_reminders',
          'ascend_notification_prefs',
        ];
        keysToRemove.forEach((k) => localStorage.removeItem(k));
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith('sb-') || k.startsWith('ascend_'))) {
            localStorage.removeItem(k);
          }
        }
        localStorage.setItem('ascend_logged_out', 'true');
      } catch {
        // Best effort local wipe
      }
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
          <div className="size-8 rounded-lg bg-bg-secondary border border-border flex items-center justify-center text-accent">
            <Dumbbell className="size-4" />
          </div>
          <span className="text-lg font-black tracking-tight font-mono text-text-primary group-hover:text-accent transition-colors">
            ASCEND
          </span>
        </Link>

        <Link
          href="/"
          className="btn-secondary py-1.5 px-3 text-xs font-mono flex items-center gap-1.5"
        >
          <ArrowLeft className="size-3.5" />
          <span>Dashboard</span>
        </Link>
      </div>

      {/* Page Title */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-danger">
          <Trash2 className="size-6" />
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
          <ShieldAlert className="size-4" />
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
          <CloudOff className="size-4 text-accent" />
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
          <HardDrive className="size-4 text-accent" />
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
          </ol>
        </div>
      </div>

      {/* Method 2: Web Deletion Portal */}
      <div className="space-y-3 font-mono text-xs">
        <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
          <Mail className="size-4 text-danger" />
          Method 2: External Web Deletion Request Form
        </h2>
        <div className="p-4 rounded-xl bg-bg-secondary border border-border/70 space-y-4">
          <p className="text-2xs text-text-secondary leading-relaxed">
            If you have uninstalled the app or do not have an active session, you can securely delete
            your account using a verified identity session or a single-use verification link:
          </p>

          {/* ACTIVE SESSION BADGE */}
          {!isCheckingSession && sessionUser && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-2xs flex items-center gap-2">
              <UserCheck className="size-4 shrink-0" />
              <span>
                Authenticated as <strong>{sessionUser.email}</strong>. Deletion is pre-authorized.
              </span>
            </div>
          )}

          {/* OUTCOME REPORTING (Requirement 5) */}
          {status === 'complete' && (
            <div
              data-testid="status-complete"
              className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 space-y-2"
            >
              <div className="flex items-center gap-2 font-bold text-xs">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>Account &amp; Cloud Data Permanently Purged</span>
              </div>
              <p className="text-2xs leading-relaxed opacity-90">{statusDetails}</p>
              <div className="pt-2">
                <Link
                  href="/"
                  className="btn-primary inline-flex items-center gap-2 py-1.5 px-3 text-2xs font-mono"
                >
                  <ArrowLeft className="size-3" />
                  <span>Return to Home</span>
                </Link>
              </div>
            </div>
          )}

          {status === 'partial' && (
            <div
              data-testid="status-partial"
              className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 space-y-2"
            >
              <div className="flex items-center gap-2 font-bold text-xs">
                <AlertTriangle className="size-4 shrink-0" />
                <span>Partial Deletion (207 Multi-Status)</span>
              </div>
              <p className="text-2xs leading-relaxed opacity-90">{statusDetails}</p>
              <div className="pt-1">
                <button
                  type="button"
                  data-testid="retry-cleanup-btn"
                  onClick={handleDeleteAccount}
                  className="btn-secondary py-1.5 px-3 text-2xs font-mono font-bold"
                >
                  Resume Incomplete Cleanup
                </button>
              </div>
              <p className="text-3xs text-text-muted">
                Our privacy response team has been alerted. You can also contact us at{' '}
                <a href={`mailto:${SUPPORT_EMAIL}`} rel="noreferrer" className="underline font-mono">
                  {SUPPORT_EMAIL}
                </a>
                .
              </p>
            </div>
          )}

          {status === 'skipped' && (
            <div
              data-testid="status-skipped"
              className="p-3.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 space-y-2"
            >
              <div className="flex items-center gap-2 font-bold text-xs">
                <CloudOff className="size-4 shrink-0" />
                <span>Cloud Deletion Skipped (Offline Environment)</span>
              </div>
              <p className="text-2xs leading-relaxed opacity-90">{statusDetails}</p>
            </div>
          )}

          {status !== 'complete' && status !== 'partial' && status !== 'skipped' && (
            <>
              {/* STEP 1: Request Verification Link (if not signed in and no token) */}
              {!sessionUser && !verificationToken && (
                <div className="p-3.5 rounded-lg bg-bg-primary border border-border space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-accent">
                    <KeyRound className="size-3.5" />
                    <span>Step 1: Request Single-Use Verification Link</span>
                  </div>
                  <p className="text-3xs text-text-secondary leading-relaxed">
                    To prevent unauthorized deletion, enter your email to receive a single-use,
                    15-minute verification link.
                  </p>
                  <form onSubmit={handleRequestToken} className="space-y-2.5">
                    <div>
                      <label
                        htmlFor="request-email"
                        className="block text-2xs uppercase tracking-wider font-bold text-text-muted mb-1"
                      >
                        Registered Account Email
                      </label>
                      <input
                        id="request-email"
                        type="email"
                        required
                        placeholder="athlete@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={status === 'requesting_token'}
                        className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent font-mono"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={status === 'requesting_token' || !email.trim()}
                      className="btn-secondary w-full py-2 px-3 text-xs font-mono font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {status === 'requesting_token' ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" />
                          <span>Sending Link...</span>
                        </>
                      ) : (
                        <>
                          <Send className="size-3.5" />
                          <span>Send Deletion Verification Link</span>
                        </>
                      )}
                    </button>
                  </form>
                  {status === 'token_requested' && (
                    <div
                      data-testid="token-requested-banner"
                      className="p-2.5 rounded-lg bg-accent/10 border border-accent/30 text-accent text-2xs"
                    >
                      {statusDetails}
                    </div>
                  )}
                </div>
              )}

              {/* STEP 2: Confirm Deletion */}
              <form onSubmit={handleDeleteAccount} className="space-y-3 pt-1">
                <div>
                  <label
                    htmlFor="deletion-email"
                    className="block text-2xs uppercase tracking-wider font-bold text-text-muted mb-1"
                  >
                    Account Email
                  </label>
                  <input
                    id="deletion-email"
                    type="email"
                    required
                    placeholder="athlete@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={status === 'deleting' || !!sessionUser}
                    className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-danger font-mono disabled:opacity-75"
                  />
                </div>

                {!sessionUser && (
                  <div>
                    <label
                      htmlFor="deletion-token"
                      className="block text-2xs uppercase tracking-wider font-bold text-text-muted mb-1"
                    >
                      Verification Token (from email link)
                    </label>
                    <input
                      id="deletion-token"
                      type="text"
                      placeholder="del_eyJ..."
                      value={verificationToken}
                      onChange={(e) => setVerificationToken(e.target.value)}
                      disabled={status === 'deleting'}
                      className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-danger font-mono"
                    />
                  </div>
                )}

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
                    disabled={status === 'deleting'}
                    className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-danger font-mono tracking-wider"
                  />
                </div>

                {status === 'error' && errorMessage && (
                  <div
                    data-testid="deletion-error"
                    className="p-2.5 rounded-lg bg-danger/10 border border-danger/30 text-danger text-2xs flex items-start gap-2"
                  >
                    <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={
                    status === 'deleting' ||
                    !email.trim() ||
                    confirmText.trim().toUpperCase() !== 'DELETE' ||
                    (!sessionUser && !verificationToken.trim())
                  }
                  className="btn-danger w-full py-2.5 px-4 text-xs font-mono font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {status === 'deleting' ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      <span>Purging Account &amp; Data...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="size-3.5" />
                      <span>Permanently Delete Account &amp; Data</span>
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          <p className="text-3xs text-text-muted">
            For manual assistance or inquiries, email our privacy team directly at{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent underline font-mono">
              {SUPPORT_EMAIL}
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
          <ArrowLeft className="size-3.5" />
          <span>Back to Dashboard</span>
        </Link>
      </div>
    </main>
  );
}
