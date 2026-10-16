'use client';

import React, { useState, useRef } from 'react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';
import {
  X,
  User,
  Settings,
  Shield,
  HardDrive,
  Key,
  Target,
  Scale,
  ChevronRight,
  LogOut,
  Utensils,
  Download,
  Upload,
  RefreshCw,
  Database,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Bell,
  Trash2,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { exportFullBackupJSON, importFullBackupJSON } from '@/lib/storage';
import { useSupabaseSync } from '@/lib/supabase/useSupabaseSync';
import ThemeToggle from '@/components/ui/ThemeToggle';
import DataVaultModal from '@/components/DataVaultModal';
import LegalHubModal from '@/components/LegalHubModal';
import BodyMetricsModal from '@/components/BodyMetricsModal';
import GoalSelectorModal from '@/components/GoalSelectorModal';
import AuthModal from '@/components/AuthModal';
import FeedbackModal from '@/components/FeedbackModal';
import ReminderCenterModal from '@/components/ReminderCenterModal';
import { useAppNavigation } from '@/lib/navigation';
import { AthleteGoal, ATHLETE_GOAL_CONFIGS, DietPreference } from '@/lib/types';
import { getTelemetryConsent, setTelemetryConsent, TelemetryConsent, TELEMETRY_CONSENT_EVENT } from '@/lib/telemetry';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { SegmentedControl } from '@/components/ui/SegmentedControl';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const profile = useStore((state) => state.profile);
  const setProfile = useStore((state) => state.setProfile);
  const userMode = useStore((state) => state.userMode) || 'beginner';
  const setUserMode = useStore((state) => state.setUserMode);
  const logout = useStore((state) => state.logout);
  const goals = useStore((state) => state.goals || ['get_stronger', 'build_muscle']);
  const importAllData = useStore((state) => state.importAllData);
  const toast = useToast();

  const theme = useStore((state) => state.theme);
  const hasCustomTheme = useStore((state) => state.hasCustomTheme);
  const resetThemeToSystem = useStore((state) => state.resetThemeToSystem);

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const backupFileInputRef = useRef<HTMLInputElement>(null);

  // Cloud Sync (Supabase)
  const {
    status: syncStatus,
    lastSyncedAt,
    error: syncError,
    syncNow,
    user,
    signOut,
    deleteAccount,
  } = useSupabaseSync();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Sub-modal states
  const [isGoalSelectorOpen, setIsGoalSelectorOpen] = useState(false);
  const [isDataVaultOpen, setIsDataVaultOpen] = useState(false);
  const [isLegalHubOpen, setIsLegalHubOpen] = useState(false);
  const [isBodyMetricsOpen, setIsBodyMetricsOpen] = useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [isReminderCenterOpen, setIsReminderCenterOpen] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [telemetryConsent, setTelemetryConsentState] = useState<TelemetryConsent>(null);

  React.useEffect(() => {
    setTelemetryConsentState(getTelemetryConsent());
    const handler = () => setTelemetryConsentState(getTelemetryConsent());
    window.addEventListener(TELEMETRY_CONSENT_EVENT, handler);
    return () => window.removeEventListener(TELEMETRY_CONSENT_EVENT, handler);
  }, []);

  const { registerBackHandler } = useAppNavigation();

  // Settings sub-modal back handlers (higher priority than SettingsModal itself)
  React.useEffect(() => {
    if (!isOpen) return;
    if (showDeleteAccountModal) {
      return registerBackHandler(() => {
        setShowDeleteAccountModal(false);
        return true;
      }, 140);
    }
  }, [isOpen, showDeleteAccountModal, registerBackHandler]);

  React.useEffect(() => {
    if (!isOpen) return;
    if (showLogoutConfirm) {
      return registerBackHandler(() => {
        setShowLogoutConfirm(false);
        return true;
      }, 130);
    }
  }, [isOpen, showLogoutConfirm, registerBackHandler]);

  React.useEffect(() => {
    if (!isOpen) return;
    if (isReminderCenterOpen) {
      return registerBackHandler(() => {
        setIsReminderCenterOpen(false);
        return true;
      }, 120);
    }
  }, [isOpen, isReminderCenterOpen, registerBackHandler]);

  React.useEffect(() => {
    if (!isOpen) return;
    if (isGoalSelectorOpen) {
      return registerBackHandler(() => {
        setIsGoalSelectorOpen(false);
        return true;
      }, 120);
    }
  }, [isOpen, isGoalSelectorOpen, registerBackHandler]);

  React.useEffect(() => {
    if (!isOpen) return;
    if (isDataVaultOpen) {
      return registerBackHandler(() => {
        setIsDataVaultOpen(false);
        return true;
      }, 120);
    }
  }, [isOpen, isDataVaultOpen, registerBackHandler]);

  React.useEffect(() => {
    if (!isOpen) return;
    if (isLegalHubOpen) {
      return registerBackHandler(() => {
        setIsLegalHubOpen(false);
        return true;
      }, 120);
    }
  }, [isOpen, isLegalHubOpen, registerBackHandler]);

  React.useEffect(() => {
    if (!isOpen) return;
    if (isBodyMetricsOpen) {
      return registerBackHandler(() => {
        setIsBodyMetricsOpen(false);
        return true;
      }, 120);
    }
  }, [isOpen, isBodyMetricsOpen, registerBackHandler]);

  React.useEffect(() => {
    if (!isOpen) return;
    if (isAuthModalOpen) {
      return registerBackHandler(() => {
        setIsAuthModalOpen(false);
        return true;
      }, 120);
    }
  }, [isOpen, isAuthModalOpen, registerBackHandler]);

  React.useEffect(() => {
    if (!isOpen) return;
    if (isFeedbackModalOpen) {
      return registerBackHandler(() => {
        setIsFeedbackModalOpen(false);
        return true;
      }, 120);
    }
  }, [isOpen, isFeedbackModalOpen, registerBackHandler]);

  // Main SettingsModal back handler
  React.useEffect(() => {
    if (isOpen) {
      return registerBackHandler(() => {
        onClose();
        return true;
      }, 100);
    }
  }, [isOpen, onClose, registerBackHandler]);

  if (!isOpen) return null;

  const handleDirectExport = () => {
    try {
      const jsonStr = exportFullBackupJSON();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      link.href = url;
      link.download = `ascend_backup_${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Downloaded full JSON backup! Keep it safe on iCloud or Google Drive.', 'Backup Saved');
    } catch {
      toast.error('Failed to export backup file.', 'Export Error');
    }
  };

  const handleDirectRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        const success = importAllData(parsed);
        importFullBackupJSON(content);
        if (success) {
          toast.success('Restored all PRs, workouts, meals & settings successfully!', 'Data Restored');
        } else {
          toast.error('Invalid backup file structure.', 'Restore Failed');
        }
      } catch {
        toast.error('Could not read or parse backup JSON file.', 'Parse Failure');
      } finally {
        if (backupFileInputRef.current) backupFileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleToggleUnit = (nextUnit: 'kg' | 'lbs') => {
    if (!profile) return;
    setProfile({
      ...profile,
      unit: nextUnit,
    });
    toast.info(`Preferred unit switched to ${nextUnit.toUpperCase()}`, 'Unit Updated');
  };

  const handleConfirmLogout = async () => {
    setShowLogoutConfirm(false);
    onClose();
    try {
      await signOut();
    } catch (err) {
      console.warn('Sign out warning:', err);
    }
    logout({ clearLocalData: false });
    toast.info('Logged out. Switched to welcome screen.', 'Logged Out');
  };

  const handleConfirmDeleteAccount = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') {
      toast.error('Please type DELETE to confirm.', 'Confirmation Required');
      return;
    }
    setIsDeletingAccount(true);
    try {
      const result = await deleteAccount();
      if (result.success) {
        setShowDeleteAccountModal(false);
        onClose();
        toast.success(
          'Your ASCEND account and all associated cloud and device data have been permanently deleted.',
          'Account Eradicated'
        );
      } else {
        // Distinguish between cloud failure and local-data-only scenarios
        if (result.error?.includes('Cloud account deletion failed')) {
          toast.error(
            'Cloud account deletion failed. Your local device data remains intact. ' +
              'See error details for support.',
            'Deletion Failed'
          );
        } else if (result.error?.includes('Partial deletion')) {
          toast.error(
            'Partial deletion: Some cloud records could not be purged. Please contact support@ascendfit.app.',
            'Partial Deletion'
          );
        } else if (result.error?.includes('Cloud deletion skipped')) {
          toast.info(
            'Cloud deletion was skipped (no Supabase config). All local device data was purged.',
            'Data Purged Locally'
          );
        } else {
          toast.info(
            result.error || 'Cloud sync was offline, but all local device data was purged.',
            'Data Purged'
          );
        }
        setShowDeleteAccountModal(false);
        onClose();
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to complete account deletion.');
    } finally {
      setIsDeletingAccount(false);
    }
  };

  return (
    <>
      <div className="modal-overlay z-50" onClick={onClose}>
        <div
          className="modal-content max-w-md w-full max-h-[90vh] overflow-y-auto p-4 sm:p-5 space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-border/80">
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-accent block">
                ASCEND SETTINGS
              </span>
              <h2 className="text-lg font-black text-text-primary tracking-tight font-display">
                Athlete Settings
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
              aria-label="Close Settings"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Athlete Profile Header Tile */}
          <div className="p-3.5 rounded-2xl bg-bg-secondary/60 border border-border/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/20 border border-accent/40 flex items-center justify-center font-bold text-accent text-sm font-mono select-none">
                {profile?.name ? profile.name.charAt(0).toUpperCase() : 'A'}
              </div>
              <div>
                <span className="text-sm font-bold text-text-primary block leading-tight font-display">
                  {profile?.name || 'Athlete'}
                </span>
                <span className="text-[11px] text-text-muted font-mono">
                  {profile?.gender ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1) : 'Male'} • {profile?.bodyweightKg ? `${Math.round(profile.bodyweightKg)} kg` : ''} • {profile?.dietPreference ? profile.dietPreference.replace('_', '-').toUpperCase() : 'NON-VEG'} • {profile?.unit?.toUpperCase() || 'KG'}
                </span>
              </div>
            </div>
            <Badge variant="brand" size="xs">
              {profile?.unit?.toUpperCase() || 'KG'}
            </Badge>
          </div>

          {/* Section 1: Profile & Training Experience */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-text-muted px-1 block">
              1. Profile &amp; Experience
            </span>

            <Card variant="default" padding="sm" className="divide-y divide-border/60">
              {/* Unit Toggle */}
              <div className="py-2.5 flex items-center justify-between px-1">
                <div>
                  <span className="text-xs font-semibold text-text-primary block">Weight Unit</span>
                  <span className="text-2xs text-text-muted">Display all lifts in {profile?.unit?.toUpperCase()}</span>
                </div>
                <div className="w-28">
                  <SegmentedControl
                    value={profile?.unit || 'kg'}
                    onChange={(val) => handleToggleUnit(val as 'kg' | 'lbs')}
                    size="sm"
                    options={[
                      { value: 'kg', label: 'KG' },
                      { value: 'lbs', label: 'LBS' },
                    ]}
                  />
                </div>
              </div>

              {/* Training Experience Mode */}
              <div className="py-2.5 flex items-center justify-between px-1">
                <div>
                  <span className="text-xs font-semibold text-text-primary block">Training UI Mode</span>
                  <span className="text-2xs text-text-muted">
                    {userMode === 'beginner' ? 'Beginner: Focused 1-set logger' : 'Advanced: Multi-set tables & RPE'}
                  </span>
                </div>
                <div className="w-40">
                  <SegmentedControl
                    value={userMode}
                    onChange={(val) => {
                      setUserMode(val as 'beginner' | 'advanced');
                      toast.info(`Switched to ${val} mode.`);
                    }}
                    size="sm"
                    options={[
                      { value: 'beginner', label: 'Beginner' },
                      { value: 'advanced', label: 'Advanced' },
                    ]}
                  />
                </div>
              </div>

              {/* Dietary Preference */}
              <div className="py-2.5 flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <Utensils className="w-3.5 h-3.5 text-accent" />
                  <div>
                    <span className="text-xs font-semibold text-text-primary block">Dietary Preference</span>
                    <span className="text-2xs text-text-muted">Tailors food &amp; protein targets</span>
                  </div>
                </div>
                <div className="w-36">
                  <select
                    value={profile?.dietPreference || 'non_vegetarian'}
                    onChange={(e) => {
                      if (!profile) return;
                      const nextDiet = e.target.value as DietPreference;
                      setProfile({
                        ...profile,
                        dietPreference: nextDiet,
                      });
                      toast.info(`Diet preference set to ${nextDiet.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}`, 'Diet Updated');
                    }}
                    className="w-full bg-bg-secondary border border-border/80 rounded-lg px-2 py-1 text-xs font-medium text-text-primary focus:outline-none focus:border-accent cursor-pointer"
                  >
                    <option value="non_vegetarian">Non-Vegetarian</option>
                    <option value="eggitarian">Eggitarian</option>
                    <option value="vegetarian">Vegetarian</option>
                    <option value="vegan">Vegan</option>
                  </select>
                </div>
              </div>

              {/* Body Metrics Trigger */}
              <button
                type="button"
                onClick={() => setIsBodyMetricsOpen(true)}
                className="w-full py-2.5 min-h-[44px] flex items-center justify-between text-left cursor-pointer hover:bg-bg-secondary/40 px-1 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Scale className="w-4 h-4 text-accent" />
                  <div>
                    <span className="text-xs font-semibold text-text-primary block">Log Bodyweight &amp; Scale</span>
                    <span className="text-2xs text-text-muted font-mono">
                      {profile?.bodyweightKg ? `${Math.round(profile.bodyweightKg)} kg` : 'Unset'}{profile?.heightCm ? ` • ${profile.heightCm} cm` : ''}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted" />
              </button>

              {/* Theme Toggle */}
              <div className="py-2.5 flex items-center justify-between px-1">
                <div>
                  <span className="text-xs font-semibold text-text-primary block">Theme Appearance</span>
                  <span className="text-2xs text-text-muted block">
                    {hasCustomTheme
                      ? `${theme === 'dark' ? 'Dark' : 'Light'} Mode (manual)`
                      : `Synced with device (${theme === 'dark' ? 'Dark' : 'Light'})`}
                  </span>
                  {hasCustomTheme && (
                    <button
                      type="button"
                      onClick={() => resetThemeToSystem()}
                      className="text-[10px] text-accent hover:underline mt-0.5 block text-left font-medium"
                    >
                      Reset to System
                    </button>
                  )}
                </div>
                <ThemeToggle />
              </div>
            </Card>
          </div>

          {/* Section 2: Goals & Split Configuration */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-text-muted px-1 block">
              2. Goals &amp; Training Focus
            </span>

            <Card
              variant="interactive"
              padding="sm"
              onClick={() => setIsGoalSelectorOpen(true)}
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-2.5">
                <Target className="w-4 h-4 text-accent" />
                <div>
                  <span className="text-xs font-semibold text-text-primary block">Athlete Goal</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {goals && goals.length > 0 ? (
                      goals.map((g) => (
                        <Badge key={g} variant="brand" size="xs">
                          {ATHLETE_GOAL_CONFIGS[g]?.label || g}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-2xs text-text-muted font-mono">Not configured</span>
                    )}
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-text-muted" />
            </Card>
          </div>

          {/* Section 3: Cloud Immortality & Sync */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-text-muted px-1 block">
              3. Cloud Backup &amp; Sync
            </span>

            <Card variant="default" padding="sm" className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Database className="w-4 h-4 text-emerald-400" />
                  <div>
                    <span className="text-xs font-bold text-text-primary block">Automatic Cloud Backup</span>
                    <span className="text-2xs text-text-muted">
                      {syncStatus === 'synced' && `✓ Synced with Cloud ${lastSyncedAt ? `(${lastSyncedAt})` : ''}`}
                      {syncStatus === 'syncing' && 'Syncing changes with cloud...'}
                      {syncStatus === 'offline' && 'Offline Gym Mode • Changes queued'}
                      {syncStatus === 'error' && (syncError ? `Issue: ${syncError}` : 'Sync issue')}
                      {syncStatus === 'unconfigured' && 'Local only • Changes saved on this device'}
                    </span>
                  </div>
                </div>
                <Badge
                  variant={
                    syncStatus === 'synced'
                      ? 'success'
                      : syncStatus === 'syncing'
                      ? 'warning'
                      : syncStatus === 'error'
                      ? 'danger'
                      : 'neutral'
                  }
                  size="xs"
                >
                  {syncStatus === 'synced' ? 'SYNCED' : syncStatus === 'syncing' ? 'SYNCING' : syncStatus === 'offline' ? 'OFFLINE' : syncStatus === 'error' ? 'ERROR' : 'LOCAL ONLY'}
                </Badge>
              </div>

              {/* Account Link or Status */}
              <div className="p-2.5 rounded-xl bg-bg-secondary/60 border border-border/70 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="text-2xs font-semibold text-text-primary block truncate">
                    {user && !user.isAnonymous && user.email ? user.email : 'Guest / Device Session'}
                  </span>
                  <span className="text-3xs text-text-muted block">
                    {user && !user.isAnonymous
                      ? 'Cloud sync connected across devices'
                      : 'Link Google account to backup forever'}
                  </span>
                </div>
                <Button
                  variant={user && !user.isAnonymous ? 'secondary' : 'primary'}
                  size="sm"
                  onClick={() => setIsAuthModalOpen(true)}
                  className="shrink-0 text-2xs px-2.5 py-1"
                >
                  {user && !user.isAnonymous ? 'Account' : 'Link Google'}
                </Button>
              </div>

              {/* 1-Tap Sync Action Button (Visible only when cloud sync is configured) */}
              {syncStatus !== 'unconfigured' && (
                <div className="pt-0.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      syncNow();
                      toast.info('Syncing data with cloud...');
                    }}
                    disabled={syncStatus === 'syncing'}
                    leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />}
                    fullWidth
                  >
                    {syncStatus === 'syncing' ? 'Syncing...' : 'Sync Now'}
                  </Button>
                </div>
              )}
            </Card>
          </div>

          {/* Section 4: Account & Privacy */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-text-muted px-1 block">
              4. Account &amp; Privacy
            </span>

            <Card variant="default" padding="sm" className="divide-y divide-border/60">
              {/* Export my data */}
              <div className="py-2.5 flex items-center justify-between px-1">
                <div className="flex items-center gap-2.5">
                  <Download className="w-4 h-4 text-accent" />
                  <div>
                    <span className="text-xs font-semibold text-text-primary block">Export my data</span>
                    <span className="text-2xs text-text-muted">Download a backup before leaving.</span>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleDirectExport}
                  className="shrink-0 text-2xs px-2.5 py-1"
                >
                  Export
                </Button>
              </div>

              {/* Notification preferences */}
              <button
                type="button"
                onClick={() => setIsReminderCenterOpen(true)}
                className="w-full py-2.5 min-h-[44px] flex items-center justify-between text-left cursor-pointer hover:bg-bg-secondary/40 px-1 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Bell className="w-4 h-4 text-accent" />
                  <div>
                    <span className="text-xs font-semibold text-text-primary block">Notification preferences</span>
                    <span className="text-2xs text-text-muted">Manage reminders and reports.</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted" />
              </button>

              {/* Delete my account */}
              <div className="py-2.5 flex items-center justify-between px-1">
                <div className="flex items-center gap-2.5">
                  <Trash2 className="w-4 h-4 text-danger" />
                  <div>
                    <span className="text-xs font-semibold text-danger block">Delete my account</span>
                    <span className="text-2xs text-text-muted">Permanently delete your ASCEND account and associated data.</span>
                  </div>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    setDeleteConfirmText('');
                    setShowDeleteAccountModal(true);
                  }}
                  className="shrink-0 text-2xs px-2.5 py-1"
                >
                  Delete
                </Button>
              </div>
            </Card>
          </div>

          {/* Section 5: Data Vault & Manual Backup */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-text-muted px-1 block">
              5. Device Data Vault &amp; Manual JSON
            </span>

            <Card variant="default" padding="sm" className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <HardDrive className="w-4 h-4 text-accent" />
                  <div>
                    <span className="text-xs font-bold text-text-primary block">Device Storage Snapshot</span>
                    <span className="text-2xs text-text-muted">Export offline JSON backup anytime</span>
                  </div>
                </div>
                <Badge variant="neutral" size="xs">DEVICE FILE</Badge>
              </div>

              {/* 1-Tap Quick Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleDirectExport}
                  leftIcon={<Download className="w-3.5 h-3.5" />}
                  fullWidth
                >
                  Export (.json)
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => backupFileInputRef.current?.click()}
                  leftIcon={<Upload className="w-3.5 h-3.5" />}
                  fullWidth
                >
                  Restore Backup
                </Button>
                <input
                  ref={backupFileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleDirectRestoreFile}
                />
              </div>

              <button
                type="button"
                onClick={() => setIsDataVaultOpen(true)}
                className="w-full pt-2 min-h-[44px] border-t border-border/50 flex items-center justify-between text-left cursor-pointer hover:text-accent transition-colors text-2xs text-text-muted"
              >
                <span>Advanced Vault (CSV Importer, Factory Reset)</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </Card>
          </div>

          {/* Section 6: Legal Hub & Safety */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-text-muted px-1 block">
              6. Safety, Privacy &amp; Medical Terms
            </span>

            <Card
              variant="interactive"
              padding="sm"
              onClick={() => setIsLegalHubOpen(true)}
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-2.5">
                <Shield className="w-4 h-4 text-emerald-500" />
                <div>
                  <span className="text-xs font-bold text-text-primary block">Legal Hub &amp; Disclaimer</span>
                  <span className="text-2xs text-text-muted">Offline-first privacy policy &amp; physical safety guidelines</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-text-muted" />
            </Card>

            {/* Telemetry Consent Toggle */}
            <Card variant="default" padding="sm" className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Shield className={`w-4 h-4 ${telemetryConsent === 'accepted' ? 'text-accent' : 'text-text-muted'}`} />
                <div>
                  <span className="text-xs font-bold text-text-primary block">Anonymous Telemetry</span>
                  <span className="text-2xs text-text-muted">
                    {telemetryConsent === 'accepted'
                      ? 'Enabled • Crash & performance reports'
                      : 'Disabled • 100% offline privacy mode'}
                  </span>
                </div>
              </div>
              <Button
                variant={telemetryConsent === 'accepted' ? 'secondary' : 'primary'}
                size="sm"
                onClick={() => {
                  const next = telemetryConsent === 'accepted' ? 'declined' : 'accepted';
                  setTelemetryConsent(next);
                  if (next === 'accepted') {
                    toast.success('Telemetry enabled. Thank you for helping keep ASCEND stable!');
                  } else {
                    toast.info('Telemetry disabled. Pure offline privacy mode active.');
                  }
                }}
                className="shrink-0 text-2xs px-2.5 py-1"
              >
                {telemetryConsent === 'accepted' ? 'Disable' : 'Enable'}
              </Button>
            </Card>
          </div>

          {/* Section 7: Community & Support */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-text-muted px-1 block">
              7. Reviews &amp; Bug Reports
            </span>

            <Card
              variant="interactive"
              padding="sm"
              onClick={() => setIsFeedbackModalOpen(true)}
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-2.5">
                <MessageSquare className="w-4 h-4 text-accent" />
                <div>
                  <span className="text-xs font-bold text-text-primary block">Feedback, Reviews &amp; Bug Reports</span>
                  <span className="text-2xs text-text-muted">Report bugs, suggest features, or leave a review</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-text-muted" />
            </Card>
          </div>

          {/* Account Log Out */}
          <div className="pt-1">
            <Card variant="default" padding="sm" className="border-red-500/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center shrink-0">
                    <LogOut className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-text-primary block">Profile Session</span>
                    <span className="text-2xs text-text-muted">Exit active athlete profile</span>
                  </div>
                </div>
                {!showLogoutConfirm ? (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setShowLogoutConfirm(true)}
                  >
                    Log Out
                  </Button>
                ) : null}
              </div>

              {showLogoutConfirm && (
                <div className="pt-2.5 mt-2 border-t border-border/60 space-y-2 animate-fade-in">
                  <p className="text-2xs text-text-secondary leading-relaxed">
                    Log out of <strong>{profile?.name || 'Athlete'}</strong>? Your workouts and records remain safely stored on this device.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      fullWidth
                      onClick={() => setShowLogoutConfirm(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      fullWidth
                      onClick={handleConfirmLogout}
                      leftIcon={<LogOut className="w-3.5 h-3.5" />}
                    >
                      Confirm Log Out
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* Footer */}
          <div className="pt-1 text-center text-[10px] font-mono text-text-muted">
            ASCEND v2.0.0 &bull; Precision Training Instrument
          </div>
        </div>
      </div>

      {/* Sub Modals */}
      <GoalSelectorModal isOpen={isGoalSelectorOpen} onClose={() => setIsGoalSelectorOpen(false)} />
      <DataVaultModal isOpen={isDataVaultOpen} onClose={() => setIsDataVaultOpen(false)} />
      <LegalHubModal isOpen={isLegalHubOpen} onClose={() => setIsLegalHubOpen(false)} />
      <BodyMetricsModal isOpen={isBodyMetricsOpen} onClose={() => setIsBodyMetricsOpen(false)} />
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      <FeedbackModal isOpen={isFeedbackModalOpen} onClose={() => setIsFeedbackModalOpen(false)} />
      <ReminderCenterModal isOpen={isReminderCenterOpen} onClose={() => setIsReminderCenterOpen(false)} />

      {/* Account Deletion Confirmation Modal */}
      {showDeleteAccountModal && (
        <div
          className="modal-overlay z-60"
          onClick={() => !isDeletingAccount && setShowDeleteAccountModal(false)}
        >
          <div
            className="modal-content max-w-sm w-full p-5 space-y-4 border border-danger/40"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 text-danger border-b border-border/60 pb-3">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <div>
                <h3 className="font-bold text-sm text-text-primary font-display">
                  Delete ASCEND Account
                </h3>
                <p className="text-3xs text-danger font-mono font-semibold">
                  Irrevocable 0-Day Data Erasure
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-2xs font-mono text-text-secondary space-y-1.5">
              <p className="text-text-primary font-semibold">Warning: This action cannot be undone.</p>
              <ul className="list-disc list-inside space-y-1 text-3xs">
                <li>Purges your Supabase cloud user and sync credentials</li>
                <li>Permanently deletes all workouts, PRs, nutrition, and metric records</li>
                <li>Erases all local device and browser offline storage</li>
              </ul>
            </div>

            <div className="space-y-1.5">
              <p className="text-2xs text-text-muted">
                We strongly recommend downloading an offline backup first:
              </p>
              <Button
                variant="secondary"
                size="sm"
                fullWidth
                onClick={handleDirectExport}
                leftIcon={<Download className="w-3.5 h-3.5" />}
              >
                Export Data Backup (.json)
              </Button>
            </div>

            <div className="space-y-1 pt-1">
              <label className="block text-3xs font-mono uppercase font-bold text-text-muted">
                Type &quot;DELETE&quot; to confirm:
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                disabled={isDeletingAccount}
                className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-xs font-mono text-text-primary focus:outline-none focus:border-danger uppercase tracking-wider"
              />
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-border/60">
              <Button
                variant="ghost"
                size="sm"
                fullWidth
                disabled={isDeletingAccount}
                onClick={() => setShowDeleteAccountModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                fullWidth
                disabled={isDeletingAccount || deleteConfirmText.trim().toUpperCase() !== 'DELETE'}
                onClick={handleConfirmDeleteAccount}
                leftIcon={
                  isDeletingAccount ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )
                }
              >
                {isDeletingAccount ? 'Purging...' : 'Delete Forever'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
