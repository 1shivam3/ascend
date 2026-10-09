'use client';

import React, { useState, useEffect } from 'react';
import { X, Mail, Shield, ArrowRight, Loader2, CheckCircle2, RefreshCw } from 'lucide-react';
import { useSupabaseSync } from '@/lib/supabase/useSupabaseSync';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { useAppNavigation } from '@/lib/navigation';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { user, signInWithGoogle, sendEmailOtp, verifyEmailOtp, signOut } = useSupabaseSync();
  const toast = useToast();
  const { registerBackHandler } = useAppNavigation();

  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    return registerBackHandler(() => {
      onClose();
      return true;
    }, 100);
  }, [isOpen, onClose, registerBackHandler]);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) {
        toast.error(error, 'Google Sign-In Failed');
        setLoading(false);
      }
      // On success, browser redirects to Google OAuth flow
    } catch {
      toast.error('Could not initiate Google sign in.', 'Sign-In Error');
      setLoading(false);
    }
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      toast.error('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    const { error } = await sendEmailOtp(email.trim());
    setLoading(false);

    if (error) {
      toast.error(error, 'Email Failed');
    } else {
      setStep('otp');
      toast.success(`Login code and magic link sent to ${email}`, 'Check Your Inbox');
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) {
      toast.error('Please enter the code from your email.');
      return;
    }

    setLoading(true);
    const { error } = await verifyEmailOtp(email, token);
    setLoading(false);

    if (error) {
      toast.error(error, 'Verification Failed');
    } else {
      toast.success('Successfully signed in! Your workouts are synced.', 'Welcome Back');
      onClose();
    }
  };

  const isPermanentUser = user && !user.isAnonymous && user.email;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm rounded-2xl bg-bg-card border border-border p-5 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-border/70">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-text-primary tracking-tight font-sans">
                {isPermanentUser ? 'Cloud Account' : 'Connect Cloud Account'}
              </h2>
              <p className="text-3xs text-text-muted font-mono">
                {isPermanentUser ? 'Permanent Backup Active' : 'Never lose your workouts'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* If already signed in */}
        {isPermanentUser ? (
          <div className="space-y-3.5 py-1">
            <div className="p-3.5 rounded-xl bg-bg-secondary/70 border border-emerald-500/30 space-y-1.5">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="text-xs font-bold">Cloud Sync Connected</span>
              </div>
              <p className="text-2xs text-text-primary font-mono truncate">
                {user.email}
              </p>
              <p className="text-3xs text-text-muted">
                All your PRs, workouts, meals, and body metrics are safely saved to PostgreSQL.
              </p>
            </div>

            <Button
              variant="danger"
              size="sm"
              fullWidth
              onClick={async () => {
                await signOut();
                toast.info('Signed out of cloud account.');
                onClose();
              }}
            >
              Sign Out of Cloud Account
            </Button>
          </div>
        ) : (
          /* Sign-In Options */
          <div className="space-y-4 pt-1">
            <p className="text-2xs text-text-secondary leading-relaxed">
              Lock in your training history forever. Access your workouts from your phone, laptop, or any new device.
            </p>

            {/* 1. Continue with Google */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl bg-white hover:bg-zinc-100 text-zinc-900 font-semibold text-xs transition-all shadow-sm active:scale-98 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin text-zinc-900" />
              ) : (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              )}
              <span>Continue with Google</span>
            </button>

            {/* Divider */}
            <div className="relative flex items-center justify-center">
              <div className="border-t border-border w-full" />
              <span className="bg-bg-card px-2.5 text-3xs font-mono uppercase text-text-muted absolute">
                or with email
              </span>
            </div>

            {/* 2. Email Sign-In */}
            {step === 'email' ? (
              <form onSubmit={handleSendCode} className="space-y-2.5">
                <div className="space-y-1">
                  <label className="text-3xs font-mono uppercase text-text-muted">Email Address</label>
                  <div className="relative">
                    <input
                      type="email"
                      required
                      placeholder="athlete@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-bg-secondary border border-border rounded-xl px-3 py-2 pl-8 text-xs text-text-primary font-mono focus:border-accent outline-none"
                    />
                    <Mail className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-2.5" />
                  </div>
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  fullWidth
                  type="submit"
                  disabled={loading}
                  leftIcon={loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                >
                  {loading ? 'Sending...' : 'Send Login Code'}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-2.5 animate-fade-in">
                <div className="space-y-1">
                  <label className="text-3xs font-mono uppercase text-text-muted">Enter 6-Digit Code</label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    placeholder="123456"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className="w-full text-center tracking-widest bg-bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-text-primary font-mono focus:border-accent outline-none font-bold"
                  />
                  <p className="text-3xs text-text-muted text-center pt-0.5">
                    Sent to <span className="text-text-primary">{email}</span>
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    className="flex-1"
                    type="submit"
                    disabled={loading}
                    leftIcon={loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined}
                  >
                    {loading ? 'Verifying...' : 'Verify & Sign In'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    onClick={() => setStep('email')}
                  >
                    Change
                  </Button>
                </div>
              </form>
            )}

            <p className="text-3xs text-text-muted text-center pt-1 leading-relaxed">
              Protected by PostgreSQL Row-Level Security. We will never sell your data or send spam.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
