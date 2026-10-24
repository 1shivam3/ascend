'use client';

import React from 'react';
import { useTranslation, type StringKey } from '@/lib/i18n';
import { CollapsibleDetails } from '@/components/ui/CollapsibleDetails';

interface CoachNotesSectionProps {
  /** Each coach-voice card, or false when that card has nothing to say. */
  checkIn: React.ReactNode;
  nutrition: React.ReactNode;
  adjustments: React.ReactNode;
}

const ITEM_LABELS: { id: string; labelKey: StringKey }[] = [
  { id: 'checkIn', labelKey: 'home.coachNotesMissed' },
  { id: 'nutrition', labelKey: 'home.coachNotesCalories' },
  { id: 'adjustments', labelKey: 'home.coachNotesNextSession' },
];

/**
 * CoachNotesSection — UX discoverability: Today used to stack three
 * separate coach-voice cards (missed-session check-in, calorie
 * suggestion, next-session adjustments) into a wall of coach text.
 * They are now one section: the first card with something to say is
 * fully visible, the rest sit behind one tap each. Nothing is removed
 * — every card, button, and dismiss action works exactly as before,
 * including when expanded from a collapsed row.
 */
export default function CoachNotesSection({ checkIn, nutrition, adjustments }: CoachNotesSectionProps) {
  const { t } = useTranslation();

  const nodes: Record<string, React.ReactNode> = { checkIn, nutrition, adjustments };
  const items = ITEM_LABELS.filter(({ id }) => {
    const node = nodes[id];
    return node !== null && node !== undefined && node !== false;
  });
  if (items.length === 0) return null;

  const [first, ...rest] = items;

  return (
    <section className="space-y-3" aria-label={t('home.coachNotes')}>
      <h2 className="text-xs font-bold text-text-primary px-1">{t('home.coachNotes')}</h2>
      {nodes[first.id]}
      {rest.map(({ id, labelKey }) => (
        <CollapsibleDetails key={id} label={t(labelKey)}>
          {nodes[id]}
        </CollapsibleDetails>
      ))}
    </section>
  );
}
