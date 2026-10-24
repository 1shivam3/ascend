'use client';

import React from 'react';

/**
 * UX redesign — designed empty pattern (design-system §6, §8). Every
 * empty context gets an icon, a title, an explanation, and a next
 * action — never a bare "no data" string.
 */
export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  explanation: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({ icon, title, explanation, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      {icon && <div className="mb-3 text-text-muted">{icon}</div>}
      <h3 className="section-heading">{title}</h3>
      <p className="mt-1 max-w-xs text-sm text-text-secondary">{explanation}</p>
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className="btn-primary mt-4">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
