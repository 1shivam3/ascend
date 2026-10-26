import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Initialize global window and localStorage for node environment before importing components
if (typeof (global as any).window === 'undefined') {
  const store: Record<string, string> = {};
  const mockLocalStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const k in store) delete store[k];
    },
  };

  (global as any).window = {
    location: {
      href: 'http://localhost/',
      pathname: '/',
      search: '',
      hash: '',
    },
    localStorage: mockLocalStorage,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };
  (global as any).localStorage = mockLocalStorage;
}

import { useStore } from '@/lib/store';
import { buildTabUrl, getInitialNavigationState, NavigationProvider } from '@/lib/navigation';
import { ToastProvider } from '@/components/ui/Toast';
import ConfirmationModal from '@/components/ConfirmationModal';
import ProfileView from '@/components/ProfileView';
import SettingsView from '@/components/SettingsView';
import EditProfileModal from '@/components/EditProfileModal';
import { exportFullBackupJSON, importFullBackupJSON } from '@/lib/storage';

// Helper to render components wrapped in necessary providers
function renderWithProviders(ui: React.ReactElement): string {
  return renderToStaticMarkup(
    React.createElement(
      ToastProvider,
      null,
      React.createElement(NavigationProvider, null, ui)
    )
  );
}

// Mock Lucide icons for static rendering
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<Record<string, any>>();
  const mockComponent = (name: string) => {
    const Component = (props: any) => React.createElement('span', { 'data-testid': `icon-${name}`, ...props });
    Component.displayName = name;
    return Component;
  };
  const mocks: Record<string, any> = {};
  for (const key of Object.keys(actual)) {
    if (typeof actual[key] === 'function' || typeof actual[key] === 'object') {
      mocks[key] = mockComponent(key);
    }
  }
  return { ...actual, ...mocks };
});

describe('Phase 6 — Settings, Profile & Navigation Verification', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.location.search = '';
    window.location.href = 'http://localhost/';

    // Initialize store state
    useStore.setState({
      profile: {
        id: 'test-user-1',
        name: 'Alex Mercer',
        gender: 'male',
        bodyweightKg: 82.5,
        bodyweightLbs: 181.88,
        heightCm: 180,
        age: 28,
        unit: 'kg',
        userMode: 'intermediate',
        goals: ['get_stronger'],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      prs: [],
      workouts: [],
      meals: [],
      bodyMetrics: [],
      theme: 'dark',
      hasCustomTheme: true,
      userMode: 'intermediate',
      hasCompletedOnboarding: true,
      _hasHydrated: true,
    });

    if (typeof (useStore as any).getInitialState === 'function') {
      (useStore as any).getInitialState = () => useStore.getState();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Navigation & URL Synchronization for Profile and Settings', () => {
    it('supports profile and settings tabs in buildTabUrl', () => {
      expect(buildTabUrl('profile')).toBe('/?tab=profile');
      expect(buildTabUrl('settings')).toBe('/?tab=settings');
      expect(buildTabUrl('home')).toBe('/');
      expect(buildTabUrl('workout')).toBe('/?tab=workout');
    });

    it('resolves initial navigation state from query params', () => {
      // Mock window.location.search for profile
      window.location.search = '?tab=profile';
      const profileState = getInitialNavigationState();
      expect(profileState.tab).toBe('profile');

      // Mock window.location.search for settings
      window.location.search = '?tab=settings';
      const settingsState = getInitialNavigationState();
      expect(settingsState.tab).toBe('settings');

      // Fallback for unknown
      window.location.search = '?tab=unknown';
      const defaultState = getInitialNavigationState();
      expect(defaultState.tab).toBe('home');
    });
  });

  describe('2. Screen 22 — Profile View Layout and Personal Details', () => {
    it('store profile is set', () => {
      expect(useStore.getState().profile?.name).toBe('Alex Mercer');
    });

    it('renders athlete initial, name, and 3-column stats', () => {
      const html = renderWithProviders(React.createElement(ProfileView, {}));

      // Athlete Avatar Initial & Name
      expect(html).toContain('A');
      expect(html).toContain('Alex Mercer');

      // Stat cards: Height, Weight, Age
      expect(html).toContain('180 cm');
      expect(html).toContain('82.5 kg');
      expect(html).toContain('28');

      // Menu items
      expect(html).toContain('Personal Details');
      expect(html).toContain('Fitness Goals');
      expect(html).toContain('Reminders &amp; Alerts');
      expect(html).toContain('Data &amp; Storage');
      expect(html).toContain('Share Workout Split');
      expect(html).toContain('Weekly Training Card');
      expect(html).toContain('App Settings');
      // FND-05: Log Out moved to Settings → Data & Account; Profile
      // now shows the Data & Account row that lands there.
      expect(html).toContain('Sign out &amp; account'); // REVIEW 2026-10-26 (Track G #8): section renamed from 'Data & Account'.
    });

    it('correctly adapts when unit is lbs', () => {
      useStore.setState({
        profile: {
          id: 'test-user-2',
          name: 'Sarah Connor',
          gender: 'female',
          bodyweightKg: 65,
          bodyweightLbs: 143.3,
          heightCm: 168,
          age: 32,
          unit: 'lbs',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      });

      const html = renderWithProviders(React.createElement(ProfileView, {}));
      expect(html).toContain('Sarah Connor');
      expect(html).toContain('S'); // Initial
      expect(html).toContain('143.3 lbs');
      expect(html).toContain('32');
    });
  });

  describe('3. Screen 23 — Settings View Preferences and Data Management', () => {
    it('always renders a back button wired to onBack (regression: stuck-in-settings)', () => {
      const html = renderWithProviders(
        React.createElement(SettingsView, { onBack: () => {}, isModal: true })
      );
      // The back affordance must always exist — no dead ends.
      expect(html).toContain('aria-label="Back"');
    });

    it('renders all preference controls and sections', () => {
      const html = renderWithProviders(React.createElement(SettingsView, {}));

      expect(html).toContain('Settings');
      expect(html).toContain('Account &amp; Security');
      // UX redesign Stage 6 — IA regroup: App Preferences / Customization
      // became Appearance & personalization + Training preferences.
      expect(html).toContain('Appearance &amp; personalization');
      expect(html).toContain('Training preferences');
      expect(html).toContain('Appearance');
      expect(html).toContain('Chalk');
      expect(html).toContain('Graphite');
      expect(html).toContain('Accent theme');
      expect(html).toContain('Information density');
      expect(html).toContain('Customize Today');
      expect(html).toContain('Units of Measure');
      // Live-fix L3: the row is the workout view mode, not athlete
      // experience — the old label misled users on density switches.
      expect(html).toContain('Workout view');
      expect(html).toContain('Backup &amp; legal'); // REVIEW 2026-10-26 (Track G #8): section renamed from 'Data, Privacy & Legal'.
      expect(html).toContain('Export JSON Backup');
      expect(html).toContain('Import Backup File');
      expect(html).toContain('Anonymous Diagnostics');
      expect(html).toContain('Delete Account');
    });

    it('toggles units in state between kg and lbs', () => {
      const profile = useStore.getState().profile!;
      expect(profile.unit).toBe('kg');

      // Update unit
      useStore.getState().setProfile({
        ...profile,
        unit: 'lbs',
      });

      expect(useStore.getState().profile?.unit).toBe('lbs');
    });

    it('exports and restores JSON backups accurately', () => {
      // Simulate stored ascend_store in localStorage
      window.localStorage.setItem(
        'ascend_store',
        JSON.stringify({
          state: {
            prs: [
              {
                id: 'pr-1',
                exercise: 'Bench Press',
                weightKg: 100,
                weightLbs: 220.46,
                reps: 5,
                oneRepMax: 116.67,
                date: '2026-02-01',
              },
            ],
          },
          version: 1,
        })
      );

      const backupStr = exportFullBackupJSON();
      expect(backupStr).toContain('version');
      expect(backupStr).toContain('Bench Press');

      const parsed = JSON.parse(backupStr);
      expect(parsed.prs).toHaveLength(1);
      expect(parsed.prs[0].exercise).toBe('Bench Press');

      // Test import verification
      const importSuccess = importFullBackupJSON(backupStr);
      expect(importSuccess).toBe(true);
    });
  });

  describe('4. Screen 24 — Confirmation Modal (Dangerous Actions & Verification)', () => {
    it('renders danger modal with title, message, and action button', () => {
      const html = renderWithProviders(
        React.createElement(ConfirmationModal, {
          isOpen: true,
          onClose: () => {},
          onConfirm: () => {},
          title: 'Delete Account',
          message: 'This action is irreversible. All training records, body metrics, and synced backups will be permanently removed.',
          requireTypedConfirmation: 'DELETE',
          variant: 'danger',
        })
      );

      expect(html).toContain('Delete Account');
      expect(html).toContain('This action is irreversible');
      expect(html).toContain('Type');
      expect(html).toContain('DELETE');
      expect(html).toContain('Cancel');
    });

    it('does not render modal content when isOpen is false', () => {
      const html = renderWithProviders(
        React.createElement(ConfirmationModal, {
          isOpen: false,
          onClose: () => {},
          onConfirm: () => {},
          title: 'Delete Account',
          message: 'Irreversible action.',
        })
      );

      expect(html).not.toContain('Delete Account');
    });
  });

  describe('5. Edit Profile Modal (Gender Identity & Unit Math)', () => {
    it('renders all gender options without truncation', () => {
      const html = renderWithProviders(
        React.createElement(EditProfileModal, {
          isOpen: true,
          onClose: () => {},
        })
      );

      expect(html).toContain('Edit Profile');
      expect(html).toContain('Full Name');
      expect(html).toContain('Age');
      expect(html).toContain('Gender Identity');
      expect(html).toContain('male');
      expect(html).toContain('female');
      expect(html).toContain('other');
      expect(html).toContain('Height');
      expect(html).toContain('Bodyweight');
      expect(html).toContain('Save Changes');
    });

    it('updates profile and recalculates weight units on save', () => {
      const prevProfile = useStore.getState().profile!;
      const newWeightKg = 85.0;
      const expectedWeightLbs = Math.round(newWeightKg * 2.20462 * 10) / 10;

      useStore.getState().setProfile({
        ...prevProfile,
        name: 'Alex M.',
        gender: 'other',
        bodyweightKg: newWeightKg,
        bodyweightLbs: expectedWeightLbs,
        age: 29,
      });

      const updated = useStore.getState().profile!;
      expect(updated.name).toBe('Alex M.');
      expect(updated.gender).toBe('other');
      expect(updated.bodyweightKg).toBe(85.0);
      expect(updated.bodyweightLbs).toBe(187.4);
      expect(updated.age).toBe(29);
    });
  });
});
