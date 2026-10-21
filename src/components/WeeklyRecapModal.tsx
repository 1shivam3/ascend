"use client";

import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useModalA11y } from '@/lib/use-modal-a11y';
import { useStore } from '@/lib/store';
import { isSetCompleted } from '@/lib/types';
import { calculateDOTS, getDOTSClassification } from '@/lib/dots';
import { X, Share2, Download, MessageCircle, Trophy, Flame, Dumbbell, Sparkles } from 'lucide-react';
import { useToast } from './ui/Toast';
import { getWeekRange, parseLocalDate } from '@/lib/formatters';

interface WeeklyRecapModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function WeeklyRecapModal({ isOpen, onClose }: WeeklyRecapModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const { dialogProps } = useModalA11y(modalRef, isOpen, onClose);
  const profile = useStore((state) => state.profile);
  const workouts = useStore((state) => state.workouts);
  const prs = useStore((state) => state.prs);
  const toast = useToast();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Calculate past 7 days stats
  const weeklyStats = useMemo(() => {
    // Calendar week: Monday to Sunday (not a rolling 7-day window).
    const { start: weekStartStr, end: weekEndStr } = getWeekRange(new Date());
    const monday = parseLocalDate(weekStartStr);
    const sunday = parseLocalDate(weekEndStr);

    const thisWeekWorkouts = workouts.filter((w) => {
      const dStr = (w.date || '').split('T')[0];
      return dStr >= weekStartStr && dStr <= weekEndStr;
    });

    let totalVolume = 0;
    let totalSets = 0;

    for (const w of thisWeekWorkouts) {
      for (const ex of w.exercises) {
        for (const set of ex.sets) {
          if (!isSetCompleted(set)) continue;
          totalSets += 1;
          const weight = typeof set.weight === 'number' ? set.weight : parseFloat(String(set.weight)) || 0;
          const reps = typeof set.reps === 'number' ? set.reps : parseInt(String(set.reps), 10) || 0;
          totalVolume += weight * reps;
        }
      }
    }

    // Recent PRs this calendar week (Mon–Sun)
    const recentPRs = prs
      .filter((p) => {
        const dStr = (p.date || '').split('T')[0];
        return dStr >= weekStartStr && dStr <= weekEndStr && !p.isBaseline;
      })
      .slice(0, 3);

    // Big 3 lifts for DOTS
    const squatPR = prs.find((p) => p.exercise.toLowerCase().includes('squat'))?.weightKg || 0;
    const benchPR = prs.find((p) => p.exercise.toLowerCase().includes('bench'))?.weightKg || 0;
    const deadliftPR = prs.find((p) => p.exercise.toLowerCase().includes('deadlift'))?.weightKg || 0;
    const totalBig3 = squatPR + benchPR + deadliftPR;

    const dotsScore = profile?.bodyweightKg
      ? calculateDOTS(profile.bodyweightKg, totalBig3, profile.gender || 'male')
      : 0;

    const classification = getDOTSClassification(dotsScore);

    return {
      workoutsCount: thisWeekWorkouts.length,
      totalVolume: Math.round(totalVolume),
      totalSets,
      recentPRs,
      totalBig3: Math.round(totalBig3),
      dotsScore: Math.round(dotsScore),
      tier: classification.tier,
      dateRange: `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    };
  }, [workouts, prs, profile]);

  // ── Canvas helpers ─────────────────────────────────────────────────────
  function roundRectPath(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) {
    ctx.beginPath();
    if (typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(x, y, w, h, r);
    } else {
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
  }

  function drawText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    font: string,
    color: string,
    align: CanvasTextAlign = 'center',
    maxWidth?: number
  ) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x, y, maxWidth);
  }

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

    const ACCENT = '#f97316';
    const ACCENT_SOFT = 'rgba(249, 115, 22, 0.55)';
    const INK = '#fafafa';
    const MUTED = '#a1a1aa';
    const FAINT = '#71717a';

    // ── 1. Background: deep charcoal diagonal gradient + orange glow ──
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#17171c');
    bgGrad.addColorStop(0.45, '#0e0e12');
    bgGrad.addColorStop(1, '#070709');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Orange radial glow, top-right
    const glow = ctx.createRadialGradient(880, 180, 40, 880, 180, 620);
    glow.addColorStop(0, 'rgba(249, 115, 22, 0.28)');
    glow.addColorStop(0.55, 'rgba(249, 115, 22, 0.06)');
    glow.addColorStop(1, 'rgba(249, 115, 22, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    // Diagonal accent stripes (top-left, clipped)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, 560);
    ctx.clip();
    ctx.fillStyle = 'rgba(249, 115, 22, 0.10)';
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.translate(-140 + i * 90, 0);
      ctx.rotate(Math.PI / 7);
      ctx.fillRect(0, -300, 34, 900);
      ctx.restore();
    }
    ctx.restore();

    // Subtle dot texture on lower half
    ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
    for (let y = 700; y < height; y += 46) {
      for (let x = 60; x < width; x += 46) {
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ── 2. Header: brand + recap label ──
    drawText(ctx, 'ASCEND', width / 2, 150, '900 84px system-ui, sans-serif', INK);
    // Orange underline bar
    ctx.fillStyle = ACCENT;
    roundRectPath(ctx, width / 2 - 130, 172, 260, 8, 4);
    ctx.fill();
    drawText(ctx, 'WEEKLY TRAINING RECAP', width / 2, 226, '700 30px system-ui, sans-serif', MUTED);
    drawText(ctx, weeklyStats.dateRange.toUpperCase(), width / 2, 268, '600 24px ui-monospace, monospace', FAINT);

    // ── 3. Athlete name + tier pill ──
    const athleteName = (profile?.name || 'Athlete').toUpperCase();
    drawText(ctx, athleteName, width / 2, 348, '800 44px system-ui, sans-serif', INK, 'center', 900);
    const tierText = weeklyStats.dotsScore > 0
      ? `${weeklyStats.tier} · ${weeklyStats.dotsScore} DOTS`
      : weeklyStats.tier;
    ctx.font = '700 22px ui-monospace, monospace';
    const tierW = ctx.measureText(tierText).width + 56;
    ctx.fillStyle = 'rgba(249, 115, 22, 0.14)';
    ctx.strokeStyle = ACCENT_SOFT;
    ctx.lineWidth = 2;
    roundRectPath(ctx, width / 2 - tierW / 2, 372, tierW, 52, 26);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, tierText, width / 2, 407, '700 22px ui-monospace, monospace', ACCENT);

    // ── 4. Hero: giant total volume ──
    const unit = profile?.unit || 'kg';
    const heroValue = weeklyStats.totalVolume >= 1000
      ? `${(weeklyStats.totalVolume / 1000).toFixed(1)}t`
      : `${weeklyStats.totalVolume}`;
    drawText(ctx, heroValue, width / 2, 640, '900 200px system-ui, sans-serif', INK);
    drawText(ctx, `TOTAL VOLUME LIFTED · ${unit.toUpperCase()}`, width / 2, 690, '700 26px ui-monospace, monospace', MUTED);

    // ── 5. Stat tiles: sessions / sets / streak proxy (PR count) ──
    const tiles = [
      { value: `${weeklyStats.workoutsCount}`, label: weeklyStats.workoutsCount === 1 ? 'SESSION' : 'SESSIONS' },
      { value: `${weeklyStats.totalSets}`, label: weeklyStats.totalSets === 1 ? 'SET' : 'SETS' },
      { value: `${weeklyStats.recentPRs.length}`, label: weeklyStats.recentPRs.length === 1 ? 'NEW PR' : 'NEW PRS' },
    ];
    const tileW = 300;
    const tileH = 150;
    const gap = 30;
    const tilesTotalW = tiles.length * tileW + (tiles.length - 1) * gap;
    const tilesX0 = (width - tilesTotalW) / 2;
    const tilesY = 740;
    tiles.forEach((t, i) => {
      const x = tilesX0 + i * (tileW + gap);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
      ctx.lineWidth = 2;
      roundRectPath(ctx, x, tilesY, tileW, tileH, 22);
      ctx.fill();
      ctx.stroke();
      // Accent top notch
      ctx.fillStyle = ACCENT;
      roundRectPath(ctx, x + tileW / 2 - 40, tilesY, 80, 6, 3);
      ctx.fill();
      drawText(ctx, t.value, x + tileW / 2, tilesY + 88, '900 64px system-ui, sans-serif', INK);
      drawText(ctx, t.label, x + tileW / 2, tilesY + 122, '700 20px ui-monospace, monospace', MUTED);
    });

    // ── 6. Weekly highlights (PRs) ──
    const hlY = 990;
    drawText(ctx, 'WEEKLY HIGHLIGHTS', 90, hlY, '800 28px system-ui, sans-serif', INK, 'left');
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(90, hlY + 18);
    ctx.lineTo(width - 90, hlY + 18);
    ctx.stroke();

    if (weeklyStats.recentPRs.length > 0) {
      weeklyStats.recentPRs.forEach((pr, idx) => {
        const rowY = hlY + 70 + idx * 72;
        // Row card
        ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
        ctx.strokeStyle = 'rgba(249, 115, 22, 0.30)';
        ctx.lineWidth = 1.5;
        roundRectPath(ctx, 90, rowY - 42, width - 180, 64, 16);
        ctx.fill();
        ctx.stroke();
        // Gold dot
        ctx.fillStyle = ACCENT;
        ctx.beginPath();
        ctx.arc(128, rowY - 10, 10, 0, Math.PI * 2);
        ctx.fill();
        drawText(ctx, pr.exercise, 156, rowY - 2, '700 26px system-ui, sans-serif', INK, 'left', 560);
        drawText(
          ctx,
          `${profile?.unit === 'lbs' ? pr.weightLbs : pr.weightKg} ${unit} × ${pr.reps}`,
          width - 120,
          rowY - 2,
          '800 26px ui-monospace, monospace',
          ACCENT,
          'right'
        );
      });
    } else {
      drawText(
        ctx,
        '"Consistency builds the foundation. Keep stacking sets."',
        width / 2,
        hlY + 90,
        'italic 400 26px system-ui, sans-serif',
        MUTED
      );
    }

    // ── 7. Footer: brand seal ──
    ctx.fillStyle = ACCENT;
    roundRectPath(ctx, width / 2 - 200, 1236, 400, 4, 2);
    ctx.fill();
    drawText(ctx, 'TRACKED WITH ASCEND', width / 2, 1280, '800 24px ui-monospace, monospace', 'rgba(249, 115, 22, 0.95)');
    drawText(ctx, 'ascendtonext.vercel.app', width / 2, 1312, '500 20px ui-monospace, monospace', FAINT);

    // Convert to Image URL
    try {
      const url = canvas.toDataURL('image/png');
      setImagePreviewUrl(url);
    } catch (e) {
      console.error(e);
    }
    setIsGenerating(false);
  }, [isOpen, weeklyStats, profile]);

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
      `*ASCEND — Weekly Training Recap*\n` +
      `• *Total Volume Lifted*: ${weeklyStats.totalVolume.toLocaleString()} ${profile?.unit || 'kg'}\n` +
      `• *Workouts Completed*: ${weeklyStats.workoutsCount} ${weeklyStats.workoutsCount === 1 ? 'session' : 'sessions'} (${weeklyStats.totalSets} ${weeklyStats.totalSets === 1 ? 'set' : 'sets'})\n` +
      (weeklyStats.dotsScore > 0 ? `• *DOTS Score*: ${weeklyStats.dotsScore} (${weeklyStats.tier})\n` : '') +
      `\nTracked with ASCEND Precision Training:\nhttps://ascendtonext.vercel.app/`;

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
    <div ref={modalRef} {...dialogProps} className="modal-overlay" onClick={onClose}>
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
            className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
          aria-label="Close"
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
