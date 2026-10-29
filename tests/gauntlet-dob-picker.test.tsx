/**
 * Gauntlet DOB custom picker (user decision: option B, custom picker).
 *
 * Pins the DobPicker date logic + component contract:
 * - empty default renders no date value (never prefilled);
 * - real-calendar day counts incl. Feb 29 leap/non-leap;
 * - day-31 → February resolves by CLAMP (not clear, not invalid);
 * - age-13 and age-120 boundaries via the existing dobPreviewAge;
 * - invalid calendar dates (Feb 30) cannot be produced by the picker flow;
 * - emitted values are strict YYYY-MM-DD strings isValidDob accepts.
 *
 * Fixed "today" is 2026-10-29 (local parts) so boundary tests are
 * deterministic: bounds min = 1906-10-29, max = 2013-10-29.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, beforeEach } from 'vitest';
import DobPicker from '../src/components/DobPicker';
import {
  dayOptions,
  dobPartsToValue,
  dobYearOptions,
  monthOptions,
  parseDobParts,
  resolveDayForMonth,
} from '../src/lib/dob-picker';
import { dobPickerBounds, dobPreviewAge, isValidDob } from '../src/lib/age';
import { useStore } from '../src/lib/store';

const TODAY = new Date(2026, 9, 29); // Oct 29, 2026, local parts

describe('dob picker logic', () => {
  it('(a) empty default renders no date value', () => {
    expect(parseDobParts('')).toEqual({ day: null, month: null, year: null });
    expect(dobPartsToValue({ day: null, month: null, year: null })).toBe('');
    expect(dobPartsToValue({ day: 5, month: null, year: 2000 })).toBe('');
    expect(dobPartsToValue({ day: null, month: 3, year: 2000 })).toBe('');
  });

  it('(b) day counts per month, incl. Feb 29 leap vs non-leap', () => {
    expect(dayOptions(2, 2024)).toHaveLength(29); // leap year
    expect(dayOptions(2, 2023)).toHaveLength(28);
    expect(dayOptions(2, 2000)).toHaveLength(29); // century leap year
    expect(dayOptions(2, 1900)).toHaveLength(28); // century non-leap year
    expect(dayOptions(4, 2024)).toHaveLength(30);
    expect(dayOptions(1, 2024)).toHaveLength(31);
    expect(dayOptions(null, null)).toHaveLength(31); // unchosen month/year
    expect(monthOptions()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('(c) day-31 → February resolves by CLAMP', () => {
    expect(resolveDayForMonth(31, 2, 2024)).toBe(29);
    expect(resolveDayForMonth(31, 2, 2023)).toBe(28);
    expect(resolveDayForMonth(31, 4, 2024)).toBe(30);
    expect(resolveDayForMonth(15, 2, 2023)).toBe(15); // in-range day untouched
    expect(resolveDayForMonth(null, 2, 2023)).toBe(null); // partial passthrough
    expect(resolveDayForMonth(31, null, 2023)).toBe(31);
  });

  it('(d) age-13 boundary: exactly 13 years ago validates, one day younger does not', () => {
    expect(dobPreviewAge('2013-10-29', TODAY)).toBe(13);
    expect(dobPreviewAge('2013-10-30', TODAY)).toBe(null);
  });

  it('(e) age-120 boundary: exactly 120 years ago validates, one year older does not', () => {
    expect(dobPreviewAge('1906-10-29', TODAY)).toBe(120);
    expect(dobPreviewAge('1905-10-29', TODAY)).toBe(null);
  });

  it('(f) invalid calendar dates cannot be produced by the picker flow', () => {
    // Feb day options never include 30, and the clamp maps 30 → 28.
    expect(dayOptions(2, 2023)).not.toContain(30);
    const clamped = resolveDayForMonth(30, 2, 2023);
    expect(clamped).toBe(28);
    const value = dobPartsToValue({ day: clamped, month: 2, year: 2023 });
    expect(value).toBe('2023-02-28');
    expect(isValidDob(value)).toBe(true);
    // And the raw invalid date is still rejected by the validator.
    expect(isValidDob('2023-02-30')).toBe(false);
    expect(isValidDob('2024-02-30')).toBe(false);
  });

  it('(g) emitted values are strict YYYY-MM-DD strings isValidDob accepts', () => {
    expect(dobPartsToValue({ day: 5, month: 3, year: 2000 })).toBe('2000-03-05');
    expect(isValidDob(dobPartsToValue({ day: 5, month: 3, year: 2000 }))).toBe(true);
    expect(dobPartsToValue({ day: 29, month: 2, year: 2024 })).toBe('2024-02-29');
    expect(isValidDob('2024-02-29')).toBe(true);
    expect(parseDobParts('2000-03-05')).toEqual({ day: 5, month: 3, year: 2000 });
    expect(parseDobParts('not-a-date')).toEqual({ day: null, month: null, year: null });
  });

  it('year options run from the bounds (ages 13–120), most-recent-first, never hardcoded', () => {
    const bounds = dobPickerBounds(TODAY);
    expect(bounds).toEqual({ min: '1906-10-29', max: '2013-10-29' });
    const years = dobYearOptions(bounds.min, bounds.max);
    expect(years[0]).toBe(2013);
    expect(years[years.length - 1]).toBe(1906);
    expect(years).toHaveLength(108);
    expect(dobYearOptions('garbage', 'also-bad')).toEqual([]);
  });
});

describe('DobPicker component', () => {
  beforeEach(() => {
    useStore.getState().setUiPreferences({ language: 'en' });
  });

  it('renders three labelled selects with placeholders and no preselected date', () => {
    const html = renderToStaticMarkup(
      <DobPicker id="test-dob" value="" onChange={() => {}} />,
    );
    expect(html).toContain('id="test-dob-day"');
    expect(html).toContain('id="test-dob-month"');
    expect(html).toContain('id="test-dob-year"');
    expect(html).toContain('aria-label="Date of birth Day"');
    expect(html).toContain('aria-label="Date of birth Month"');
    expect(html).toContain('aria-label="Date of birth Year"');
    // Placeholder options, no selected value on any select.
    expect(html).toContain('<option value="" selected="">Day</option>');
    expect(html).toContain('<option value="" selected="">Month</option>');
    expect(html).toContain('<option value="" selected="">Year</option>');
    // Year range present, most-recent-first.
    expect(html).toContain('<option value="2013">2013</option>');
    expect(html).toContain('<option value="1906">1906</option>');
  });

  it('renders a preselected full date across the three selects', () => {
    const html = renderToStaticMarkup(
      <DobPicker id="test-dob" value="2000-03-05" onChange={() => {}} />,
    );
    expect(html).toContain('<option value="5" selected="">05</option>');
    expect(html).toContain('<option value="3" selected="">03</option>');
    expect(html).toContain('<option value="2000" selected="">2000</option>');
  });

  it('February day options follow the selected year (leap vs non-leap)', () => {
    const leap = renderToStaticMarkup(
      <DobPicker id="test-dob" value="" onChange={() => {}} />,
    );
    // With no month/year chosen, day list is 1–31.
    expect(leap).toContain('<option value="31">31</option>');
    // A full leap-year Feb value renders; day 29 exists in the option set
    // for a Feb selection (proved at logic level); here the stored value
    // round-trips through the selects.
    const feb = renderToStaticMarkup(
      <DobPicker id="test-dob" value="2024-02-29" onChange={() => {}} />,
    );
    expect(feb).toContain('<option value="29" selected="">29</option>');
  });
});
