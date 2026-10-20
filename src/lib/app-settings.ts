/**
 * App-settings deep link (native only).
 *
 * Android stops showing a permission popup after the user denies it
 * (and stops entirely after "don't ask again"), which leaves users
 * stuck with a silently dead feature. The only way back is this app's
 * system App-info page. This bridge calls a minimal custom Capacitor
 * plugin (AppSettingsPlugin in the android project) that fires
 * Settings.ACTION_APPLICATION_DETAILS_SETTINGS for our package.
 *
 * On web/PWA there is no equivalent — callers show the manual path as
 * text instead (see PermissionHelp).
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

export interface AppSettingsPlugin {
  openAppSettings(): Promise<void>;
}

const AppSettings = registerPlugin<AppSettingsPlugin>('AppSettings');

/** True inside the Capacitor native app; false in any browser/PWA. */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Open this app's system App-info page (where permissions live).
 * Returns false on web or if the native call fails — callers should
 * fall back to showing the manual path.
 */
export async function openAppSettings(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    await AppSettings.openAppSettings();
    return true;
  } catch {
    return false;
  }
}
