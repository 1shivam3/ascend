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
          className="w-10 h-10 min-w-[44px] min-h-[44px] rounded-full bg-white border border-[#E2DFD6] flex items-center justify-center text-[#171916] hover:bg-[#F3F0E7] active:scale-95 transition-all shadow-2xs cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5 text-[#171916]" />
        </button>

        {title ? (
          <span className="text-xs font-semibold uppercase tracking-wider text-[#858076]">
            {title}
          </span>
        ) : (
          <span className="text-xs font-medium text-[#858076]">
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
            currentStep >= 1 ? 'bg-[#E44427]' : 'bg-[#E2DFD6]'
          }`}
        />
        <div
          className={`h-1.5 rounded-full transition-all duration-300 ${
            currentStep >= 2 ? 'bg-[#E44427]' : 'bg-[#E2DFD6]'
          }`}
        />
        <div
          className={`h-1.5 rounded-full transition-all duration-300 ${
            currentStep >= 3 ? 'bg-[#E44427]' : 'bg-[#E2DFD6]'
          }`}
        />
        <div
          className={`h-1.5 rounded-full transition-all duration-300 ${
            currentStep >= 4 ? 'bg-[#E44427]' : 'bg-[#E2DFD6]'
          }`}
        />
      </div>
    </div>
  );
}
