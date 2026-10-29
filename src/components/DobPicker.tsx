/**
 * Custom date-of-birth picker: three plain `<select>` dropdowns
 * (Day / Month / Year) replacing the native `<input type="date">`,
 * whose popup is browser UI — not DOM — and so could not be driven
 * by keyboard users or browser automation.
 *
 * Value contract: the existing YYYY-MM-DD string ('' = no date yet),
 * so isValidDob, dobPreviewAge, the age chip, Continue gating, and
 * error messages all work untouched. EMPTY DEFAULT: all three selects
 * start on their placeholder option — never preselected, never
 * today's date, never the max bound (prefilling would fabricate a
 * DOB and break the age gate).
 *
 * Partial selections are kept in local state until all three parts
 * are chosen (the YYYY-MM-DD contract cannot represent a partial
 * date); the emitted value stays '' meanwhile. If the parent clears
 * or replaces the value externally, local state re-syncs to it.
 * Day-31 → short-month resolves by CLAMP (see dob-picker.ts).
 * Months render as zero-padded numerics (01–12): no month-name
 * i18n keys exist, and inventing translations is out of scope.
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import { dobPickerBounds } from '@/lib/age';
import {
  dayOptions,
  dobPartsToValue,
  dobYearOptions,
  monthOptions,
  parseDobParts,
  resolveDayForMonth,
  type DobParts,
} from '@/lib/dob-picker';

export interface DobPickerProps {
  /** Base id: selects render as `${id}-day`, `${id}-month`, `${id}-year`. */
  id: string;
  /** YYYY-MM-DD, or '' for no date yet. */
  value: string;
  onChange: (value: string) => void;
  /** Bounds strings (YYYY-MM-DD); default dobPickerBounds() (ages 13–120). */
  min?: string;
  max?: string;
}

const SELECT_CLASS =
  'w-full rounded-xl border border-border bg-bg-secondary px-3 py-2.5 text-sm font-medium text-text-primary outline-none transition-colors focus:border-accent cursor-pointer';

export default function DobPicker({ id, value, onChange, min, max }: DobPickerProps) {
  const { t } = useTranslation();
  const bounds = min !== undefined && max !== undefined ? { min, max } : dobPickerBounds();
  const [parts, setParts] = useState<DobParts>(() => parseDobParts(value));

  // External value changes (initial load, parent clear) re-sync local state.
  useEffect(() => {
    const parsed = parseDobParts(value);
    setParts((prev) =>
      prev.day === parsed.day && prev.month === parsed.month && prev.year === parsed.year
        ? prev
        : parsed,
    );
  }, [value]);

  const emit = (next: DobParts) => {
    const resolved: DobParts = {
      ...next,
      day: resolveDayForMonth(next.day, next.month, next.year),
    };
    setParts(resolved);
    onChange(dobPartsToValue(resolved));
  };

  const years = dobYearOptions(bounds.min, bounds.max);
  const days = dayOptions(parts.month, parts.year);
  // Self-describing labels: "Date of birth Day" etc. (localized in both
  // languages) — the screens' visible heading is a group heading, not a
  // single-control label, so the selects must carry full context alone.
  const fieldLabel = t('onboarding.dateOfBirth');

  return (
    <div className="grid grid-cols-3 gap-2">
      <select
        id={`${id}-day`}
        aria-label={`${fieldLabel} ${t('dobPicker.day')}`}
        value={parts.day ?? ''}
        onChange={(e) => emit({ ...parts, day: e.target.value === '' ? null : Number(e.target.value) })}
        className={SELECT_CLASS}
      >
        <option value="">{t('dobPicker.day')}</option>
        {days.map((d) => (
          <option key={d} value={d}>
            {String(d).padStart(2, '0')}
          </option>
        ))}
      </select>
      <select
        id={`${id}-month`}
        aria-label={`${fieldLabel} ${t('dobPicker.month')}`}
        value={parts.month ?? ''}
        onChange={(e) => emit({ ...parts, month: e.target.value === '' ? null : Number(e.target.value) })}
        className={SELECT_CLASS}
      >
        <option value="">{t('dobPicker.month')}</option>
        {monthOptions().map((m) => (
          <option key={m} value={m}>
            {String(m).padStart(2, '0')}
          </option>
        ))}
      </select>
      <select
        id={`${id}-year`}
        aria-label={`${fieldLabel} ${t('dobPicker.year')}`}
        value={parts.year ?? ''}
        onChange={(e) => emit({ ...parts, year: e.target.value === '' ? null : Number(e.target.value) })}
        className={SELECT_CLASS}
      >
        <option value="">{t('dobPicker.year')}</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
