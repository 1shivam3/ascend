"use client";

import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { calculateDOTS, getDOTSClassification } from '@/lib/dots';
import { X, Share2, Download, MessageCircle, Trophy, Flame, Dumbbell, Sparkles } from 'lucide-react';
import { useToast } from './ui/Toast';

interface WeeklyRecapModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function WeeklyRecapModal({ isOpen, onClose }: WeeklyRecapModalProps) {
  const profile = useStore((state) => state.profile);
  const workouts = useStore((state) => state.workouts);
  const prs = useStore((state) => state.prs);
  const toast = useToast();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Calculate past 7 days stats
  const weeklyStats = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    const pastWeekWorkouts = workouts.filter((w) => w.date >= sevenDaysAgoStr);

    let totalVolume = 0;
    let totalSets = 0;

    for (const w of pastWeekWorkouts) {
      for (const ex of w.exercises) {
        for (const set of ex.sets) {
          totalSets += 1;
          const weight = typeof set.weight === 'number' ? set.weight : parseFloat(String(set.weight)) || 0;
          const reps = typeof set.reps === 'number' ? set.reps : parseInt(String(set.reps), 10) || 0;
          totalVolume += weight * reps;
        }
      }
    }

    // Recent PRs in past 7 days
    const recentPRs = prs
      .filter((p) => p.date >= sevenDaysAgoStr && !p.isBaseline)
      .slice(0, 3);

    // Big 3 lifts for DOTS
    const squatPR = prs.find((p) => p.exercise.toLowerCase().includes('squat'))?.weightKg || 0;
    const benchPR = prs.find((p) => p.exercise.toLowerCase().includes('bench'))?.weightKg || 0;
    const deadliftPR = prs.find((p) => p.exercise.toLowerCase().includes('deadlift'))?.weightKg || 0;
    const totalBig3 = squatPR + benchPR + deadliftPR;

    const dotsScore = profile?.bodyweightKg
      ? calculateDOTS(totalBig3, profile.bodyweightKg, profile.gender || 'male')
      : 0;

    const classification = getDOTSClassification(dotsScore);

    return {
      workoutsCount: pastWeekWorkouts.length,
      totalVolume: Math.round(totalVolume),
      totalSets,
      recentPRs,
      totalBig3: Math.round(totalBig3),
      dotsScore: Math.round(dotsScore),
      tier: classification.tier,
      dateRange: `${sevenDaysAgo.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    };
  }, [workouts, prs, profile]);

  // Generate the Canvas graphic (1080x1350 vertical high-res card)
  useEffect(() => {
    if (!isOpen) return;

    setIsGenerating(true);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = 1080;
    const height = 1350;
    canvas.width = width;
    canvas.height = height;

    // 1. Background (Dark Onyx with subtle gold radial glow)
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    const glowGradient = ctx.createRadialGradient(540, 400, 100, 540, 500, 700);
    glowGradient.addColorStop(0, 'rgba(229, 192, 123, 0.12)');
    glowGradient.addColorStop(0.6, 'rgba(229, 192, 123, 0.02)');
    glowGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glowGradient;
    ctx.fillRect(0, 0, width, height);

    // 2. Outer Border Frame
    ctx.strokeStyle = '#27272a';
    ctx.lineWidth = 3;
    ctx.strokeRect(40, 40, width - 80, height - 80);

    ctx.strokeStyle = 'rgba(229, 192, 123, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(48, 48, width - 96, height - 96);

    // 3. Brand Header
    ctx.fillStyle = '#e5c07b';
    ctx.font = '900 48px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ASCEND', width / 2, 130);

    ctx.fillStyle = '#a1a1aa';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('WEEKLY TRAINING RECAP', width / 2, 175);

    ctx.fillStyle = '#71717a';
    ctx.font = '18px monospace';
    ctx.fillText(weeklyStats.dateRange.toUpperCase(), width / 2, 210);

    // Separator line
    ctx.strokeStyle = 'rgba(229, 192, 123, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(140, 240);
    ctx.lineTo(width - 140, 240);
    ctx.stroke();

    // 4. Athlete Name & Bodyweight
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 36px sans-serif';
    ctx.fillText(profile?.name || 'Iron Athlete', width / 2, 305);

    if (profile?.bodyweightKg) {
      ctx.fillStyle = '#e5c07b';
      ctx.font = 'bold 20px monospace';
      ctx.fillText(`${profile.bodyweightKg} kg Bodyweight • ${weeklyStats.tier}`, width / 2, 345);
    }

    // 5. Hero Stats Grid (2 x 2 cards)
    const cardY = 410;
    const cardW = 440;
    const cardH = 170;

    // Card 1: Total Tonnage / Volume
    drawMetricCard(
      ctx,
      80,
      cardY,
      cardW,
      cardH,
      `${weeklyStats.totalVolume.toLocaleString()} ${profile?.unit || 'kg'}`,
      'TOTAL VOLUME LIFTED',
      '#22c55e'
    );

    // Card 2: Workouts Completed
    drawMetricCard(
      ctx,
      560,
      cardY,
      cardW,
      cardH,
      `${weeklyStats.workoutsCount} SESSIONS`,
      'WORKOUTS LOGGED',
      '#e5c07b'
    );

    // Card 3: Total Sets
    drawMetricCard(
      ctx,
      80,
      cardY + 200,
      cardW,
      cardH,
      `${weeklyStats.totalSets} SETS`,
      'INTENSITY & VOLUME',
      '#38bdf8'
    );

    // Card 4: DOTS / Big 3 Total
    drawMetricCard(
      ctx,
      560,
      cardY + 200,
      cardW,
      cardH,
      weeklyStats.dotsScore > 0 ? `${weeklyStats.dotsScore} DOTS` : `${weeklyStats.totalBig3} kg`,
      weeklyStats.dotsScore > 0 ? 'STRENGTH CLASSIFICATION' : 'BIG 3 TOTAL',
      '#f59e0b'
    );

    // 6. Highlights / PRs Section
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('WEEKLY HIGHLIGHTS', 90, 860);

    ctx.strokeStyle = '#3f3f46';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(90, 880);
    ctx.lineTo(width - 90, 880);
    ctx.stroke();

    if (weeklyStats.recentPRs.length > 0) {
      weeklyStats.recentPRs.forEach((pr, idx) => {
        const rowY = 930 + idx * 75;

        // PR Pill Background
        ctx.fillStyle = '#18181b';
        ctx.fillRect(90, rowY - 35, width - 180, 60);
        ctx.strokeStyle = 'rgba(229, 192, 123, 0.3)';
        ctx.strokeRect(90, rowY - 35, width - 180, 60);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(pr.exercise, 120, rowY + 3);

        ctx.fillStyle = '#e5c07b';
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${profile?.unit === 'lbs' ? pr.weightLbs : pr.weightKg} ${profile?.unit || 'kg'} × ${pr.reps}`, width - 120, rowY + 3);
      });
    } else {
      ctx.fillStyle = '#a1a1aa';
      ctx.font = 'italic 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('"Consistency builds the foundation. Keep stacking sets."', width / 2, 970);
    }

    // 7. Footer Brand Seal
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(229, 192, 123, 0.8)';
    ctx.font = 'bold 20px monospace';
    ctx.fillText('TRACKED WITH ASCEND • 100% OFFLINE POWERLIFTING SANCTUARY', width / 2, 1230);

    ctx.fillStyle = '#71717a';
    ctx.font = '16px monospace';
    ctx.fillText('ascendtonext.vercel.app', width / 2, 1265);

    // Convert to Image URL
    try {
      const url = canvas.toDataURL('image/png');
      setImagePreviewUrl(url);
    } catch (e) {
      console.error(e);
    }
    setIsGenerating(false);
  }, [isOpen, weeklyStats, profile]);

  function drawMetricCard(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    value: string,
    label: string,
    accentColor: string
  ) {
    // Card background
    ctx.fillStyle = '#121215';
    ctx.fillRect(x, y, w, h);

    // Border
    ctx.strokeStyle = '#27272a';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    // Accent line top
    ctx.fillStyle = accentColor;
    ctx.fillRect(x, y, w, 4);

    // Value
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 36px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(value, x + w / 2, y + 80);

    // Label
    ctx.fillStyle = '#a1a1aa';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(label, x + w / 2, y + 125);
  }

  const handleDownload = () => {
    if (!imagePreviewUrl) return;
    const a = document.createElement('a');
    a.href = imagePreviewUrl;
    a.download = `ASCEND_Weekly_Recap_${new Date().toISOString().split('T')[0]}.png`;
    a.click();
    toast.success('Weekly recap image downloaded!', 'Card Saved');
  };

  const handleShareWhatsApp = async () => {
    const text =
      `🔥 *My Weekly Powerlifting Recap on ASCEND:*\n` +
      `• *Total Volume Lifted*: ${weeklyStats.totalVolume.toLocaleString()} ${profile?.unit || 'kg'}\n` +
      `• *Workouts Completed*: ${weeklyStats.workoutsCount} sessions (${weeklyStats.totalSets} sets)\n` +
      (weeklyStats.dotsScore > 0 ? `• *DOTS Score*: ${weeklyStats.dotsScore} (${weeklyStats.tier})\n` : '') +
      `\n📲 Tracked with ASCEND (100% Offline & Free):\nhttps://ascendtonext.vercel.app/`;

    // Try Web Share API with image file if supported
    if (typeof navigator !== 'undefined' && (navigator as any).share && canvasRef.current) {
      try {
        canvasRef.current.toBlob(async (blob) => {
          if (blob && (navigator as any).canShare) {
            const file = new File([blob], 'ascend-weekly-recap.png', { type: 'image/png' });
            if ((navigator as any).canShare({ files: [file] })) {
              await (navigator as any).share({
                title: 'ASCEND Weekly Training Recap',
                text,
                files: [file],
              });
              toast.success('Shared successfully!', 'Recap Shared');
              return;
            }
          }
          // Fallback if files cannot be shared
          window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
        }, 'image/png');
        return;
      } catch {
        // Fallback below
      }
    }

    // Direct WhatsApp Web/App fallback
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content max-w-sm w-full p-4 space-y-3.5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/70 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center text-accent">
              <Trophy className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-text-primary leading-tight">
                Weekly Training Card
              </h3>
              <p className="text-3xs text-text-muted font-mono">WhatsApp &amp; Instagram Ready</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hidden Canvas used for high-res rendering */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Card Live Preview */}
        <div className="rounded-xl overflow-hidden border border-border/80 shadow-md bg-black relative max-h-[380px] flex items-center justify-center">
          {imagePreviewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imagePreviewUrl}
              alt="Weekly Recap Preview"
              className="w-full h-auto max-h-[380px] object-contain block"
            />
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-text-muted text-xs font-mono gap-2">
              <Sparkles className="w-5 h-5 text-accent animate-spin" />
              <span>Generating recap card...</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={handleShareWhatsApp}
            className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Share WhatsApp</span>
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="py-2.5 rounded-xl bg-bg-secondary hover:bg-accent/15 border border-border hover:border-accent/50 text-text-primary hover:text-accent font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95"
          >
            <Download className="w-4 h-4 text-accent" />
            <span>Save Image</span>
          </button>
        </div>
      </div>
    </div>
  );
}
