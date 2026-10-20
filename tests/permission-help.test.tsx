import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../src/lib/store';
import { translate } from '../src/lib/i18n';
import PermissionHelp from '../src/components/ui/PermissionHelp';

function render(props: React.ComponentProps<typeof PermissionHelp>): string {
  return renderToStaticMarkup(React.createElement(PermissionHelp, props));
}

describe('PermissionHelp', () => {
  beforeEach(() => {
    useStore.getState().setUiPreferences({ language: 'en' });
  });

  it('renders the purpose line for each permission kind', () => {
    expect(render({ permission: 'notifications', isNative: true })).toContain(
      'Reminders need notification permission'
    );
    expect(render({ permission: 'microphone', isNative: true })).toContain(
      'Voice logging needs the microphone'
    );
    expect(render({ permission: 'camera', isNative: true })).toContain(
      'Scanning needs the camera'
    );
    expect(render({ permission: 'health', isNative: true })).toContain(
      'Health Connect access lets ASCEND read your steps, sleep and weight'
    );
  });

  it('native variant shows the Open Settings button', () => {
    const html = render({ permission: 'camera', isNative: true });
    expect(html).toContain('Open Settings');
    expect(html).toContain('data-testid="permission-help-camera"');
  });

  it('web variant hides Open Settings and shows the manual path as text', () => {
    const html = render({ permission: 'camera', isNative: false });
    expect(html).not.toContain('Open Settings');
    expect(html).toContain('browser');
    expect(html).toContain('site settings');
  });

  it('health on web explains it is Android-app only', () => {
    const html = render({ permission: 'health', isNative: false });
    expect(html).toContain('only available in the Android app');
    expect(html).not.toContain('Open Settings');
  });

  it('shows Try again only when an onRetry handler is supplied', () => {
    expect(render({ permission: 'microphone', isNative: true })).not.toContain('Try again');
    expect(
      render({ permission: 'microphone', isNative: true, onRetry: () => {} })
    ).toContain('Try again');
    // Web + retry: retry shows, settings button does not.
    const web = render({ permission: 'microphone', isNative: false, onRetry: () => {} });
    expect(web).toContain('Try again');
    expect(web).not.toContain('Open Settings');
  });

  it('has Hindi copy for every key the panel can render', () => {
    // NOTE: zustand's SSR snapshot pins initial state under
    // renderToStaticMarkup (see tests/i18n.test.ts), so the hook renders
    // English in SSR tests regardless of the live preference. The
    // durable guarantee is dictionary coverage: every perm.* key the
    // panel uses must exist in hi.ts and differ from the raw key.
    const keys = [
      'perm.title',
      'perm.openSettings',
      'perm.tryAgain',
      'perm.notificationsWhy',
      'perm.notificationsWebPath',
      'perm.microphoneWhy',
      'perm.microphoneWebPath',
      'perm.cameraWhy',
      'perm.cameraWebPath',
      'perm.healthWhy',
      'perm.healthWebPath',
    ] as const;
    for (const key of keys) {
      expect(translate('hi', key), key).not.toBe(key);
      expect(translate('hi', key).length, key).toBeGreaterThan(0);
    }
    expect(translate('hi', 'perm.title')).toBe('परमिशन बंद है');
    expect(translate('hi', 'perm.openSettings')).toBe('सेटिंग्स खोलें');
  });
});
