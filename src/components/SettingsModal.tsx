'use client';

import React, { useState } from 'react';
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
  FileSpreadsheet,
  Download,
  Upload,
  AlertTriangle,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import ThemeToggle from '@/components/ui/ThemeToggle';
import DataVaultModal from '@/components/DataVaultModal';
import LegalHubModal from '@/components/LegalHubModal';
import BodyMetricsModal from '@/components/BodyMetricsModal';
import HydrationModal from '@/components/HydrationModal';
import CreatineModal from '@/components/CreatineModal';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const profile = useStore((state) => state.profile);
  const setProfile = useStore((state) => state.setProfile);
  const customGeminiKey = useStore((state) => state.customGeminiKey);
  const setCustomGeminiKey = useStore((state) => state.setCustomGeminiKey);
  const toast = useToast();

  const [activeSection, setActiveSection] = useState<'main' | 'ai'>('main');
  const [apiKeyInput, setApiKeyInput] = useState(customGeminiKey || '');

  // Sub-modal states
  const [isDataVaultOpen, setIsDataVaultOpen] = useState(false);
  const [isLegalHubOpen, setIsLegalHubOpen] = useState(false);
  const [isBodyMetricsOpen, setIsBodyMetricsOpen] = useState(false);
  const [isHydrationOpen, setIsHydrationOpen] = useState(false);
  const [isCreatineOpen, setIsCreatineOpen] = useState(false);

  if (!isOpen) return null;

  const handleSaveApiKey = () => {
    const trimmed = apiKeyInput.trim();
    setCustomGeminiKey(trimmed);
    if (trimmed) {
      toast.success('Custom Gemini API key saved!', 'API Key Configured');
    } else {
      toast.info('Cleared custom Gemini API key. App uses offline fallback.', 'Key Cleared');
    }
  };

  const handleToggleUnit = () => {
    if (!profile) return;
    const nextUnit = profile.unit === 'kg' ? 'lbs' : 'kg';
    setProfile({
      ...profile,
      unit: nextUnit,
    });
    toast.info(`Preferred unit switched to ${nextUnit.toUpperCase()}`, 'Unit Updated');
  };

  return (
    <>
      <div className="modal-overlay z-50" onClick={onClose}>
        <div
          className="modal-content max-w-md w-full max-h-[90vh] overflow-y-auto p-4 sm:p-5 space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-accent/15 flex items-center justify-center text-accent">
                <Settings className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-text-primary leading-tight">Settings</h2>
                <p className="text-2xs text-text-muted font-mono">App Preferences &amp; Data Control</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Section 1: Profile & Preferences */}
          <div className="space-y-2">
            <span className="text-label font-bold text-text-muted px-1">
              Profile &amp; units
            </span>

            <div className="card p-3 divide-y divide-border/60 bg-bg-card border border-border">
              {/* Unit Toggle */}
              <div className="py-2 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-text-primary block">Weight Unit</span>
                  <span className="text-2xs text-text-muted">Display all lifts &amp; bodyweight in {profile?.unit?.toUpperCase()}</span>
                </div>
                <button
                  type="button"
                  onClick={handleToggleUnit}
                  className="px-3 py-1 rounded-lg bg-bg-secondary border border-border text-xs font-mono font-bold text-accent hover:border-accent transition-all"
                >
                  {profile?.unit?.toUpperCase() || 'KG'}
                </button>
              </div>

              {/* Bodyweight & Height */}
              <div
                onClick={() => setIsBodyMetricsOpen(true)}
                className="py-2.5 flex items-center justify-between cursor-pointer hover:bg-bg-secondary/40 px-1 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Scale className="w-4 h-4 text-purple-400" />
                  <div>
                    <span className="text-xs font-semibold text-text-primary block">Body Metrics</span>
                    <span className="text-2xs text-text-muted font-mono">
                      {profile?.bodyweightKg ? `${Math.round(profile.bodyweightKg)} kg` : 'Not set'} • {profile?.gender || 'male'}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted" />
              </div>

              {/* Theme Toggle */}
              <div className="py-2.5 flex items-center justify-between px-1">
                <span className="text-xs font-semibold text-text-primary">Appearance</span>
                <ThemeToggle />
              </div>
            </div>
          </div>

          {/* Section 2: Habit Targets */}
          <div className="space-y-2">
            <span className="text-label font-bold text-text-muted px-1">
              Habit targets
            </span>

            <div className="card p-3 divide-y divide-border/60 bg-bg-card border border-border">
              <div
                onClick={() => setIsHydrationOpen(true)}
                className="py-2.5 flex items-center justify-between cursor-pointer hover:bg-bg-secondary/40 px-1 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Droplet className="w-4 h-4 text-sky-400" />
                  <div>
                    <span className="text-xs font-semibold text-text-primary block">Daily Hydration</span>
                    <span className="text-2xs text-text-muted">Target intake &amp; automated formula</span>
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
                    <span className="text-xs font-semibold text-text-primary block">Creatine Tracker</span>
                    <span className="text-2xs text-text-muted">Daily dosage &amp; tub supply tracker</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted" />
              </div>
            </div>
          </div>

          {/* Section 3: AI Configuration */}
          <div className="space-y-2">
            <span className="text-label font-bold text-text-muted px-1">
              AI intelligence
            </span>

            <div className="card p-3.5 bg-bg-card border border-border space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-accent" />
                  <span className="text-xs font-bold text-text-primary">Google Gemini API Key</span>
                </div>
                {customGeminiKey ? (
                  <span className="text-3xs font-mono font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                    Active
                  </span>
                ) : (
                  <span className="text-3xs font-mono text-text-muted bg-bg-secondary px-2 py-0.5 rounded-full">
                    Cloud / Offline
                  </span>
                )}
              </div>

              <p className="text-2xs text-text-secondary leading-relaxed">
                ASCEND operates completely offline with built-in coach logic. Enter your personal Gemini API key for unlimited AI scans and coaching insights.
              </p>

              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="AIzaSy... (leave blank for default)"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  className="flex-1 bg-bg-secondary border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary font-mono focus:border-accent outline-none"
                />
                <button
                  type="button"
                  onClick={handleSaveApiKey}
                  className="btn-primary py-1.5 px-3 text-xs font-semibold"
                >
                  Save
                </button>
              </div>

              <p className="text-[11px] text-text-muted flex items-center gap-1.5 pt-0.5">
                <Shield className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>Your API key stays on this device in local storage and is never sent to our servers.</span>
              </p>
            </div>
          </div>

          {/* Section 4: Data & Backups */}
          <div className="space-y-2">
            <span className="text-label font-bold text-text-muted px-1">
              Data vault &amp; backup
            </span>

            <div
              onClick={() => setIsDataVaultOpen(true)}
              className="card p-3.5 bg-bg-card border border-border hover:border-accent/40 cursor-pointer transition-colors flex items-center justify-between shadow-xs"
            >
              <div className="flex items-center gap-2.5">
                <HardDrive className="w-4 h-4 text-accent" />
                <div>
                  <span className="text-xs font-bold text-text-primary block">Data Vault &amp; History</span>
                  <span className="text-2xs text-text-muted">Export JSON backup, CSV workout import, reset data</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-text-muted" />
            </div>
          </div>

          {/* Section 5: Legal & Privacy */}
          <div className="space-y-2">
            <span className="text-label font-bold text-text-muted px-1">
              Safety &amp; privacy
            </span>

            <div
              onClick={() => setIsLegalHubOpen(true)}
              className="card p-3.5 bg-bg-card border border-border hover:border-accent/40 cursor-pointer transition-colors flex items-center justify-between shadow-xs"
            >
              <div className="flex items-center gap-2.5">
                <Shield className="w-4 h-4 text-emerald-500" />
                <div>
                  <span className="text-xs font-bold text-text-primary block">Legal Hub &amp; Medical Disclaimer</span>
                  <span className="text-2xs text-text-muted">100% Private Local Storage • Medical Safety Terms</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-text-muted" />
            </div>
          </div>

          {/* Version Footer */}
          <div className="pt-2 text-center text-3xs font-mono text-text-muted">
            ASCEND v2.0.0 • Offline-First Training Architecture
          </div>
        </div>
      </div>

      {/* Sub Modals */}
      <DataVaultModal isOpen={isDataVaultOpen} onClose={() => setIsDataVaultOpen(false)} />
      <LegalHubModal isOpen={isLegalHubOpen} onClose={() => setIsLegalHubOpen(false)} />
      <BodyMetricsModal isOpen={isBodyMetricsOpen} onClose={() => setIsBodyMetricsOpen(false)} />
      <HydrationModal isOpen={isHydrationOpen} onClose={() => setIsHydrationOpen(false)} />
      <CreatineModal isOpen={isCreatineOpen} onClose={() => setIsCreatineOpen(false)} />
    </>
  );
}
