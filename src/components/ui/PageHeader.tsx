'use client';

import React from 'react';
import { useTranslation } from '@/lib/i18n';

/**
 * UX redesign — screen header (design-system §6). One page title per
 * screen, optional subtitle, optional actions slot. Presentational only.
 */
export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  onBack?: () => void;
  backLabel?: string;
}

export default function PageHeader({ title, subtitle, actions, onBack, backLabel }: PageHeaderProps) {
  const { t } = useTranslation();
  const backText = backLabel ?? t('common.back');
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={backText}
            className="pressable mb-1 -ml-1 rounded-lg px-1 py-1 text-sm font-medium text-text-secondary hover:text-text-primary"
          >
            ← {backText}
          </button>
        )}
        <h1 className="page-title truncate">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
