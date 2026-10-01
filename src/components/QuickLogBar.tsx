'use client';

import React, { useState } from 'react';
import { Droplet, Sparkles, Scale, Plus, Check } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';
import { toLocalDateString } from '@/lib/habits';

interface QuickLogBarProps {
  onOpenWeightModal?: () => void;
  onOpenHydrationModal?: () => void;
  onOpenCreatineModal?: () => void;
}

export default function QuickLogBar({
  onOpenWeightModal,
  onOpenHydrationModal,
  onOpenCreatineModal,
}: QuickLogBarProps) {
  const toast = useToast();
  const todayStr = toLocalDateString(new Date());

  const logWater = useStore((state) => state.logWater);
  const waterLogs = useStore((state) => state.waterLogs || {});
  const creatineLogs = useStore((state) => state.creatineLogs || {});
  const toggleCreatine = useStore((state) => state.toggleCreatine);
  const logQuickProtein = useStore((state) => state.logQuickProtein);
  const creatineConfig = useStore((state) => state.creatineConfig);

  const waterToday = waterLogs[todayStr] || 0;
  const creatineTaken = !!creatineLogs[todayStr]?.taken;

  const [waterAnim, setWaterAnim] = useState<number | null>(null);
  const [proteinAnim, setProteinAnim] = useState(false);

  const triggerHaptic = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
  };

  const handleQuickWater = (amountMl: number) => {
    triggerHaptic();
    logWater(amountMl, todayStr);
    setWaterAnim(amountMl);
    setTimeout(() => setWaterAnim(null), 600);

    const newTotal = waterToday + amountMl;
    toast.success(
      `+${amountMl} ml logged (${(newTotal / 1000).toFixed(1)} L today)`,
      'Hydration Updated'
    );
  };

  const handleToggleCreatine = () => {
    triggerHaptic();
    toggleCreatine(todayStr);
    if (!creatineTaken) {
      toast.success(
        `${creatineConfig?.dailyTargetG || 5}g creatine logged!`,
        'Creatine Taken'
      );
    } else {
      toast.info('Creatine marked as not taken for today', 'Creatine Updated');
    }
  };

  const handleQuickProtein = () => {
    triggerHaptic();
    logQuickProtein(25, todayStr);
    setProteinAnim(true);
    setTimeout(() => setProteinAnim(false), 600);
    toast.success('+25g protein added to today’s meals', 'Protein Boost');
  };

  return (
    <div className="card p-3.5 bg-bg-card border border-border space-y-2.5">
      <div className="flex items-center justify-between px-1">
        <span className="text-label font-bold text-text-muted">
          Quick log
        </span>
        <button
          type="button"
          onClick={onOpenHydrationModal}
          className="text-label font-medium text-text-secondary hover:text-text-primary transition-colors"
        >
          Hydration target
        </button>
      </div>

      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {/* +250ml Water */}
        <button
          type="button"
          onClick={() => handleQuickWater(250)}
          className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-bg-secondary hover:bg-sky-500/10 hover:border-sky-500/30 border border-transparent transition-all active:scale-95 group ${
            waterAnim === 250 ? 'ring-2 ring-sky-500 bg-sky-500/15' : ''
          }`}
          title="Log 250 ml Water"
        >
          <Droplet className="w-4 h-4 text-sky-500 group-hover:scale-110 transition-transform" />
          <span className="text-[11px] font-bold text-text-primary mt-1 leading-none">
            +250
          </span>
          <span className="text-[9px] text-text-muted font-medium mt-0.5">ml</span>
        </button>

        {/* +500ml Water */}
        <button
          type="button"
          onClick={() => handleQuickWater(500)}
          className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-bg-secondary hover:bg-sky-500/10 hover:border-sky-500/30 border border-transparent transition-all active:scale-95 group ${
            waterAnim === 500 ? 'ring-2 ring-sky-500 bg-sky-500/15' : ''
          }`}
          title="Log 500 ml Water"
        >
          <Droplet className="w-4 h-4 text-sky-500 fill-sky-500/20 group-hover:scale-110 transition-transform" />
          <span className="text-[11px] font-bold text-text-primary mt-1 leading-none">
            +500
          </span>
          <span className="text-[9px] text-text-muted font-medium mt-0.5">ml</span>
        </button>

        {/* Creatine Toggle */}
        <button
          type="button"
          onClick={handleToggleCreatine}
          className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all active:scale-95 group border ${
            creatineTaken
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600'
              : 'bg-bg-secondary border-transparent text-text-primary hover:bg-emerald-500/10 hover:border-emerald-500/30'
          }`}
          title="Toggle Creatine Intake"
        >
          {creatineTaken ? (
            <Check className="w-4 h-4 text-emerald-600 stroke-[2.5]" />
          ) : (
            <Sparkles className="w-4 h-4 text-amber-500 group-hover:scale-110 transition-transform" />
          )}
          <span className="text-[11px] font-bold mt-1 leading-none">
            {creatineTaken ? '✓ Taken' : 'Creatine'}
          </span>
          <span className="text-[9px] text-text-muted font-medium mt-0.5">
            {creatineConfig?.dailyTargetG || 5}g
          </span>
        </button>

        {/* +25g Protein */}
        <button
          type="button"
          onClick={handleQuickProtein}
          className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-bg-secondary hover:bg-orange-500/10 hover:border-orange-500/30 border border-transparent transition-all active:scale-95 group ${
            proteinAnim ? 'ring-2 ring-accent bg-accent/15' : ''
          }`}
          title="Log 25g Protein"
        >
          <Plus className="w-4 h-4 text-accent group-hover:scale-110 transition-transform" />
          <span className="text-[11px] font-bold text-text-primary mt-1 leading-none">
            +25g
          </span>
          <span className="text-[9px] text-text-muted font-medium mt-0.5">Protein</span>
        </button>

        {/* Log Bodyweight */}
        <button
          type="button"
          onClick={onOpenWeightModal}
          className="flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-bg-secondary hover:bg-purple-500/10 hover:border-purple-500/30 border border-transparent transition-all active:scale-95 group"
          title="Log Bodyweight"
        >
          <Scale className="w-4 h-4 text-purple-500 group-hover:scale-110 transition-transform" />
          <span className="text-[11px] font-bold text-text-primary mt-1 leading-none">
            Weight
          </span>
          <span className="text-[9px] text-text-muted font-medium mt-0.5">Today</span>
        </button>
      </div>
    </div>
  );
}
