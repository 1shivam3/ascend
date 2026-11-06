'use client';

import React from 'react';
import { Check, ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import Sheet from '@/components/ui/Sheet';
import { useTranslation } from '@/lib/i18n';

/**
 * UX redesign Stage 3 — "Customize Today" sheet (personalization-spec §2).
 * Shared by Today and Settings (Stage 6 reuses this same component).
 *
 * Presentational only: sections arrive in current order (workout card
 * first, locked), visibility arrives resolved, and every change is a
 * callback to the store owner. The workout card is locked on and
 * pinned first; it never enters the order array, so all listed
 * sections are movable.
 *
 * Audit phase 5, task 5.1(k): rows carry a drag handle (HTML5
 * drag-and-drop) when the owner supplies onReorder — the new order is
 * computed locally and committed in ONE callback, so a multi-row drag
 * never replays single swaps against a stale snapshot. The up/down
 * buttons remain as the keyboard/touch-accessible fallback (HTML5 DnD
 * is pointer-only). Dragging is an enhancement, never the only path.
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
  /** Full new order of the movable section ids after a drag. */
  onReorder?: (orderedIds: string[]) => void;
  onRestore: () => void;
}

export default function CustomizeSheet({
  isOpen,
  onClose,
  sections,
  shown,
  onToggle,
  onMove,
  onReorder,
  onRestore,
}: CustomizeSheetProps) {
  const { t } = useTranslation();
  const movable = sections.filter((s) => !s.locked);
  const [dragId, setDragId] = React.useState<string | null>(null);

  const handleDrop = (targetId: string) => {
    if (onReorder && dragId && dragId !== targetId) {
      const ids = movable.map((s) => s.id);
      const from = ids.indexOf(dragId);
      const to = ids.indexOf(targetId);
      if (from >= 0 && to >= 0) {
        ids.splice(from, 1);
        ids.splice(to, 0, dragId);
        onReorder(ids);
      }
    }
    setDragId(null);
  };

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
              draggable={!section.locked && !!onReorder}
              onDragStart={!section.locked && onReorder ? () => setDragId(section.id) : undefined}
              onDragOver={!section.locked && onReorder ? (e) => e.preventDefault() : undefined}
              onDrop={!section.locked && onReorder ? () => handleDrop(section.id) : undefined}
              onDragEnd={onReorder ? () => setDragId(null) : undefined}
              className={`flex items-center gap-2 rounded-xl px-2 py-1.5 ${dragId === section.id ? 'opacity-50' : ''}`}
            >
              {!section.locked && onReorder && (
                <GripVertical aria-hidden className="h-4 w-4 shrink-0 cursor-grab text-text-muted" />
              )}
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
                  <span className="block text-sm font-medium text-text-primary">
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
                    className="btn-circle"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={!canMoveDown}
                    onClick={() => onMove(section.id, 1)}
                    aria-label={t('customize.moveDown')}
                    className="btn-circle"
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
