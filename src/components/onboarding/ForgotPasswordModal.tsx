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
      <div className="w-full max-w-sm rounded-2xl bg-white border border-[#E2DFD6] p-6 shadow-2xl text-[#171916] space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#E2DFD6]">
          <h3 className="text-base font-bold text-[#171916]">Reset Password</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-[#F3F0E7] flex items-center justify-center text-[#858076] hover:text-[#171916] transition-colors cursor-pointer"
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
            <h4 className="text-sm font-bold text-[#171916]">Check your inbox</h4>
            <p className="text-xs text-[#858076] leading-relaxed">
              We&apos;ve sent password reset instructions to{' '}
              <strong className="text-[#171916] font-medium">{email}</strong>.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 w-full py-2.5 px-4 rounded-xl bg-[#E44427] text-white font-semibold text-xs hover:bg-[#d03b20] transition cursor-pointer"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-xs text-[#858076] leading-relaxed">
              Enter your account email address and we&apos;ll send you a link to reset your password.
            </p>

            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="reset-email" className="block text-xs font-semibold text-[#171916] mb-1.5">
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
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white border border-[#E2DFD6] focus:border-[#E44427] focus:ring-1 focus:ring-[#E44427] text-xs text-[#171916] outline-none transition"
                />
                <Mail className="w-4 h-4 text-[#858076] absolute left-3 top-3 pointer-events-none" />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="w-1/2 py-2.5 rounded-xl border border-[#E2DFD6] text-xs font-semibold text-[#858076] hover:bg-[#F3F0E7] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="w-1/2 py-2.5 rounded-xl bg-[#E44427] hover:bg-[#d03b20] text-xs font-semibold text-white transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
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
