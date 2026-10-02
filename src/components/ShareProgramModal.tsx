"use client";

import React, { useState, useEffect } from 'react';
import { PlannedWorkout } from '@/lib/types';
import { useStore } from '@/lib/store';
import {
  encodeProgramForSharing,
  generateProgramQRCode,
  formatWhatsAppShareText,
} from '@/lib/program-sharing';
import { X, Copy, Check, QrCode, Share2, MessageCircle, ExternalLink } from 'lucide-react';
import { useToast } from './ui/Toast';

interface ShareProgramModalProps {
  plan: PlannedWorkout | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function ShareProgramModal({ plan, isOpen, onClose }: ShareProgramModalProps) {
  const profile = useStore((state) => state.profile);
  const toast = useToast();

  const [coachName, setCoachName] = useState(profile?.name || '');
  const [shareUrl, setShareUrl] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'whatsapp' | 'qrcode'>('whatsapp');

  useEffect(() => {
    if (!plan || !isOpen) return;

    try {
      const hash = encodeProgramForSharing(plan, coachName.trim() || undefined);
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://ascendtonext.vercel.app';
      const fullUrl = `${origin}/#plan=${hash}`;
      setShareUrl(fullUrl);

      // Generate QR Code
      generateProgramQRCode(fullUrl).then(setQrCodeDataUrl).catch(console.error);
    } catch (err) {
      console.error('Failed to generate share link:', err);
    }
  }, [plan, isOpen, coachName]);

  if (!isOpen || !plan) return null;

  const handleCopyLink = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        toast.success('Program link copied to clipboard!', 'Link Copied');
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      toast.error('Could not copy link to clipboard.', 'Copy Failed');
    }
  };

  const handleOpenWhatsApp = () => {
    const text = formatWhatsAppShareText(plan, shareUrl, coachName.trim() || undefined);
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content max-w-md w-full p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/70 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center text-accent">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-text-primary leading-tight">
                Share Workout Routine
              </h3>
              <p className="text-2xs text-text-muted font-mono">1-Tap WhatsApp link &amp; QR Code</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Program Preview Card */}
        <div className="p-3 rounded-xl bg-bg-secondary border border-border/70 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-text-primary">{plan.name}</span>
            <span className="text-3xs font-mono font-bold text-accent bg-accent/15 px-2 py-0.5 rounded-md">
              {plan.exercises.length} EXERCISES
            </span>
          </div>
          <div className="text-2xs text-text-secondary font-mono space-y-0.5 max-h-24 overflow-y-auto pr-1">
            {plan.exercises.map((ex, i) => (
              <div key={i} className="truncate">
                • {ex.name}: {ex.targetSets} × {ex.targetReps}
                {ex.targetWeight ? ` @ ${ex.targetWeight}${ex.targetUnit || 'kg'}` : ''}
              </div>
            ))}
          </div>
        </div>

        {/* Coach / Sender Name Input */}
        <div>
          <label className="text-2xs font-bold text-text-muted uppercase block mb-1 font-mono">
            Shared By (Coach or Athlete Name)
          </label>
          <input
            type="text"
            value={coachName}
            onChange={(e) => setCoachName(e.target.value)}
            placeholder="e.g. Coach Shivam"
            className="w-full text-xs font-semibold px-3 py-2 rounded-lg bg-bg-secondary border border-border text-text-primary outline-none focus:border-accent"
          />
        </div>

        {/* Tab Selection: WhatsApp vs QR Code */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-bg-secondary rounded-xl border border-border/60">
          <button
            type="button"
            onClick={() => setActiveTab('whatsapp')}
            className={`py-1.5 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'whatsapp'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-xs'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>WhatsApp &amp; Link</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('qrcode')}
            className={`py-1.5 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'qrcode'
                ? 'bg-accent/20 text-accent border border-accent/40 shadow-xs'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Scan QR Code</span>
          </button>
        </div>

        {/* Tab 1: WhatsApp & Direct Link */}
        {activeTab === 'whatsapp' ? (
          <div className="space-y-3 pt-1">
            <button
              type="button"
              onClick={handleOpenWhatsApp}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.98]"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Send via WhatsApp</span>
            </button>

            <div className="space-y-1.5">
              <label className="text-3xs font-mono uppercase font-bold text-text-muted block">
                Direct Shareable Link
              </label>
              <div className="flex items-center gap-1.5 bg-bg-secondary p-1.5 rounded-xl border border-border/70">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="bg-transparent text-3xs font-mono text-text-secondary flex-1 px-1 outline-none truncate"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-2.5 py-1 rounded-lg bg-bg-card hover:bg-accent/20 text-text-primary hover:text-accent text-2xs font-bold font-mono flex items-center gap-1 transition-all border border-border/50 shrink-0"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Tab 2: QR Code for in-gym scanning */
          <div className="flex flex-col items-center justify-center py-2 space-y-3">
            {qrCodeDataUrl ? (
              <div className="p-3 bg-white rounded-2xl shadow-md border-4 border-accent/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrCodeDataUrl}
                  alt="Program QR Code"
                  className="w-56 h-56 rounded-lg block"
                />
              </div>
            ) : (
              <div className="w-56 h-56 rounded-2xl bg-bg-secondary animate-pulse flex items-center justify-center text-text-muted text-xs font-mono">
                Generating QR Code...
              </div>
            )}
            <p className="text-3xs text-text-muted text-center font-mono max-w-xs">
              Open your phone camera to scan. The client imports this full routine instantly without needing an account.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="pt-2 border-t border-border/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary py-1.5 px-4 text-xs font-mono"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
