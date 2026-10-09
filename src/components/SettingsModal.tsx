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
  Droplet,
  Sparkles,
  ChevronRight,
  LogOut,
  Utensils,
  Download,
  Upload,
  RefreshCw,
  Database,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { exportFullBackupJSON, importFullBackupJSON } from '@/lib/storage';
import { useSupabaseSync } from '@/lib/supabase/useSupabaseSync';
import ThemeToggle from '@/components/ui/ThemeToggle';
import DataVaultModal from '@/components/DataVaultModal';
import LegalHubModal from '@/components/LegalHubModal';
import BodyMetricsModal from '@/components/BodyMetricsModal';
import HydrationModal from '@/components/HydrationModal';
import CreatineModal from '@/components/CreatineModal';
import GoalSelectorModal from '@/components/GoalSelectorModal';
import { AthleteGoal, ATHLETE_GOAL_CONFIGS, DietPreference } from '@/lib/types';
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

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const backupFileInputRef = useRef<HTMLInputElement>(null);

  // Cloud Sync (Supabase)
  const { status: syncStatus, lastSyncedAt, error: syncError, syncNow } = useSupabaseSync();

  // Sub-modal states
  const [isGoalSelectorOpen, setIsGoalSelectorOpen] = useState(false);
  const [isDataVaultOpen, setIsDataVaultOpen] = useState(false);
  const [isLegalHubOpen, setIsLegalHubOpen] = useState(false);
  const [isBodyMetricsOpen, setIsBodyMetricsOpen] = useState(false);
  const [isHydrationOpen, setIsHydrationOpen] = useState(false);
  const [isCreatineOpen, setIsCreatineOpen] = useState(false);

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

  const handleConfirmLogout = () => {
    setShowLogoutConfirm(false);
    onClose();
    logout({ clearLocalData: false });
    toast.info('Logged out. Switched to welcome screen.', 'Logged Out');
    if (typeof window !== 'undefined') {
      window.location.href = '/';
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
                System Preferences
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
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
              <div
                onClick={() => setIsBodyMetricsOpen(true)}
                className="py-2.5 flex items-center justify-between cursor-pointer hover:bg-bg-secondary/40 px-1 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Scale className="w-4 h-4 text-accent" />
                  <div>
                    <span className="text-xs font-semibold text-text-primary block">Body Metrics &amp; Height</span>
                    <span className="text-2xs text-text-muted font-mono">
                      {profile?.bodyweightKg ? `${Math.round(profile.bodyweightKg)} kg` : 'Unset'} • {profile?.heightCm ? `${profile.heightCm} cm` : 'Height unset'}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted" />
              </div>

              {/* Theme Toggle */}
              <div className="py-2.5 flex items-center justify-between px-1">
                <span className="text-xs font-semibold text-text-primary">Theme Appearance</span>
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

          {/* Section 3: Habit Targets */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-text-muted px-1 block">
              3. Habit &amp; Recovery Trackers
            </span>

            <Card variant="default" padding="sm" className="divide-y divide-border/60">
              <div
                onClick={() => setIsHydrationOpen(true)}
                className="py-2.5 flex items-center justify-between cursor-pointer hover:bg-bg-secondary/40 px-1 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Droplet className="w-4 h-4 text-sky-400" />
                  <div>
                    <span className="text-xs font-semibold text-text-primary block">Daily Hydration Target</span>
                    <span className="text-2xs text-text-muted">Target formula based on body mass</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted" />
              </div>

              <div
                onClick={() => setIsCreatineOpen(true)}
                className="py-2.5 flex items-center justify-between cursor-pointer hover:bg-bg-secondary/40 px-1 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <div>
                    <span className="text-xs font-semibold text-text-primary block">Creatine Monohydrate Tracker</span>
                    <span className="text-2xs text-text-muted">Daily intake &amp; tub supply counter</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted" />
              </div>
            </Card>
          </div>

          {/* Section 4: Cloud Immortality & Sync */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-text-muted px-1 block">
              4. Cloud Backup &amp; Sync
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

              {/* 1-Tap Sync Action Button */}
              <div className="pt-0.5">
                <Button
                  variant="primary"
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

              <div
                onClick={() => setIsDataVaultOpen(true)}
                className="pt-2 border-t border-border/50 flex items-center justify-between cursor-pointer hover:text-accent transition-colors text-2xs text-text-muted"
              >
                <span>Advanced Vault (CSV Importer, Factory Reset)</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </Card>
          </div>

          {/* Section 6: Legal Hub & Safety */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-text-muted px-1 block">
              6. Safety &amp; Medical Terms
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
      <HydrationModal isOpen={isHydrationOpen} onClose={() => setIsHydrationOpen(false)} />
      <CreatineModal isOpen={isCreatineOpen} onClose={() => setIsCreatineOpen(false)} />
    </>
  );
}
