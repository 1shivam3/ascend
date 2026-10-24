'use client';

import React from 'react';
import { useTranslation } from '@/lib/i18n';

/**
 * UX redesign — metric summary (design-system §6). Value + label +
 * optional delta; measured vs estimated is never color alone (the
 * "est." badge carries it). Loading renders a static block, never a
 * shimmer (animation-spec §3.9).
 */
export interface StatProps {
  value: string;
  label: string;
  delta?: string;
  estimated?: boolean;
  loading?: boolean;
  variant?: 'compact' | 'prominent';
}

export default function Stat({ value, label, delta, estimated, loading, variant = 'compact' }: StatProps) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div aria-busy="true" aria-label={`Loading ${label}`}>
        <div className="h-6 w-16 rounded bg-bg-secondary" />
        <div className="mt-1 h-3 w-12 rounded bg-bg-secondary" />
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span
          className={`font-semibold tabular-nums text-text-primary ${
            variant === 'prominent' ? 'text-prominent' : 'text-compactMetric'
          }`}
        >
          {value}
        </span>
        {estimated && (
          <span className="rounded border border-dashed border-border px-1 py-0.5 text-2xs font-medium text-text-muted">
            {t('common.estimatedShort')}
          </span>
        )}
        {delta && <span className="text-xs font-medium text-text-secondary">{delta}</span>}
      </div>
      <div className="mt-0.5 text-xs text-text-muted">{label}</div>
    </div>
  );
}
