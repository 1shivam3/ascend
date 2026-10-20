'use client';

/**
 * PermissionHelp — the one reusable pattern for "permission denied".
 *
 * Android stops showing the system permission popup after a denial, so
 * a denied feature looks dead and users get stuck. This panel fixes
 * that everywhere with the same shape:
 *   1. One plain line: what the permission is for.
 *   2. Native: an "Open Settings" button deep-linking to this app's
 *      system App-info page (or a caller-provided settings action —
 *      Health Connect has its own settings screen).
 *      Web/PWA: the manual path as text instead — no dead button.
 *   3. "Try again" when re-requesting can still do something
 *      (caller supplies onRetry; omit it where it can't).
 *
 * Copy lives in the i18n dictionaries (perm.*), so every surface that
 * renders this panel gets English + Hindi for free.
 */
import React from 'react';
import { AlertCircle, RotateCcw, Settings } from 'lucide-react';
import { useTranslation, type StringKey } from '@/lib/i18n';
import { isNativeApp, openAppSettings } from '@/lib/app-settings';

export type PermissionKind = 'notifications' | 'microphone' | 'camera' | 'health';

const WHY_KEY: Record<PermissionKind, StringKey> = {
  notifications: 'perm.notificationsWhy',
  microphone: 'perm.microphoneWhy',
  camera: 'perm.cameraWhy',
  health: 'perm.healthWhy',
};

const WEB_PATH_KEY: Record<PermissionKind, StringKey> = {
  notifications: 'perm.notificationsWebPath',
  microphone: 'perm.microphoneWebPath',
  camera: 'perm.cameraWebPath',
  health: 'perm.healthWebPath',
};

export interface PermissionHelpProps {
  permission: PermissionKind;
  /** Re-request / retry action, when one can still help. */
  onRetry?: () => void;
  /**
   * Override for the settings action (e.g. Health Connect opens its
   * own settings screen, not App-info). Defaults to App-info.
   */
  onOpenSettings?: () => void | Promise<void>;
  /** Test/embedding override; defaults to the real platform check. */
  isNative?: boolean;
  className?: string;
}

export default function PermissionHelp({
  permission,
  onRetry,
  onOpenSettings,
  isNative,
  className = '',
}: PermissionHelpProps) {
  const { t } = useTranslation();
  const native = isNative ?? isNativeApp();

  const handleOpenSettings = async () => {
    if (onOpenSettings) {
      await onOpenSettings();
    } else {
      await openAppSettings();
    }
  };

  return (
    <div
      data-testid={`permission-help-${permission}`}
      className={`p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2 ${className}`}
    >
      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="text-2xs text-amber-200 leading-relaxed">
          <span className="font-bold block">{t('perm.title')}</span>
          <span>{t(WHY_KEY[permission])}</span>{' '}
          {!native && <span>{t(WEB_PATH_KEY[permission])}</span>}
        </div>
        {(native || onRetry) && (
          <div className="flex flex-wrap gap-2">
            {native && (
              <button
                type="button"
                onClick={handleOpenSettings}
                className="btn-primary shrink-0 text-2xs px-3 py-1.5 font-bold cursor-pointer inline-flex items-center gap-1.5"
              >
                <Settings className="w-3.5 h-3.5" />
                {t('perm.openSettings')}
              </button>
            )}
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="shrink-0 text-2xs px-3 py-1.5 font-bold cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-bg-secondary border border-border text-text-primary hover:bg-bg-secondary/80 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {t('perm.tryAgain')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
