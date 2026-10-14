import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/lib/types';
import { isWithinQuietHours, formatNotificationPayload } from '@/lib/notifications';

describe('Google Play Store Launch Readiness Verification', () => {
  const rootDir = path.resolve(__dirname, '..');

  describe('1. Account Deletion & Play Store Data Safety Compliance', () => {
    it('provides an external /delete-account web portal accessible without app install', () => {
      const deletePagePath = path.join(rootDir, 'src', 'app', 'delete-account', 'page.tsx');
      expect(fs.existsSync(deletePagePath)).toBe(true);
      const content = fs.readFileSync(deletePagePath, 'utf8');

      // Play Store requirement: Disclose what data is deleted and retention period
      expect(content).toContain('Google Play Store Data Safety');
      expect(content).toContain('0 days retention');
      expect(content).toContain('Permanently');
    });

    it('has an in-app Account & Privacy settings section with export and deletion', () => {
      const settingsModalPath = path.join(rootDir, 'src', 'components', 'SettingsModal.tsx');
      const content = fs.readFileSync(settingsModalPath, 'utf8');

      expect(content).toContain('Account & Privacy');
      expect(content).toContain('Export my data');
      expect(content).toContain('Notification preferences');
      expect(content).toContain('Delete my account');
      expect(content).toContain('DELETE'); // Confirmation text required
    });

    it('cascades deletion across all cloud tables and auth store', () => {
      const deleteRoutePath = path.join(rootDir, 'src', 'app', 'api', 'auth', 'delete-account', 'route.ts');
      const content = fs.readFileSync(deleteRoutePath, 'utf8');

      const requiredCascadeTables = [
        'personal_records',
        'workouts',
        'meals',
        'body_metrics',
        'daily_habits',
        'planned_workouts',
        'custom_barcodes',
        'push_subscriptions',
        'notification_preferences',
        'profiles',
      ];

      for (const table of requiredCascadeTables) {
        expect(content).toContain(`'${table}'`);
      }
      expect(content).toContain('admin.deleteUser');
    });
  });

  describe('2. Android Back Button & Modal History Navigation', () => {
    it('ensures scan meal, settings, workout, and quick action modals register back handlers', () => {
      const modalFiles = [
        path.join(rootDir, 'src', 'components', 'SettingsModal.tsx'),
        path.join(rootDir, 'src', 'components', 'ScanMealModal.tsx'),
        path.join(rootDir, 'src', 'components', 'BarcodeScannerModal.tsx'),
        path.join(rootDir, 'src', 'components', 'QuickActionSheetModal.tsx'),
        path.join(rootDir, 'src', 'components', 'WorkoutPage.tsx'),
      ];

      for (const file of modalFiles) {
        expect(fs.existsSync(file)).toBe(true);
        const content = fs.readFileSync(file, 'utf8');
        expect(content).toContain('registerBackHandler');
      }
    });
  });

  describe('3. Athletic Nomenclature (No Generic AI Buzzwords)', () => {
    it('verifies that core UI views have replaced generic AI buzzwords with athletic terminology', () => {
      const homePagePath = path.join(rootDir, 'src', 'components', 'HomePage.tsx');
      const homeContent = fs.readFileSync(homePagePath, 'utf8');
      expect(homeContent).not.toContain('AI Routine');
      expect(homeContent).toContain('Adaptive Split');

      const mealsPagePath = path.join(rootDir, 'src', 'components', 'MealsPage.tsx');
      const mealsContent = fs.readFileSync(mealsPagePath, 'utf8');
      expect(mealsContent).not.toContain('AI Vision');
      expect(mealsContent).toContain('Macro Lens');

      const scanMealModalPath = path.join(rootDir, 'src', 'components', 'ScanMealModal.tsx');
      const scanContent = fs.readFileSync(scanMealModalPath, 'utf8');
      expect(scanContent).not.toContain('AI Vision');
      expect(scanContent).toContain('Macro Lens');
    });
  });

  describe('4. Push Notifications & Reminder Center', () => {
    it('service worker implements push delivery and navigation message dispatch', () => {
      const swPath = path.join(rootDir, 'public', 'sw.js');
      const swContent = fs.readFileSync(swPath, 'utf8');

      expect(swContent).toContain("self.addEventListener('push'");
      expect(swContent).toContain('showNotification');
      expect(swContent).toContain("self.addEventListener('notificationclick'");
      expect(swContent).toContain('NAVIGATE_TAB');
    });

    it('enforces privacy on lock screens and default opt-in', () => {
      expect(DEFAULT_NOTIFICATION_PREFERENCES.enabled).toBe(false);
      expect(DEFAULT_NOTIFICATION_PREFERENCES.lockScreenPrivacy).toBe(true);

      const waterPayload = formatNotificationPayload('water');
      const workoutPayload = formatNotificationPayload('workout');
      const weeklyPayload = formatNotificationPayload('weekly_report');

      for (const payload of [waterPayload, workoutPayload, weeklyPayload]) {
        // Must not expose sensitive numbers
        expect(payload.title).not.toMatch(/\d+\s*(kg|lbs|kcal|calories)/i);
        expect(payload.body).not.toMatch(/\d+\s*(kg|lbs|kcal|calories)/i);
      }
    });
  });
});
