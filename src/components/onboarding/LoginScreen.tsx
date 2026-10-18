'use client';

import React, { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { syncEngine } from '@/lib/supabase/sync';
import { useToast } from '@/components/ui/Toast';
import SocialAuthButtons from './SocialAuthButtons';
import ForgotPasswordModal from './ForgotPasswordModal';

interface LoginScreenProps {
  onBack: () => void;
  onSuccess: () => void;
  onNavigateToSignup: () => void;
}

export default function LoginScreen({
  onBack,
  onSuccess,
  onNavigateToSignup,
}: LoginScreenProps) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isForgotOpen, setIsForgotOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      const res = await syncEngine.signInWithPassword(trimmedEmail, password);
      setLoading(false);

      if (res.error) {
        setError(res.error);
        toast.error(res.error, 'Login Failed');
      } else {
        toast.success('Welcome back to ASCEND!', 'Logged In');
        onSuccess();
      }
    } catch (err: any) {
      setLoading(false);
      setError(err?.message || 'Could not sign in');
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#F3F0E7] text-[#171916] flex flex-col justify-between p-6 sm:p-8 animate-fade-in">
      {/* Top Navigation Row */}
      <div className="w-full max-w-md mx-auto pt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          aria-label="Go back"
          className="w-10 h-10 min-w-[44px] min-h-[44px] rounded-full bg-white border border-[#E2DFD6] flex items-center justify-center text-[#171916] hover:bg-[#F3F0E7] active:scale-95 transition-all shadow-2xs cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5 text-[#171916]" />
        </button>
        <span className="text-xs font-semibold tracking-wider text-[#858076] uppercase">
          ASCEND
        </span>
        <div className="w-10 h-10" aria-hidden="true" />
      </div>

      {/* Main Elevated Form Card */}
      <div className="w-full max-w-md mx-auto my-auto py-4">
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-[#E2DFD6] shadow-xs space-y-6">
          {/* Header */}
          <div className="text-left space-y-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#171916] tracking-tight">
              Welcome Back
            </h1>
            <p className="text-sm text-[#858076]">
              Enter your details to continue
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5 animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-snug">{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label htmlFor="login-email" className="block text-xs font-semibold text-[#171916] mb-1.5">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex@example.com"
                required
                className="w-full px-4 py-3 rounded-xl bg-white border border-[#E2DFD6] focus:border-[#E44427] focus:ring-1 focus:ring-[#E44427] text-sm text-[#171916] placeholder:text-[#858076]/60 outline-none transition"
              />
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="login-password" className="block text-xs font-semibold text-[#171916]">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setIsForgotOpen(true)}
                  className="text-xs font-semibold text-[#E44427] hover:underline cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full pl-4 pr-11 py-3 rounded-xl bg-white border border-[#E2DFD6] focus:border-[#E44427] focus:ring-1 focus:ring-[#E44427] text-sm text-[#171916] placeholder:text-[#858076]/60 outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-[#858076] hover:text-[#171916] p-1 cursor-pointer transition"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Primary Action Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3.5 px-6 rounded-xl bg-[#E44427] hover:bg-[#d03b20] active:scale-[0.99] text-white font-semibold text-sm transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Logging in...</span>
                </>
              ) : (
                'Log in'
              )}
            </button>
          </form>

          {/* Social Auth (Google) */}
          <SocialAuthButtons />

          {/* Footer Link */}
          <div className="pt-2 text-center">
            <p className="text-xs text-[#858076]">
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={onNavigateToSignup}
                className="font-semibold text-[#E44427] hover:underline cursor-pointer"
              >
                Sign up
              </button>
            </p>
          </div>
        </div>
      </div>

      {/* Forgot Password Sheet/Modal */}
      <ForgotPasswordModal
        isOpen={isForgotOpen}
        onClose={() => setIsForgotOpen(false)}
        initialEmail={email}
      />

      {/* Bottom spacer for balance */}
      <div className="w-full max-w-md mx-auto pb-2" aria-hidden="true" />
    </div>
  );
}
