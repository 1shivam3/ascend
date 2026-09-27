'use client';

import React from 'react';

interface CircularProgressProps {
  value: number; // 0 - 100
  size?: number; // width/height in px (default 56)
  strokeWidth?: number; // default 4
  trackColor?: string;
  progressColor?: string;
  children?: React.ReactNode;
  className?: string;
}

export default function CircularProgress({
  value,
  size = 56,
  strokeWidth = 4,
  trackColor = 'currentColor',
  progressColor = 'currentColor',
  children,
  className = '',
}: CircularProgressProps) {
  const normalizedValue = Math.min(100, Math.max(0, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (normalizedValue / 100) * circumference;

  return (
    <div
      className={`relative inline-flex items-center justify-center flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="rotate-[-90deg] transform"
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          stroke={trackColor}
          fill="none"
          className="opacity-20"
        />
        {/* Animated Progress Arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          stroke={progressColor}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex items-center justify-center font-mono font-bold select-none">
          {children}
        </div>
      )}
    </div>
  );
}
