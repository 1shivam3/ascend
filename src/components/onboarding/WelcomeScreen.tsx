'use client';

import React from 'react';
import { Dumbbell, RotateCcw } from 'lucide-react';

interface WelcomeScreenProps {
  onGetStarted: () => void;
  onLogin: () => void;
  onContinueAsGuest: () => void;
  backupFound?: boolean;
  onRestoreBackup?: () => void;
}

export default function WelcomeScreen({
  onGetStarted,
  onLogin,
  onContinueAsGuest,
  backupFound,
  onRestoreBackup,
}: WelcomeScreenProps) {
  return (
    <div className="min-h-screen w-full bg-[#F3F0E7] text-[#171916] flex flex-col justify-between p-6 sm:p-8 animate-fade-in">
      {/* Top spacer / subtle branding */}
      <div className="w-full max-w-md mx-auto pt-6 flex justify-center">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-white border border-[#E2DFD6] flex items-center justify-center shadow-2xs">
            <Dumbbell className="w-5 h-5 text-[#E44427]" strokeWidth={2.4} />
          </div>
          <span className="text-sm font-bold tracking-widest text-[#171916] uppercase font-sans">
            ASCEND
          </span>
        </div>
      </div>

      {/* Hero Content */}
      <div className="w-full max-w-md mx-auto my-auto text-center py-8">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#171916] tracking-tight leading-tight">
          Build a stronger you, one day at a time.
        </h1>
        <p className="mt-4 text-base text-[#858076] leading-relaxed max-w-sm mx-auto font-normal">
          Track your workouts, nutrition, and progress — all in one place.
        </p>

        {/* Previous local backup banner if detected */}
        {backupFound && (
          <div className="mt-6 p-4 rounded-2xl bg-white border border-[#E2DFD6] shadow-2xs text-left flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#E44427]/10 text-[#E44427] flex items-center justify-center shrink-0 mt-0.5">
              <RotateCcw className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-[#171916]">
                Previous training history found on this device
              </p>
              <p className="text-2xs text-[#858076] mt-0.5">
                Restore your previous logs, split, and strength PRs instantly.
              </p>
              <button
                type="button"
                onClick={onRestoreBackup}
                className="mt-2 text-xs font-semibold text-[#E44427] hover:underline cursor-pointer"
              >
                Restore Saved Data &rarr;
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="w-full max-w-md mx-auto pb-6 space-y-3">
        <button
          type="button"
          onClick={onGetStarted}
          className="w-full py-4 px-6 rounded-xl bg-[#E44427] hover:bg-[#d03b20] active:scale-[0.99] text-white font-semibold text-base transition-all shadow-md cursor-pointer text-center"
        >
          Get Started
        </button>

        <button
          type="button"
          onClick={onLogin}
          className="w-full py-3.5 px-6 rounded-xl bg-white hover:bg-[#F3F0E7]/60 active:scale-[0.99] text-[#171916] border border-[#171916]/20 font-semibold text-base transition-all shadow-2xs cursor-pointer text-center"
        >
          I already have an account
        </button>

        {/* Discreet Guest Access Option */}
        <div className="pt-3 text-center">
          <button
            type="button"
            onClick={onContinueAsGuest}
            className="text-xs text-[#858076] hover:text-[#171916] transition-colors underline underline-offset-4 cursor-pointer"
          >
            Continue as Guest
          </button>
        </div>
      </div>
    </div>
  );
}
