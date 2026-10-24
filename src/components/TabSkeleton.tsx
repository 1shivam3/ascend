'use client';

import React from 'react';

export interface TabSkeletonProps {
  tab?: 'home' | 'workout' | 'progress' | 'meals' | 'profile' | 'settings';
}

/**
 * TabSkeleton renders sleek, instant skeleton screens matching the locked design system.
 * Prevents jarring loading spinners and perceived latency on tab transitions.
 */
export default function TabSkeleton({ tab = 'home' }: TabSkeletonProps) {
  return (
    <div className="w-full max-w-md mx-auto px-5 pt-4 pb-24 space-y-5 select-none">
      {/* Top Header Skeleton */}
      <div className="flex items-center justify-between pt-1">
        <div className="space-y-2">
          <div className="h-3 w-20 bg-bg-secondary/80 rounded-md" />
          <div className="h-7 w-36 bg-bg-secondary rounded-lg" />
        </div>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-bg-secondary/80" />
          <div className="w-9 h-9 rounded-full bg-bg-secondary/80" />
        </div>
      </div>

      {/* Main Focus Card Skeleton */}
      <div className="card p-5 bg-bg-card border border-border/70 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-3 w-24 bg-bg-secondary/80 rounded-md" />
          <div className="h-3 w-16 bg-bg-secondary/60 rounded-md" />
        </div>
        <div className="h-6 w-48 bg-bg-secondary rounded-md" />
        <div className="h-3.5 w-32 bg-bg-secondary/70 rounded-md" />
        <div className="h-12 w-full bg-bg-secondary/90 rounded-xl mt-2" />
      </div>

      {/* Secondary Metrics / Sub-cards Skeleton */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-4 w-28 bg-bg-secondary/80 rounded-md" />
          <div className="h-3 w-14 bg-bg-secondary/60 rounded-md" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 bg-bg-card border border-border/70 rounded-xl space-y-2">
            <div className="h-3 w-16 bg-bg-secondary/70 rounded" />
            <div className="h-6 w-20 bg-bg-secondary rounded" />
          </div>
          <div className="p-4 bg-bg-card border border-border/70 rounded-xl space-y-2">
            <div className="h-3 w-16 bg-bg-secondary/70 rounded" />
            <div className="h-6 w-20 bg-bg-secondary rounded" />
          </div>
        </div>
      </div>

      {/* List items skeleton */}
      <div className="space-y-2.5 pt-1">
        <div className="h-16 w-full bg-bg-card border border-border/60 rounded-xl" />
        <div className="h-16 w-full bg-bg-card border border-border/60 rounded-xl" />
      </div>
    </div>
  );
}
