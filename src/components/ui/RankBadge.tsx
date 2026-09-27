import React from 'react';
import { ExerciseRank } from '@/lib/types';
import { 
  CircleDot, 
  Shield, 
  Layers, 
  Zap, 
  Crown, 
  Star, 
  Sparkles 
} from 'lucide-react';

interface RankBadgeProps {
  rank: ExerciseRank;
  level?: number;
  size?: 'sm' | 'md' | 'lg';
  showLevel?: boolean;
}

export default function RankBadge({
  rank,
  level,
  size = 'md',
  showLevel = false
}: RankBadgeProps) {
  const getBadgeConfig = () => {
    switch (rank) {
      case 'FOUNDATION':
        return {
          icon: CircleDot,
          containerClass: 'border-border bg-bg-secondary text-text-muted rounded-full',
          label: 'FOUNDATION',
          accentBorder: 'border-border'
        };
      case 'TRAINED':
        return {
          icon: Shield,
          containerClass: 'border-border-hover bg-bg-elevated text-text-secondary rounded-lg',
          label: 'TRAINED',
          accentBorder: 'border-border-hover'
        };
      case 'SKILLED':
        return {
          icon: Layers,
          containerClass: 'border-info/40 bg-info/10 text-info rounded-md',
          label: 'SKILLED',
          accentBorder: 'border-info/30 ring-1 ring-info/10'
        };
      case 'ADVANCED':
        return {
          icon: Zap,
          containerClass: 'border-warning/50 bg-warning/10 text-warning rounded-lg',
          label: 'ADVANCED',
          accentBorder: 'border-warning/40 ring-1 ring-warning/20'
        };
      case 'ELITE':
        return {
          icon: Crown,
          containerClass: 'border-accent/70 bg-accent/15 text-accent rounded-lg shadow-sm',
          label: 'ELITE',
          accentBorder: 'border-accent/60 ring-2 ring-accent/20'
        };
      case 'MASTER':
        return {
          icon: Star,
          containerClass: 'border-accent bg-accent/20 text-accent rounded-md shadow-md ring-2 ring-accent/30',
          label: 'MASTER',
          accentBorder: 'border-accent ring-2 ring-accent/40 shadow-inner'
        };
      case 'GRANDMASTER':
        return {
          icon: Sparkles,
          containerClass: 'border-accent bg-gradient-to-r from-accent/20 via-warning/25 to-accent/20 text-accent rounded-md shadow-lg ring-2 ring-accent/50 animate-pulse',
          label: 'GRANDMASTER',
          accentBorder: 'border-accent ring-2 ring-accent/60 shadow-[0_0_12px_rgba(229,192,123,0.25)]'
        };
    }
  };

  const config = getBadgeConfig();
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
    lg: 'text-sm px-3 py-1.5 gap-2'
  }[size];

  const iconSizes = {
    sm: 11,
    md: 13,
    lg: 15
  }[size];

  return (
    <div className={`inline-flex items-center font-mono font-bold tracking-wider uppercase border transition-all ${config.containerClass} ${sizeClasses}`}>
      <Icon size={iconSizes} strokeWidth={2.2} />
      <span>{config.label}</span>
      {showLevel && level !== undefined && (
        <span className="opacity-90 pl-1 border-l border-current/20 font-sans">
          LV.{level}
        </span>
      )}
    </div>
  );
}
