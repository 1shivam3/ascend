/**
 * QA4-043 / RB-3 regression tests.
 *
 * The privacy policy promises "an integrated in-app reporting button
 * (flag icon) next to all AI outputs", but ReportAIModal had ZERO
 * importers — the promised button did not exist in the shipped UI.
 *
 * The source-scan tests below fail if ReportAIModal ever loses its
 * importers again, and pin the flag affordance (aria-label + testid)
 * on every AI output surface. The render tests prove the modal itself
 * renders the promised reporting flow with the right context.
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'fs';
import * as path from 'path';
import ReportAIModal from '../src/components/ReportAIModal';

const SRC = path.resolve(__dirname, '../src');

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), 'utf8');
}

/** Every file under src/ that imports ReportAIModal (excluding the modal itself). */
function reportAiImporters(): string[] {
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        const content = fs.readFileSync(full, 'utf8');
        if (
          content.includes("from '@/components/ReportAIModal'") ||
          content.includes("from './ReportAIModal'") ||
          content.includes("from '../components/ReportAIModal'")
        ) {
          hits.push(path.relative(SRC, full));
        }
      }
    }
  };
  walk(SRC);
  return hits.filter((f) => f !== 'components/ReportAIModal.tsx');
}

const EXPECTED_SURFACES: Record<string, { testId: string; feature: string }> = {
  'components/ScanMealModal.tsx': {
    testId: 'report-ai-scan-meal',
    feature: 'Meal Scan (Macro Lens)',
  },
  'components/MealsPage.tsx': {
    testId: 'report-ai-meal-parse',
    feature: 'AI Meal Parse (Quick Log)',
  },
  'components/PostWorkoutTakeModal.tsx': {
    testId: 'report-ai-coach-take',
    feature: 'AI Coach — Post-Workout Take',
  },
  'components/VoiceWorkoutLoggerModal.tsx': {
    testId: 'report-ai-voice-parse',
    feature: 'Voice Workout Logger',
  },
  'components/BarcodeScannerModal.tsx': {
    testId: 'report-ai-label-scan',
    feature: 'AI Nutrition Label Scan',
  },
};

describe('QA4-043 ReportAIModal reachability', () => {
  it('ReportAIModal has importers — it is not dead code', () => {
    const importers = reportAiImporters();
    expect(importers.length).toBeGreaterThan(0);
  });

  it('every AI output surface wires the flag button and the modal with context', () => {
    const importers = reportAiImporters();
    for (const [file, { testId, feature }] of Object.entries(EXPECTED_SURFACES)) {
      expect(importers, `${file} must import ReportAIModal`).toContain(file);
      const source = readSrc(file);
      // The modal is actually rendered, not just imported.
      expect(source, `${file} must render <ReportAIModal`).toContain('<ReportAIModal');
      // A flag affordance sits next to the AI output.
      expect(source, `${file} must contain the report testid`).toContain(
        `data-testid="${testId}"`
      );
      expect(source, `${file} report button needs an accessible label`).toContain(
        // Gauntlet A11Y-10 localized the label; it resolves to
        // "Report AI content" in English via common.reportAiContent.
        "aria-label={t('common.reportAiContent')}"
      );
      // The modal receives the surface context so reports are attributable.
      expect(source, `${file} must pass its sourceFeature`).toContain(
        `sourceFeature="${feature}"`
      );
    }
  });

  it('the privacy policy promise matches the shipped surfaces', () => {
    const privacy = readSrc('app/privacy/page.tsx');
    expect(privacy).toContain('reporting button (flag icon) next to all AI outputs');
    // …and the surfaces above actually exist (guarded by the test above).
    expect(Object.keys(EXPECTED_SURFACES).length).toBeGreaterThanOrEqual(4);
  });
});

describe('QA4-043 ReportAIModal rendering', () => {
  it('renders the reporting flow with source context and snippet when open', () => {
    const html = renderToStaticMarkup(
      React.createElement(ReportAIModal, {
        isOpen: true,
        onClose: () => {},
        sourceFeature: 'Meal Scan (Macro Lens)',
        aiContentSnippet: 'Paneer Butter Masala — ~640 kcal, 22g protein',
      })
    );
    expect(html).toContain('Report AI Content');
    expect(html).toContain('Meal Scan (Macro Lens)');
    expect(html).toContain('Paneer Butter Masala');
    expect(html).toContain('Unsafe or dangerous exercise advice');
    expect(html).toContain('Submit Report');
  });

  it('renders nothing when closed', () => {
    const html = renderToStaticMarkup(
      React.createElement(ReportAIModal, { isOpen: false, onClose: () => {} })
    );
    expect(html).toBe('');
  });
});
