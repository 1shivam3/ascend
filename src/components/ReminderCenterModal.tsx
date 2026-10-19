'use client';

import React, { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';
import {
  X,
  Bell,
  Droplets,
  Utensils,
  Dumbbell,
  Calendar,
  Moon,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Copy,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { NotificationPreferences, DEFAULT_NOTIFICATION_PREFERENCES } from '@/lib/types';
import { subscribeToPush, unsubscribeFromPush } from '@/lib/push-notifications';
import { useEscapeToClose } from '@/lib/use-escape-to-close';

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

export default function ReminderCenterModal({ isOpen, onClose }: ReminderCenterModalProps) {
  useEscapeToClose(isOpen, onClose);
  const toast = useToast();
  const notificationPreferences = useStore((state) => (state as any).notificationPreferences) || DEFAULT_NOTIFICATION_PREFERENCES;
  const setNotificationPreferences = useStore((state) => (state as any).setNotificationPreferences);

  const [prefs, setPrefs] = useState<NotificationPreferences>(notificationPreferences);
  const [permissionState, setPermissionState] = useState<NotificationPermission>('default');

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermissionState(Notification.permission);
    }
  }, [isOpen]);

  useEffect(() => {
    if (notificationPreferences) {
      setPrefs(notificationPreferences);
    }
  }, [notificationPreferences]);

  if (!isOpen) return null;

  const handleRequestPermission = async (silent = false): Promise<boolean> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      if (!silent) toast.info('Notifications are not supported in this browser.', 'Not Supported');
      return false;
    }
    if (Notification.permission === 'granted') {
      setPermissionState('granted');
      return true;
    }
    try {
      const permission = await Notification.requestPermission();
      setPermissionState(permission);
      if (permission === 'granted') {
        if (!silent) toast.success('Notification permission granted!', 'Reminders Enabled');
        return true;
      } else {
        if (!silent) toast.info('Notification permission was denied or dismissed.', 'Permission Denied');
        return false;
      }
    } catch {
      return false;
    }
  };

  const handleToggleDay = (day: number) => {
    const current = prefs.workoutReminders.daysOfWeek;
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort((a, b) => a - b);

    setPrefs({
      ...prefs,
      workoutReminders: {
        ...prefs.workoutReminders,
        daysOfWeek: next,
      },
    });
  };

  const handleSave = () => {
    const hasAnyEnabled =
      prefs.waterReminders.enabled ||
      prefs.mealReminders.enabled ||
      prefs.workoutReminders.enabled ||
      prefs.weeklyReport.enabled;

    const prefsToSave = { ...prefs, enabled: hasAnyEnabled };

    // 1. SYNCHRONOUS local write first — survives the user closing the app
    //    instantly after tapping save. Nothing below this point can lose data.
    try {
      if (setNotificationPreferences) {
        setNotificationPreferences(prefsToSave);
      }
    } catch { /* store action optional */ }
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('ascend_notification_prefs', JSON.stringify(prefsToSave));
      }
    } catch { /* quota: in-memory prefs still apply this session */ }

    // 2. Instant feedback — never block the UI on network/push.
    toast.success('Reminder preferences saved.', 'Reminders Saved');
    onClose();

    // 3. Background: permission prompt, server sync, push subscription.
    //    Fire-and-forget; failures only log.
    (async () => {
      try {
        if (hasAnyEnabled && permissionState !== 'granted') {
          const granted = await handleRequestPermission(true);
          if (!granted) {
            toast.info('Enable notification permissions on your device to receive alerts.', 'Permissions');
          }
        }
      } catch { /* permission prompt dismissed */ }
      try {
        const prefHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        try {
          const { getSupabase } = await import('@/lib/supabase/client');
          const supabase = getSupabase();
          const { data: { session } } = await supabase!.auth.getSession();
          if (session?.access_token) {
            prefHeaders['Authorization'] = `Bearer ${session.access_token}`;
          }
        } catch {}
        await fetch('/api/notifications/preferences', {
          method: 'POST',
          headers: prefHeaders,
          body: JSON.stringify(prefsToSave),
        });
      } catch {
        // Local-first: non-blocking
      }
      try {
        if (hasAnyEnabled) {
          await subscribeToPush();
        } else {
          await unsubscribeFromPush();
        }
      } catch (pushErr) {
        console.warn('Push subscription toggle notice:', pushErr);
      }
    })();
  };

  const handleCopyExamplePrefs = () => {
    const exampleStr = JSON.stringify(prefs, null, 2);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(exampleStr);
      toast.info('Copied current preferences JSON to clipboard.', 'Copied');
    }
  };

  return (
    <div className="modal-overlay z-55" onClick={onClose}>
      <div
        className="modal-content max-w-md w-full max-h-[90vh] overflow-y-auto p-4 sm:p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-border/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/20 border border-accent/40 flex items-center justify-center text-accent">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-accent block">
                REMINDER CENTER
              </span>
              <h2 className="text-base sm:text-lg font-black text-text-primary tracking-tight font-display">
                Notification Preferences
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
            aria-label="Close Reminder Center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Permission Banner */}
        {permissionState !== 'granted' && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="text-2xs text-amber-200">
                <span className="font-bold block">Push Permission Required</span>
                <span>Enable notifications to receive training and hydration alerts.</span>
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleRequestPermission()}
              className="shrink-0 text-2xs px-2.5 py-1"
            >
              Grant
            </Button>
          </div>
        )}

        <div className="space-y-4">
          {/* Section 1: Water Reminders */}
          <Card variant="default" padding="sm" className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Droplets className="w-4 h-4 text-blue-400" />
                <div>
                  <span className="text-xs font-bold text-text-primary block">Water Reminders</span>
                  <span className="text-2xs text-text-muted">Choose a reminder interval.</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setPrefs({
                    ...prefs,
                    waterReminders: {
                      ...prefs.waterReminders,
                      enabled: !prefs.waterReminders.enabled,
                    },
                  })
                }
                className={`px-3 py-1 rounded-full text-2xs font-mono font-bold transition-colors ${
                  prefs.waterReminders.enabled
                    ? 'bg-blue-500 text-white'
                    : 'bg-bg-secondary border border-border text-text-muted'
                }`}
              >
                {prefs.waterReminders.enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>

            {prefs.waterReminders.enabled && (
              <div className="pt-1 border-t border-border/60 flex items-center justify-between">
                <span className="text-2xs text-text-muted font-mono">Reminder interval</span>
                <div className="flex gap-1.5">
                  {[1, 2, 3].map((hours) => (
                    <button
                      key={hours}
                      type="button"
                      onClick={() =>
                        setPrefs({
                          ...prefs,
                          waterReminders: {
                            ...prefs.waterReminders,
                            intervalHours: hours,
                          },
                        })
                      }
                      className={`px-2.5 py-1 rounded-lg text-2xs font-mono font-semibold transition-colors ${
                        prefs.waterReminders.intervalHours === hours
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40 font-bold'
                          : 'bg-bg-secondary text-text-muted border border-border'
                      }`}
                    >
                      Every {hours} {hours === 1 ? 'hour' : 'hours'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Section 2: Meal Reminders */}
          <Card variant="default" padding="sm" className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Utensils className="w-4 h-4 text-emerald-400" />
                <div>
                  <span className="text-xs font-bold text-text-primary block">Meal Reminders</span>
                  <span className="text-2xs text-text-muted">Set your usual meal times.</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setPrefs({
                    ...prefs,
                    mealReminders: {
                      ...prefs.mealReminders,
                      enabled: !prefs.mealReminders.enabled,
                    },
                  })
                }
                className={`px-3 py-1 rounded-full text-2xs font-mono font-bold transition-colors ${
                  prefs.mealReminders.enabled
                    ? 'bg-emerald-500 text-white'
                    : 'bg-bg-secondary border border-border text-text-muted'
                }`}
              >
                {prefs.mealReminders.enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>

            {prefs.mealReminders.enabled && (
              <div className="pt-2 border-t border-border/60 grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-3xs font-mono uppercase text-text-muted mb-1">
                    Breakfast
                  </label>
                  <input
                    type="time"
                    value={prefs.mealReminders.breakfastTime}
                    onChange={(e) =>
                      setPrefs({
                        ...prefs,
                        mealReminders: {
                          ...prefs.mealReminders,
                          breakfastTime: e.target.value,
                        },
                      })
                    }
                    className="w-full bg-bg-secondary border border-border rounded-lg px-2 py-1 text-2xs font-mono text-text-primary focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-3xs font-mono uppercase text-text-muted mb-1">
                    Lunch
                  </label>
                  <input
                    type="time"
                    value={prefs.mealReminders.lunchTime}
                    onChange={(e) =>
                      setPrefs({
                        ...prefs,
                        mealReminders: {
                          ...prefs.mealReminders,
                          lunchTime: e.target.value,
                        },
                      })
                    }
                    className="w-full bg-bg-secondary border border-border rounded-lg px-2 py-1 text-2xs font-mono text-text-primary focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-3xs font-mono uppercase text-text-muted mb-1">
                    Dinner
                  </label>
                  <input
                    type="time"
                    value={prefs.mealReminders.dinnerTime}
                    onChange={(e) =>
                      setPrefs({
                        ...prefs,
                        mealReminders: {
                          ...prefs.mealReminders,
                          dinnerTime: e.target.value,
                        },
                      })
                    }
                    className="w-full bg-bg-secondary border border-border rounded-lg px-2 py-1 text-2xs font-mono text-text-primary focus:outline-none focus:border-accent"
                  />
                </div>
              </div>
            )}
          </Card>

          {/* Section 3: Workout Reminders */}
          <Card variant="default" padding="sm" className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Dumbbell className="w-4 h-4 text-accent" />
                <div>
                  <span className="text-xs font-bold text-text-primary block">Workout Reminders</span>
                  <span className="text-2xs text-text-muted">
                    Remind you on your selected training days.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setPrefs({
                    ...prefs,
                    workoutReminders: {
                      ...prefs.workoutReminders,
                      enabled: !prefs.workoutReminders.enabled,
                    },
                  })
                }
                className={`px-3 py-1 rounded-full text-2xs font-mono font-bold transition-colors ${
                  prefs.workoutReminders.enabled
                    ? 'bg-accent text-bg-primary font-black'
                    : 'bg-bg-secondary border border-border text-text-muted'
                }`}
              >
                {prefs.workoutReminders.enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>

            {prefs.workoutReminders.enabled && (
              <div className="pt-2 border-t border-border/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-2xs text-text-muted font-mono">Preferred workout time</span>
                  <input
                    type="time"
                    value={prefs.workoutReminders.preferredTime}
                    onChange={(e) =>
                      setPrefs({
                        ...prefs,
                        workoutReminders: {
                          ...prefs.workoutReminders,
                          preferredTime: e.target.value,
                        },
                      })
                    }
                    className="bg-bg-secondary border border-border rounded-lg px-2 py-1 text-2xs font-mono text-text-primary focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <span className="block text-3xs font-mono uppercase text-text-muted mb-1.5">
                    Active Training Days
                  </span>
                  <div className="flex gap-1">
                    {DAYS_OF_WEEK.map((item) => {
                      const isSelected = prefs.workoutReminders.daysOfWeek.includes(item.day);
                      return (
                        <button
                          key={item.day}
                          type="button"
                          onClick={() => handleToggleDay(item.day)}
                          className={`flex-1 py-1.5 rounded-lg text-2xs font-mono font-bold transition-colors ${
                            isSelected
                              ? 'bg-accent/20 text-accent border border-accent/40'
                              : 'bg-bg-secondary text-text-muted border border-border'
                          }`}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Section 4: Weekly Report */}
          <Card variant="default" padding="sm" className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-purple-400" />
                <div>
                  <span className="text-xs font-bold text-text-primary block">Weekly Report</span>
                  <span className="text-2xs text-text-muted">
                    Notify users when their progress recap is ready.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setPrefs({
                    ...prefs,
                    weeklyReport: {
                      ...prefs.weeklyReport,
                      enabled: !prefs.weeklyReport.enabled,
                    },
                  })
                }
                className={`px-3 py-1 rounded-full text-2xs font-mono font-bold transition-colors ${
                  prefs.weeklyReport.enabled
                    ? 'bg-purple-500 text-white'
                    : 'bg-bg-secondary border border-border text-text-muted'
                }`}
              >
                {prefs.weeklyReport.enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>

            {prefs.weeklyReport.enabled && (
              <div className="pt-2 border-t border-border/60 flex items-center justify-between">
                <span className="text-2xs text-text-muted font-mono">Report day</span>
                <div className="flex gap-1.5">
                  {(['saturday', 'sunday', 'monday'] as const).map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() =>
                        setPrefs({
                          ...prefs,
                          weeklyReport: {
                            ...prefs.weeklyReport,
                            reportDay: day,
                          },
                        })
                      }
                      className={`px-2.5 py-1 rounded-lg text-2xs font-mono capitalize transition-colors ${
                        prefs.weeklyReport.reportDay === day
                          ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40 font-bold'
                          : 'bg-bg-secondary text-text-muted border border-border'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Section 5: Quiet Hours & Privacy Safeguard */}
          <Card variant="default" padding="sm" className="space-y-2 text-2xs font-mono">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Moon className="w-4 h-4 text-indigo-400" />
                <div>
                  <span className="text-xs font-bold text-text-primary block">Quiet Hours</span>
                  <span className="text-3xs text-text-muted">Suppress alerts overnight</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-3xs text-text-muted">
                <input
                  type="time"
                  aria-label="Quiet hours start"
                  value={prefs.quietHours.start}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      quietHours: { ...prefs.quietHours, start: e.target.value },
                    })
                  }
                  className="bg-bg-elevated border border-border rounded-lg px-1.5 py-1 text-3xs text-text-primary font-mono"
                />
                <span>to</span>
                <input
                  type="time"
                  aria-label="Quiet hours end"
                  value={prefs.quietHours.end}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      quietHours: { ...prefs.quietHours, end: e.target.value },
                    })
                  }
                  className="bg-bg-elevated border border-border rounded-lg px-1.5 py-1 text-3xs text-text-primary font-mono"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-border/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <div>
                  <span className="text-xs font-bold text-text-primary block">Lock Screen Privacy</span>
                  <span className="text-3xs text-text-muted">
                    Never display bodyweight or sensitive metrics on lock screen
                  </span>
                </div>
              </div>
              <Badge variant="success" size="xs">
                PROTECTED
              </Badge>
            </div>
          </Card>
        </div>

        {/* Footer Actions */}
        <div className="pt-2 border-t border-border/60 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyExamplePrefs}
            leftIcon={<Copy className="w-3.5 h-3.5" />}
            className="text-2xs"
          >
            Copy Preferences
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose} className="text-2xs">
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
              className="text-2xs"
            >
              Save Preferences
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
