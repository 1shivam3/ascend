'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useModalA11y } from '@/lib/use-modal-a11y';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';
import {
  X,
  Bell,
  BellRing,
  Droplets,
  Utensils,
  Dumbbell,
  Calendar,
  Moon,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Send,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { NotificationPreferences, DEFAULT_NOTIFICATION_PREFERENCES } from '@/lib/types';
import { subscribeToPush, unsubscribeFromPush, getExistingPushSubscription } from '@/lib/push-notifications';
import {
  checkLocalNotificationPermission,
  isNativeApp,
  requestLocalNotificationPermission,
  sendTestLocalNotification,
  syncLocalNotifications,
} from '@/lib/local-notifications';
import PermissionHelp from '@/components/ui/PermissionHelp';
import { useTranslation, weekdayNames } from '@/lib/i18n';

interface ReminderCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DAYS_OF_WEEK = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
  { day: 0, label: 'Sun' },
];

function formatTimeLabel(hhmm: string): string {
  const [hStr, mStr] = (hhmm || '00:00').split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** iOS-style switch used across every reminder row. */
function Toggle({
  checked,
  onChange,
  label,
  accentClass = 'bg-accent',
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  accentClass?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`w-11 h-6 rounded-full transition-colors relative shrink-0 cursor-pointer ${
        checked ? accentClass : 'bg-bg-secondary border border-border'
      }`}
    >
      <div
        className={`w-5 h-5 rounded-full bg-white shadow transition-transform absolute top-0.5 ${
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

export default function ReminderCenterModal({ isOpen, onClose }: ReminderCenterModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const { dialogProps } = useModalA11y(modalRef, isOpen, onClose);
  const { t, language } = useTranslation();
  const toast = useToast();
  const notificationPreferences = useStore((state) => state.notificationPreferences) || DEFAULT_NOTIFICATION_PREFERENCES;
  const setNotificationPreferences = useStore((state) => state.setNotificationPreferences);

  const [prefs, setPrefs] = useState<NotificationPreferences>(notificationPreferences);
  const [permissionState, setPermissionState] = useState<NotificationPermission | 'unsupported'>('default');
  const [hasSubscription, setHasSubscription] = useState(false);
  const [quietHoursExpanded, setQuietHoursExpanded] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Inside the Android app, reminders are delivered by on-device local
  // notifications (web push cannot reach the WebView when closed), so the
  // permission state, Enable action and test button use the native plugin.
  const [isNative] = useState(() => isNativeApp());

  useEffect(() => {
    if (!isOpen) return;
    if (isNative) {
      checkLocalNotificationPermission().then((state) => {
        setPermissionState(
          state === 'granted' ? 'granted' : state === 'denied' ? 'denied' : state === 'prompt' ? 'default' : 'unsupported'
        );
      });
      return;
    }
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermissionState('unsupported');
    } else {
      setPermissionState(Notification.permission);
    }
    getExistingPushSubscription().then((sub) => setHasSubscription(Boolean(sub)));
  }, [isOpen, isNative]);

  useEffect(() => {
    if (notificationPreferences) {
      setPrefs(notificationPreferences);
    }
  }, [notificationPreferences]);

  if (!isOpen) return null;

  const anyReminderEnabled =
    prefs.waterReminders.enabled ||
    prefs.mealReminders.enabled ||
    prefs.workoutReminders.enabled ||
    prefs.weeklyReport.enabled;

  /**
   * Instant local-first save: the store + localStorage writes happen
   * synchronously so a change survives the user closing the app mid-tap.
   * Server sync and push subscribe/unsubscribe run debounced in the background.
   */
  const persist = (next: NotificationPreferences) => {
    setPrefs(next);
    try {
      setNotificationPreferences(next);
    } catch { /* store action optional */ }
    try {
      localStorage.setItem('ascend_notification_prefs', JSON.stringify(next));
    } catch { /* quota: in-memory prefs still apply this session */ }

    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      void syncToServer(next);
    }, 600);
  };

  const syncToServer = async (next: NotificationPreferences) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      try {
        const { getSupabase } = await import('@/lib/supabase/client');
        const supabase = getSupabase();
        const { data: { session } } = await supabase!.auth.getSession();
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }
      } catch {}
      await fetch('/api/notifications/preferences', {
        method: 'POST',
        headers,
        body: JSON.stringify(next),
      });
    } catch {
      // Local-first: server sync is best-effort.
    }
    if (isNative) {
      // Native delivery is on-device: (re)schedule local notifications from
      // the new preferences. No web-push subscription exists in the WebView.
      try {
        await syncLocalNotifications();
      } catch (err) {
        console.warn('Local notification schedule notice:', err);
      }
      return;
    }
    try {
      if (next.enabled) {
        const result = await subscribeToPush();
        if (result.success) {
          setHasSubscription(true);
          setPermissionState('granted');
        }
      } else {
        await unsubscribeFromPush();
        setHasSubscription(false);
      }
    } catch (err) {
      console.warn('Push subscription toggle notice:', err);
    }
  };

  const handleMasterToggle = (on: boolean) => {
    if (on && !anyReminderEnabled) {
      // Sensible default: turning notifications on enables workout reminders.
      persist({ ...prefs, enabled: true, workoutReminders: { ...prefs.workoutReminders, enabled: true } });
    } else {
      persist({ ...prefs, enabled: on });
    }
  };

  const handleEnablePermission = async () => {
    if (isNative) {
      const granted = await requestLocalNotificationPermission();
      if (granted) {
        setPermissionState('granted');
        toast.success(t('rem.enabledMsg'), t('rem.enabledTitle'));
        if (!prefs.enabled) {
          persist({ ...prefs, enabled: true });
        } else {
          await syncLocalNotifications();
        }
      } else {
        setPermissionState('denied');
        toast.error(t('rem.stillOffMsg'), t('rem.permTitle'));
      }
      return;
    }
    const result = await subscribeToPush();
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermissionState(Notification.permission);
    }
    if (result.success) {
      setHasSubscription(true);
      toast.success(t('rem.enabledMsg'), t('rem.enabledTitle'));
      if (!prefs.enabled) {
        persist({ ...prefs, enabled: true });
      }
    } else {
      toast.error(result.error || t('rem.couldNotEnable'), t('rem.permTitle'));
    }
  };

  const handleSendTest = async () => {
    if (isNative) {
      const state = await checkLocalNotificationPermission();
      if (state !== 'granted') {
        toast.info(t('rem.notGrantedMsg'), t('rem.permTitle'));
        return;
      }
      setIsSendingTest(true);
      try {
        const sent = await sendTestLocalNotification();
        if (sent) {
          toast.success(t('rem.testSentMsg'), t('rem.testSentTitle'));
        } else {
          toast.error(t('rem.testFailMsg'), t('rem.testFailTitle'));
        }
      } finally {
        setIsSendingTest(false);
      }
      return;
    }
    if (typeof window === 'undefined' || !('Notification' in window)) {
      toast.info(t('rem.notSupportedMsg'), t('rem.notSupportedTitle'));
      return;
    }
    if (Notification.permission !== 'granted') {
      toast.info(t('rem.notGrantedMsg'), t('rem.permTitle'));
      return;
    }
    setIsSendingTest(true);
    try {
      let shown = false;
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification('ASCEND', {
          body: t('rem.testBody'),
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: 'ascend-test-notification',
        });
        shown = true;
      }
      if (!shown) {
        // Fallback for environments without an active service worker.
        new Notification('ASCEND', {
          body: t('rem.testBody'),
          icon: '/icon-192.png',
          tag: 'ascend-test-notification',
        });
      }
      toast.success(t('rem.testSentMsg'), t('rem.testSentTitle'));
    } catch (err) {
      console.warn('Test notification failed:', err);
      toast.error(t('rem.testFailMsg'), t('rem.testFailTitle'));
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleToggleDay = (day: number) => {
    const current = prefs.workoutReminders.daysOfWeek;
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort((a, b) => a - b);
    // Hand-picking days opts out of the schedule auto-sync — the user's
    // explicit choice wins from now on.
    persist({
      ...prefs,
      workoutReminders: { ...prefs.workoutReminders, daysOfWeek: next, daysCustomized: true },
    });
  };

  const sectionDim = prefs.enabled ? '' : 'opacity-50 pointer-events-none';

  return (
    <div ref={modalRef} {...dialogProps} className="modal-overlay z-55" onClick={onClose}>
      <div
        className="modal-content max-w-md w-full max-h-[90vh] overflow-y-auto p-4 sm:p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with master toggle */}
        <div className="flex items-center justify-between pb-3 border-b border-border/80">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent shrink-0">
              <Bell className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black text-text-primary tracking-tight font-display leading-tight">
                {t('rem.title')}
              </h2>
              <p className="text-2xs text-text-muted">
                {prefs.enabled ? t('rem.on') : t('rem.off')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Toggle
              checked={prefs.enabled}
              onChange={handleMasterToggle}
              label={t('rem.allNotifications')}
            />
            <button
              type="button"
              onClick={onClose}
              className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
              aria-label={t('rem.closeAria')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Permission status */}
        {permissionState === 'unsupported' && (
          <div className="p-3 rounded-xl bg-bg-secondary border border-border flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />
            <p className="text-2xs text-text-secondary leading-relaxed">
              {t('rem.unsupported')}
            </p>
          </div>
        )}
        {permissionState === 'denied' && (
          <PermissionHelp
            permission="notifications"
            isNative={isNative}
            onRetry={handleEnablePermission}
          />
        )}
        {(permissionState === 'default') && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <BellRing className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="text-2xs text-amber-200 leading-relaxed">
                <span className="font-bold block">{t('rem.permNeeded')}</span>
                <span>{t('rem.permNeededBody')}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleEnablePermission}
              className="btn-primary shrink-0 text-2xs px-3 py-1.5 font-bold cursor-pointer"
            >
              {t('rem.enable')}
            </button>
          </div>
        )}
        {permissionState === 'granted' && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <p className="text-2xs text-emerald-200 leading-relaxed">
              {isNative
                ? t('rem.grantedNative')
                : hasSubscription
                  ? t('rem.grantedWebSub')
                  : `${t('rem.grantedWeb')}.`}
            </p>
          </div>
        )}

        <div className={`space-y-4 ${sectionDim}`}>
          {/* ── TRAINING ─────────────────────────────────────────── */}
          <div className="space-y-2">
            <span className="text-3xs font-mono font-bold uppercase tracking-wider text-text-muted px-1">
              {t('rem.training')}
            </span>

            <Card variant="default" padding="sm" className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
                    <Dumbbell className="w-4 h-4 text-accent" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-text-primary block">{t('rem.workout')}</span>
                    <span className="text-2xs text-text-muted block">
                      {prefs.workoutReminders.enabled
                        ? t('rem.workoutOn', { time: formatTimeLabel(prefs.workoutReminders.preferredTime) })
                        : t('rem.workoutOff')}
                    </span>
                  </div>
                </div>
                <Toggle
                  checked={prefs.workoutReminders.enabled}
                  onChange={(on) =>
                    persist({
                      ...prefs,
                      enabled: prefs.enabled || on,
                      workoutReminders: { ...prefs.workoutReminders, enabled: on },
                    })
                  }
                  label={t('rem.toggleWorkout')}
                />
              </div>

              {prefs.workoutReminders.enabled && (
                <div className="pt-2 border-t border-border/60 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-2xs text-text-muted">{t('rem.reminderTime')}</span>
                    <input
                      type="time"
                      value={prefs.workoutReminders.preferredTime}
                      onChange={(e) =>
                        persist({
                          ...prefs,
                          workoutReminders: { ...prefs.workoutReminders, preferredTime: e.target.value },
                        })
                      }
                      className="bg-bg-secondary border border-border rounded-lg px-2 py-1 text-2xs font-mono text-text-primary focus:outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <span className="block text-3xs font-mono uppercase text-text-muted mb-1.5">
                      {t('rem.trainingDays')}
                    </span>
                    <div className="flex gap-1">
                      {DAYS_OF_WEEK.map((item, dayIdx) => {
                        const isSelected = prefs.workoutReminders.daysOfWeek.includes(item.day);
                        return (
                          <button
                            key={item.day}
                            type="button"
                            onClick={() => handleToggleDay(item.day)}
                            className={`flex-1 py-1.5 rounded-lg text-2xs font-mono font-bold transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-accent/20 text-accent border border-accent/40'
                                : 'bg-bg-secondary text-text-muted border border-border'
                            }`}
                          >
                            {weekdayNames(language, 'short')[dayIdx]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </Card>

            <Card variant="default" padding="sm" className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0">
                    <Calendar className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-text-primary block">{t('rem.weeklyReport')}</span>
                    <span className="text-2xs text-text-muted block">
                      {prefs.weeklyReport.enabled
                        ? t('rem.weeklyOn', {
                            day: weekdayNames(language, 'full')[(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const).indexOf(prefs.weeklyReport.reportDay)],
                            time: formatTimeLabel(prefs.weeklyReport.reportTime),
                          })
                        : t('rem.weeklyOff')}
                    </span>
                  </div>
                </div>
                <Toggle
                  checked={prefs.weeklyReport.enabled}
                  onChange={(on) =>
                    persist({
                      ...prefs,
                      enabled: prefs.enabled || on,
                      weeklyReport: { ...prefs.weeklyReport, enabled: on },
                    })
                  }
                  label={t('rem.toggleWeekly')}
                  accentClass="bg-purple-500"
                />
              </div>

              {prefs.weeklyReport.enabled && (
                <div className="pt-2 border-t border-border/60 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const).map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() =>
                          persist({ ...prefs, weeklyReport: { ...prefs.weeklyReport, reportDay: day } })
                        }
                        className={`px-2.5 py-1 rounded-lg text-2xs font-mono capitalize transition-colors cursor-pointer ${
                          prefs.weeklyReport.reportDay === day
                            ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40 font-bold'
                            : 'bg-bg-secondary text-text-muted border border-border'
                        }`}
                      >
                        {weekdayNames(language, 'full')[(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const).indexOf(day)]}
                      </button>
                    ))}
                  </div>
                  <input
                    type="time"
                    value={prefs.weeklyReport.reportTime}
                    onChange={(e) =>
                      persist({ ...prefs, weeklyReport: { ...prefs.weeklyReport, reportTime: e.target.value } })
                    }
                    className="bg-bg-secondary border border-border rounded-lg px-2 py-1 text-2xs font-mono text-text-primary focus:outline-none focus:border-accent"
                  />
                </div>
              )}
            </Card>
          </div>

          {/* ── NUTRITION ────────────────────────────────────────── */}
          <div className="space-y-2">
            <span className="text-3xs font-mono font-bold uppercase tracking-wider text-text-muted px-1">
              {t('rem.nutrition')}
            </span>

            <Card variant="default" padding="sm" className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                    <Utensils className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-text-primary block">{t('rem.meals')}</span>
                    <span className="text-2xs text-text-muted block">
                      {prefs.mealReminders.enabled
                        ? t('rem.mealsOn', {
                            breakfast: formatTimeLabel(prefs.mealReminders.breakfastTime),
                            lunch: formatTimeLabel(prefs.mealReminders.lunchTime),
                            dinner: formatTimeLabel(prefs.mealReminders.dinnerTime),
                          })
                        : t('rem.mealsOff')}
                    </span>
                  </div>
                </div>
                <Toggle
                  checked={prefs.mealReminders.enabled}
                  onChange={(on) =>
                    persist({
                      ...prefs,
                      enabled: prefs.enabled || on,
                      mealReminders: { ...prefs.mealReminders, enabled: on },
                    })
                  }
                  label={t('rem.toggleMeals')}
                  accentClass="bg-emerald-500"
                />
              </div>

              {prefs.mealReminders.enabled && (
                <div className="pt-2 border-t border-border/60 grid grid-cols-3 gap-2">
                  {(
                    [
                      { key: 'breakfastTime', label: t('meals.breakfast') },
                      { key: 'lunchTime', label: t('meals.lunch') },
                      { key: 'dinnerTime', label: t('meals.dinner') },
                    ] as const
                  ).map(({ key, label }) => (
                    <div key={key}>
                      <label className="block text-3xs font-mono uppercase text-text-muted mb-1">
                        {label}
                      </label>
                      <input
                        type="time"
                        value={prefs.mealReminders[key]}
                        onChange={(e) =>
                          persist({
                            ...prefs,
                            mealReminders: { ...prefs.mealReminders, [key]: e.target.value },
                          })
                        }
                        className="w-full bg-bg-secondary border border-border rounded-lg px-2 py-1 text-2xs font-mono text-text-primary focus:outline-none focus:border-accent"
                      />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* ── HABITS ───────────────────────────────────────────── */}
          <div className="space-y-2">
            <span className="text-3xs font-mono font-bold uppercase tracking-wider text-text-muted px-1">
              {t('rem.habits')}
            </span>

            <Card variant="default" padding="sm" className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
                    <Droplets className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-text-primary block">{t('rem.water')}</span>
                    <span className="text-2xs text-text-muted block">
                      {prefs.waterReminders.enabled
                        ? t(prefs.waterReminders.intervalHours === 1 ? 'rem.waterOnOne' : 'rem.waterOn', { hours: prefs.waterReminders.intervalHours })
                        : t('rem.waterOff')}
                    </span>
                  </div>
                </div>
                <Toggle
                  checked={prefs.waterReminders.enabled}
                  onChange={(on) =>
                    persist({
                      ...prefs,
                      enabled: prefs.enabled || on,
                      waterReminders: { ...prefs.waterReminders, enabled: on },
                    })
                  }
                  label={t('rem.toggleWater')}
                  accentClass="bg-blue-500"
                />
              </div>

              {prefs.waterReminders.enabled && (
                <div className="pt-2 border-t border-border/60 flex items-center justify-between">
                  <span className="text-2xs text-text-muted">{t('rem.interval')}</span>
                  <div className="flex gap-1.5">
                    {[1, 2, 3].map((hours) => (
                      <button
                        key={hours}
                        type="button"
                        onClick={() =>
                          persist({
                            ...prefs,
                            waterReminders: { ...prefs.waterReminders, intervalHours: hours },
                          })
                        }
                        className={`px-2.5 py-1 rounded-lg text-2xs font-mono font-semibold transition-colors cursor-pointer ${
                          prefs.waterReminders.intervalHours === hours
                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40 font-bold'
                            : 'bg-bg-secondary text-text-muted border border-border'
                        }`}
                      >
                        {t(hours === 1 ? 'rem.everyHour' : 'rem.everyHours', { hours })}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* ── QUIET HOURS & PRIVACY ────────────────────────────── */}
          <div className="space-y-2">
            <span className="text-3xs font-mono font-bold uppercase tracking-wider text-text-muted px-1">
              {t('rem.dndPrivacy')}
            </span>

            <Card variant="default" padding="sm" className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setQuietHoursExpanded((v) => !v)}
                  className="flex items-center gap-2.5 min-w-0 cursor-pointer text-left"
                  aria-expanded={quietHoursExpanded}
                >
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center shrink-0">
                    <Moon className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-text-primary block">{t('rem.quiet')}</span>
                    <span className="text-2xs text-text-muted block">
                      {prefs.quietHours.enabled
                        ? t('rem.quietOn', { start: formatTimeLabel(prefs.quietHours.start), end: formatTimeLabel(prefs.quietHours.end) })
                        : t('rem.quietOff')}
                    </span>
                  </div>
                </button>
                <Toggle
                  checked={prefs.quietHours.enabled}
                  onChange={(on) =>
                    persist({ ...prefs, quietHours: { ...prefs.quietHours, enabled: on } })
                  }
                  label={t('rem.toggleQuiet')}
                  accentClass="bg-indigo-500"
                />
              </div>

              {quietHoursExpanded && prefs.quietHours.enabled && (
                <div className="pt-2 border-t border-border/60 flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-2xs text-text-muted">
                    {t('rem.from')}
                    <input
                      type="time"
                      aria-label={t('rem.quietStartAria')}
                      value={prefs.quietHours.start}
                      onChange={(e) =>
                        persist({ ...prefs, quietHours: { ...prefs.quietHours, start: e.target.value } })
                      }
                      className="bg-bg-secondary border border-border rounded-lg px-2 py-1 text-2xs font-mono text-text-primary focus:outline-none focus:border-accent"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-2xs text-text-muted">
                    {t('rem.until')}
                    <input
                      type="time"
                      aria-label={t('rem.quietEndAria')}
                      value={prefs.quietHours.end}
                      onChange={(e) =>
                        persist({ ...prefs, quietHours: { ...prefs.quietHours, end: e.target.value } })
                      }
                      className="bg-bg-secondary border border-border rounded-lg px-2 py-1 text-2xs font-mono text-text-primary focus:outline-none focus:border-accent"
                    />
                  </label>
                </div>
              )}

              <div className="pt-2 border-t border-border/60 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-text-primary block">{t('rem.lockPrivacy')}</span>
                    <span className="text-2xs text-text-muted block">
                      {t('rem.lockPrivacyBody')}
                    </span>
                  </div>
                </div>
                <Toggle
                  checked={prefs.lockScreenPrivacy}
                  onChange={(on) => persist({ ...prefs, lockScreenPrivacy: on })}
                  label={t('rem.toggleLock')}
                  accentClass="bg-emerald-500"
                />
              </div>
            </Card>
          </div>
        </div>

        {/* Test notification */}
        <button
          type="button"
          onClick={handleSendTest}
          disabled={isSendingTest}
          className="w-full py-3 rounded-xl border border-border bg-bg-card text-text-primary text-xs font-bold flex items-center justify-center gap-2 hover:border-accent/50 transition-colors cursor-pointer disabled:opacity-50"
        >
          <Send className="w-4 h-4 text-accent" />
          <span>{isSendingTest ? t('rem.sending') : t('rem.sendTest')}</span>
        </button>
        <p className="text-3xs text-text-muted text-center font-mono">
          {t('rem.footer')}
        </p>
      </div>
    </div>
  );
}
