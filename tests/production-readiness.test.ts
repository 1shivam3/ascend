import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { useStore } from '@/lib/store';
import { syncEngine } from '@/lib/supabase/sync';
import { redactSecrets } from '@/lib/server-security';

describe('Production Readiness & Security Hardening Suite', () => {
  beforeEach(() => {
    useStore.getState().clearAllData();
  });

  describe('Supabase Multi-Account Tenancy & Cross-Account Isolation', () => {
    it('detects cross-account switch when local profile belongs to a different authenticated user', () => {
      // Simulate User A having logged in previously
      useStore.setState({
        profile: {
          id: '11111111-1111-1111-1111-111111111111',
          name: 'User A',
          gender: 'male',
          bodyweightKg: 80,
          bodyweightLbs: 176,
          unit: 'kg',
          createdAt: new Date().toISOString(),
        },
        prs: [
          {
            id: 'pr_a_1',
            exercise: 'Bench Press',
            weightKg: 100,
            weightLbs: 220,
            reps: 5,
            oneRepMax: 116.7,
            date: '2026-10-10',
          },
        ],
      });

      const localState = useStore.getState();
      const currentAuthUserId = '22222222-2222-2222-2222-222222222222'; // User B logs in

      const isCrossAccountSwitch = Boolean(
        localState.profile?.id &&
        localState.profile.id !== currentAuthUserId &&
        !localState.profile.id.startsWith('user_')
      );

      expect(isCrossAccountSwitch).toBe(true);
    });

    it('identifies local guest profile linking as guest migration rather than cross-account switch', () => {
      // Guest profile created locally before cloud auth
      useStore.setState({
        profile: {
          id: 'user_local_guest_99',
          name: 'Guest Athlete',
          gender: 'female',
          bodyweightKg: 60,
          bodyweightLbs: 132,
          unit: 'kg',
          createdAt: new Date().toISOString(),
        },
      });

      const localState = useStore.getState();
      const newAuthUserId = '22222222-2222-2222-2222-222222222222';

      const isCrossAccountSwitch = Boolean(
        localState.profile?.id &&
        localState.profile.id !== newAuthUserId &&
        !localState.profile.id.startsWith('user_')
      );

      expect(isCrossAccountSwitch).toBe(false);
    });

    it('signOut supports clearing local state for shared device hygiene', async () => {
      useStore.setState({
        profile: {
          id: 'user_auth_123',
          name: 'Athlete One',
          gender: 'male',
          bodyweightKg: 75,
          bodyweightLbs: 165,
          unit: 'kg',
          createdAt: new Date().toISOString(),
        },
        prs: [
          {
            id: 'pr_1',
            exercise: 'Squat',
            weightKg: 140,
            weightLbs: 308,
            reps: 3,
            oneRepMax: 154,
            date: '2026-10-11',
          },
        ],
      });

      expect(useStore.getState().profile).not.toBeNull();
      expect(useStore.getState().prs.length).toBe(1);

      await syncEngine.signOut({ clearLocalData: true });

      expect(useStore.getState().profile).toBeNull();
      expect(useStore.getState().prs.length).toBe(0);
    });
  });

  describe('API Route Error Redaction & Fail-Safe Security', () => {
    it('ensures barcode route catch block uses redactSecrets and generic message', () => {
      const barcodeRoutePath = path.join(process.cwd(), 'src/app/api/barcode/route.ts');
      const content = fs.readFileSync(barcodeRoutePath, 'utf-8');

      expect(content).toContain('redactSecrets');
      expect(content).toContain("message: 'Error looking up barcode. Please try again later.'");
      expect(content).not.toContain("message: err.message || 'Error looking up barcode.'");
    });

    it('ensures AI coach route wraps athlete context in <athlete_context> across all tasks', () => {
      const coachRoutePath = path.join(process.cwd(), 'src/app/api/ai/coach/route.ts');
      const content = fs.readFileSync(coachRoutePath, 'utf-8');

      expect(content).toContain('<athlete_context>\\n');
      expect(content).toContain('\\n</athlete_context>');
      // Verify no unwrapped userContext in POST_WORKOUT_TAKE, WEEKLY_REVIEW, or COACH_INSIGHT
      expect(content).not.toMatch(/Athlete Context:\\n\$\{body\.userContext/);
      expect(content).not.toMatch(/Athlete Context & 7-Day History:\\n\$\{body\.userContext/);
      expect(content).not.toMatch(/Athlete Data & Context:\\n\$\{body\.userContext/);
    });
  });

  describe('Production Metadata & Mobile Viewport Configuration', () => {
    it('verifies layout.tsx references the live production domain https://ascendtonext.vercel.app', () => {
      const layoutPath = path.join(process.cwd(), 'src/app/layout.tsx');
      const content = fs.readFileSync(layoutPath, 'utf-8');

      expect(content).toContain("metadataBase: new URL('https://ascendtonext.vercel.app')");
      expect(content).toContain("url: 'https://ascendtonext.vercel.app'");
      expect(content).not.toContain('ascend-alpha.vercel.app');
    });

    it('verifies viewport includes interactiveWidget resizes-content for mobile keyboards', () => {
      const layoutPath = path.join(process.cwd(), 'src/app/layout.tsx');
      const content = fs.readFileSync(layoutPath, 'utf-8');

      expect(content).toContain("interactiveWidget: 'resizes-content'");
    });

    it('verifies production error boundary exists and contains safe recovery mechanisms', () => {
      const errorBoundaryPath = path.join(process.cwd(), 'src/app/error.tsx');
      expect(fs.existsSync(errorBoundaryPath)).toBe(true);

      const content = fs.readFileSync(errorBoundaryPath, 'utf-8');
      expect(content).toContain('GlobalErrorBoundary');
      expect(content).toContain('redactSecrets');
      expect(content).toContain('reset()');
      expect(content).toContain("window.location.href = '/'");
    });
  });
});
