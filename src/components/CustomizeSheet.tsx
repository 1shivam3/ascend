'use client';

import React from 'react';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import Sheet from '@/components/ui/Sheet';
import { useTranslation } from '@/lib/i18n';

/**
 * UX redesign Stage 3 — "Customize Today" sheet (personalization-spec §2).
 * Shared by Today and Settings (Stage 6 reuses this same component).
 *
 * Presentational only: sections arrive in current order (workout card
 * first, locked), visibility arrives resolved, and every change is a
 * callback to the store owner. No drag editor — up/down buttons only.
 * The workout card is locked on and pinned first; it never enters the
 * order array, so all listed sections are movable.
 */
export interface CustomizeSectionItem {
  id: string;
  title: string;
  locked?: boolean;
}

export interface CustomizeSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Sections in current visual order, workout card first (locked). */
  sections: CustomizeSectionItem[];
  /** Resolved visibility per id (workout card: true). */
  shown: Record<string, boolean>;
  onToggle: (id: string, shown: boolean) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onRestore: () => void;
}

export default function CustomizeSheet({
  isOpen,
  onClose,
  sections,
  shown,
  onToggle,
  onMove,
  onRestore,
}: CustomizeSheetProps) {
  const { t } = useTranslation();
  const movable = sections.filter((s) => !s.locked);

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={t('customize.today')}
      footer={
        <button
          type="button"
          onClick={onRestore}
          className="btn-secondary w-full"
        >
          {t('customize.restoreLayout')}
        </button>
      }
    >
      <ul className="space-y-1">
        {sections.map((section) => {
          const isShown = shown[section.id] ?? true;
          const movableIdx = movable.findIndex((s) => s.id === section.id);
          const canMoveUp = !section.locked && movableIdx > 0;
          const canMoveDown = !section.locked && movableIdx >= 0 && movableIdx < movable.length - 1;
          return (
            <li
              key={section.id}
              className="flex items-center gap-2 rounded-xl px-2 py-1.5"
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={isShown}
                disabled={section.locked}
                onClick={() => onToggle(section.id, !isShown)}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:cursor-default"
              >
                <span
                  aria-hidden
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                    isShown
                      ? 'border-accent bg-accent text-accent-on'
                      : 'border-border bg-bg-card text-transparent'
                  }`}
                >
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-text-primary">
                    {section.title}
                  </span>
                  {section.locked && (
                    <span className="block text-2xs text-text-muted">
                      {t('customize.alwaysShown')}
                    </span>
                  )}
                </span>
              </button>
              {!section.locked && (
                <span className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    disabled={!canMoveUp}
                    onClick={() => onMove(section.id, -1)}
                    aria-label={t('customize.moveUp')}
                    className="btn-circle disabled:opacity-40"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={!canMoveDown}
                    onClick={() => onMove(section.id, 1)}
                    aria-label={t('customize.moveDown')}
                    className="btn-circle disabled:opacity-40"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
