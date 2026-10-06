'use client';

import React from 'react';
import {
  Clock,
  CheckCircle2,
  Droplet,
  Sparkles,
  Dumbbell,
  Scale,
  UtensilsCrossed,
  Award,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { toLocalDateString, buildDailyTimeline } from '@/lib/habits';

export default function DailyTimelineCard() {
  const todayStr = toLocalDateString(new Date());

  const profile = useStore((state) => state.profile);
  const workouts = useStore((state) => state.workouts);
  const waterBatches = useStore((state) => (state.waterBatches || {})[todayStr] || []);
  const creatineLogs = useStore((state) => state.creatineLogs || {});
  const meals = useStore((state) => state.meals || []);
  const bodyMetrics = useStore((state) => state.bodyMetrics || []);

  const todayWeight = bodyMetrics.find((b) => b.date && b.date.startsWith(todayStr)) || null;
  const creatineToday = creatineLogs[todayStr];

  const events = buildDailyTimeline({
    dateStr: todayStr,
    workouts,
    waterBatches,
    creatineLog: creatineToday,
    meals,
    weightEntry: todayWeight,
    profileUnit: profile?.unit || 'kg',
  });

  return (
    <div className="card p-4 bg-bg-card border border-border space-y-3.5 shadow-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-accent" />
          <span className="section-title text-[10px] block mb-0">TODAY&apos;S TIMELINE</span>
        </div>
        <span className="text-xs font-semibold text-text-muted">
          {events.length} {events.length === 1 ? 'event' : 'events'} logged
        </span>
      </div>

      {events.length === 0 ? (
        <div className="py-5 text-center text-xs text-text-muted bg-bg-secondary/40 rounded-xl border border-dashed border-border">
          <Clock className="w-5 h-5 mx-auto mb-1 text-text-muted/60" />
          <span>No activity logged today yet. Use Quick Log above to start!</span>
        </div>
      ) : (
        <div className="relative pl-5 space-y-3 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
          {events.map((ev) => {
            let Icon = CheckCircle2;
            let iconColor = 'text-accent';

            if (ev.type === 'workout') {
              Icon = Dumbbell;
              iconColor = 'text-emerald-500';
            } else if (ev.type === 'water') {
              Icon = Droplet;
              iconColor = 'text-sky-500';
            } else if (ev.type === 'creatine') {
              Icon = Sparkles;
              iconColor = 'text-amber-500';
            } else if (ev.type === 'meal') {
              Icon = UtensilsCrossed;
              iconColor = 'text-orange-500';
            } else if (ev.type === 'weight') {
              Icon = Scale;
              iconColor = 'text-purple-500';
            }

            return (
              <div key={ev.id} className="relative flex items-start gap-2.5 text-xs">
                {/* Node icon */}
                <div className="absolute -left-5 mt-0.5 w-4 h-4 rounded-full bg-bg-card border border-border flex items-center justify-center">
                  <Icon className={`w-2.5 h-2.5 ${iconColor}`} />
                </div>

                <div className="flex-1 bg-bg-secondary/70 p-2.5 rounded-xl border border-border/60 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-text-primary block leading-tight">
                      {ev.title}
                    </span>
                    {ev.detail && (
                      <span className="text-[11px] text-text-muted mt-0.5 block">
                        {ev.detail}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono font-semibold text-text-muted bg-bg-card px-1.5 py-0.5 rounded border border-border">
                    {ev.time}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* End of Day Discipline Progress Badge */}
      {events.length > 0 && (
        <div className="p-2.5 rounded-xl bg-accent/10 border border-accent/25 flex items-center justify-between text-xs text-text-primary">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-accent" />
            <span className="font-bold text-accent">Daily Operating System</span>
          </div>
          <span className="font-mono text-[11px] text-text-muted font-medium">
            +Consistency Reward
          </span>
        </div>
      )}
    </div>
  );
}
