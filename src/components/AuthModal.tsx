'use client';

import React, { useState, useEffect } from 'react';
import { X, Shield, Loader2, CheckCircle2, Cloud } from 'lucide-react';
import { useSupabaseSync } from '@/lib/supabase/useSupabaseSync';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { useAppNavigation } from '@/lib/navigation';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { user, signInWithGoogle, signOut } = useSupabaseSync();
  const toast = useToast();
  const { registerBackHandler } = useAppNavigation();
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
      // On success, browser will redirect to Google's official OAuth consent
    } catch {
      toast.error('Could not initiate Google sign in.', 'Sign-In Error');
      setLoading(false);
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
              <Cloud className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-text-primary tracking-tight font-sans">
                {isPermanentUser ? 'Cloud Account' : 'Link Google Account'}
              </h2>
              <p className="text-3xs text-text-muted font-mono">
                {isPermanentUser ? 'Cloud Backup Active' : 'Never lose your workouts'}
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
                <span className="text-xs font-bold">Google Account Connected</span>
              </div>
              <p className="text-2xs text-text-primary font-mono truncate">
                {user.email}
              </p>
              <p className="text-3xs text-text-muted leading-relaxed">
                All your PRs, workouts, meals, and body metrics are safely synced with PostgreSQL.
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
          /* Sign-In With Google */
          <div className="space-y-4 pt-1">
            <p className="text-2xs text-text-secondary leading-relaxed">
              Link your Google account in 1 tap to save all your PRs, workouts, and meals permanently.
            </p>

            <div className="space-y-2 p-3 rounded-xl bg-bg-secondary/40 border border-border/60 text-2xs text-text-muted">
              <div className="flex items-center gap-2 text-text-primary">
                <CheckCircle2 className="w-3.5 h-3.5 text-accent shrink-0" />
                <span>Instant cross-device sync (phone &amp; laptop)</span>
              </div>
              <div className="flex items-center gap-2 text-text-primary">
                <CheckCircle2 className="w-3.5 h-3.5 text-accent shrink-0" />
                <span>Zero data loss when clearing browser cache</span>
              </div>
              <div className="flex items-center gap-2 text-text-primary">
                <CheckCircle2 className="w-3.5 h-3.5 text-accent shrink-0" />
                <span>Existing workouts are linked automatically</span>
              </div>
            </div>

            {/* Continue with Google Button */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-white hover:bg-zinc-100 active:scale-98 text-zinc-900 font-semibold text-xs sm:text-sm transition-all shadow-md cursor-pointer disabled:opacity-50"
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

            <div className="flex items-center justify-center gap-1.5 text-3xs text-text-muted pt-1">
              <Shield className="w-3 h-3 text-emerald-500 shrink-0" />
              <span>Protected by PostgreSQL Row-Level Security</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
