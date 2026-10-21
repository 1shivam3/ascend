'use client';

import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface StepProgressBarProps {
  currentStep: 1 | 2 | 3 | 4;
  onBack: () => void;
  title?: string;
}

export default function StepProgressBar({
  currentStep,
  onBack,
  title,
}: StepProgressBarProps) {
  return (
    <div className="w-full max-w-md mx-auto pt-4 pb-6 px-4">
      {/* Top Navigation Row */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Go back"
          className="w-10 h-10 min-w-[44px] min-h-[44px] rounded-full bg-bg-card border border-border flex items-center justify-center text-text-primary hover:bg-bg-primary active:scale-95 transition-all shadow-2xs cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5 text-text-primary" />
        </button>

        {title ? (
          <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            {title}
          </span>
        ) : (
          <span className="text-xs font-medium text-text-muted">
            Step {currentStep} of 4
          </span>
        )}

        {/* Balance spacer so header stays centered */}
        <div className="w-10 h-10" aria-hidden="true" />
      </div>

      {/* 4-Segment Progress Bar */}
      <div className="grid grid-cols-4 gap-2 w-full" role="progressbar" aria-valuenow={currentStep} aria-valuemin={1} aria-valuemax={4}>
        <div
          className={`h-1.5 rounded-full transition-all duration-300 ${
            currentStep >= 1 ? 'bg-accent' : 'bg-bg-tertiary'
          }`}
        />
        <div
          className={`h-1.5 rounded-full transition-all duration-300 ${
            currentStep >= 2 ? 'bg-accent' : 'bg-bg-tertiary'
          }`}
        />
        <div
          className={`h-1.5 rounded-full transition-all duration-300 ${
            currentStep >= 3 ? 'bg-accent' : 'bg-bg-tertiary'
          }`}
        />
        <div
          className={`h-1.5 rounded-full transition-all duration-300 ${
            currentStep >= 4 ? 'bg-accent' : 'bg-bg-tertiary'
          }`}
        />
      </div>
    </div>
  );
}
