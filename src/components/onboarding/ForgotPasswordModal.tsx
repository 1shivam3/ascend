'use client';

import React, { useState } from 'react';
import { X, Mail, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { syncEngine } from '@/lib/supabase/sync';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialEmail?: string;
}

export default function ForgotPasswordModal({
  isOpen,
  onClose,
  initialEmail = '',
}: ForgotPasswordModalProps) {
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    const res = await syncEngine.resetPasswordForEmail(email.trim());
    setLoading(false);

    if (res.error) {
      setError(res.error);
    } else {
      setSent(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="w-full max-w-sm rounded-2xl bg-bg-card border border-border p-6 shadow-2xl text-text-primary space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <h3 className="text-base font-bold text-text-primary">Reset Password</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-bg-primary flex items-center justify-center text-text-muted hover:text-text-primary transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {sent ? (
          <div className="py-4 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-text-primary">Check your inbox</h4>
            <p className="text-xs text-text-muted leading-relaxed">
              We&apos;ve sent password reset instructions to{' '}
              <strong className="text-text-primary font-medium">{email}</strong>.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 w-full py-2.5 px-4 rounded-xl bg-accent text-white font-semibold text-xs hover:bg-accent-dim transition cursor-pointer"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-xs text-text-muted leading-relaxed">
              Enter your account email address and we&apos;ll send you a link to reset your password.
            </p>

            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="reset-email" className="block text-xs font-semibold text-text-primary mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-bg-card border border-border focus:border-accent focus:ring-1 focus:ring-accent text-xs text-text-primary outline-none transition"
                />
                <Mail className="w-4 h-4 text-text-muted absolute left-3 top-3 pointer-events-none" />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="w-1/2 py-2.5 rounded-xl border border-border text-xs font-semibold text-text-muted hover:bg-bg-primary transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="w-1/2 py-2.5 rounded-xl bg-accent hover:bg-accent-dim text-xs font-semibold text-white transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Send Link'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
