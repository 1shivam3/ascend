'use client';

import React, { useState, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { TrainingDecisionRecord, Unit } from '@/lib/types';
import PolicyDecisionCard from '@/components/PolicyDecisionCard';
import { useTranslation } from '@/lib/i18n';
import type { StringKey } from '@/lib/i18n/en';
import {
  ShieldCheck,
  Layers,
  Filter,
  CheckCircle2,
  Clock,
  Sparkles,
  XCircle,
} from 'lucide-react';

export interface PolicyDecisionLedgerProps {
  decisions?: TrainingDecisionRecord[];
  userUnit?: Unit;
  className?: string;
}

type FilterStatus = 'all' | 'pending' | 'accepted' | 'overridden' | 'dismissed';

export default function PolicyDecisionLedger({
  decisions: decisionsProp,
  userUnit = 'kg',
  className = '',
}: PolicyDecisionLedgerProps) {
  const { t } = useTranslation();
  const storeHistory = useStore(
    (state) => state.policyDecisionsLedgerHistory
  );
  const storeRecords = useStore((state) => state.policyDecisionRecords);

  const [activeFilter, setActiveFilter] = useState<FilterStatus>('all');

  // Combine history with any active records not yet in history
  const allPolicyDecisions = useMemo(() => {
    if (decisionsProp) {
      return [...decisionsProp].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }

    const historyList = [...(storeHistory || [])];
    const recordList = Object.values(storeRecords || {});

    // Ensure all active records are represented
    recordList.forEach((rec) => {
      if (!historyList.some((h) => h.id === rec.id)) {
        historyList.unshift(rec);
      }
    });

    // Return newest first by createdAt
    return historyList.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [decisionsProp, storeHistory, storeRecords]);

  // Filter decisions according to active tab
  const filteredDecisions = useMemo(() => {
    if (activeFilter === 'all') return allPolicyDecisions;
    return allPolicyDecisions.filter((d) => d.status === activeFilter);
  }, [allPolicyDecisions, activeFilter]);

  const counts = useMemo(() => {
    return {
      all: allPolicyDecisions.length,
      pending: allPolicyDecisions.filter((d) => d.status === 'pending').length,
      accepted: allPolicyDecisions.filter((d) => d.status === 'accepted').length,
      overridden: allPolicyDecisions.filter((d) => d.status === 'overridden').length,
      dismissed: allPolicyDecisions.filter((d) => d.status === 'dismissed').length,
    };
  }, [allPolicyDecisions]);

  const tabs: { id: FilterStatus; labelKey: StringKey; count: number; icon: typeof Layers }[] = [
    { id: 'all', labelKey: 'ledger.all', count: counts.all, icon: Layers },
    { id: 'pending', labelKey: 'ledger.pending', count: counts.pending, icon: Clock },
    { id: 'accepted', labelKey: 'ledger.accepted', count: counts.accepted, icon: CheckCircle2 },
    { id: 'overridden', labelKey: 'ledger.overridden', count: counts.overridden, icon: Sparkles },
    { id: 'dismissed', labelKey: 'ledger.dismissed', count: counts.dismissed, icon: XCircle },
  ];

  const handleTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = index;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = (index + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = tabs.length - 1;
    } else {
      return;
    }

    const nextTab = tabs[nextIndex];
    setActiveFilter(nextTab.id);
    const nextElem = document.getElementById(`policy-ledger-tab-${nextTab.id}`);
    nextElem?.focus();
  };

  return (
    <div className={`space-y-4 font-sans ${className}`} role="region" aria-label={t('ledger.aria')}>
      {/* ── Ledger Explanation Header ── */}
      <div className="card p-3.5 bg-bg-secondary/50 border border-border text-xs text-text-secondary space-y-1">
        <div className="flex items-center gap-1.5 text-text-primary font-bold">
          <ShieldCheck className="w-4 h-4 text-accent" />
          <span>{t('ledger.header')}</span>
        </div>
        <p className="leading-relaxed text-2xs text-text-muted">
          {t('ledger.headerBody')}
        </p>
      </div>

      {/* ── Status Filter Chips (WAI-ARIA Tablist) ── */}
      <div
        className="flex flex-wrap items-center gap-1.5 pb-1"
        role="tablist"
        aria-label={t('ledger.filterAria')}
      >
        {tabs.map((tab, index) => {
          const isActive = activeFilter === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              id={`policy-ledger-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls="policy-ledger-tabpanel"
              tabIndex={isActive ? 0 : -1}
              onKeyDown={(e) => handleTabKeyDown(e, index)}
              onClick={() => setActiveFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 shrink-0 transition-colors border outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                isActive
                  ? 'bg-accent text-accent-on border-accent shadow-xs'
                  : 'bg-bg-card text-text-muted border-border/80 hover:text-text-primary hover:border-border'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t(tab.labelKey)}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-bg-secondary text-text-muted'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Decisions List or Empty State (Tabpanel) ── */}
      <div
        id="policy-ledger-tabpanel"
        role="tabpanel"
        aria-labelledby={`policy-ledger-tab-${activeFilter}`}
        tabIndex={0}
        className="outline-none"
      >
        {filteredDecisions.length === 0 ? (
          <div className="card p-8 bg-bg-card border border-border text-center space-y-3 shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-bg-secondary text-text-muted mx-auto flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div className="space-y-1 max-w-sm mx-auto">
              <h3 className="text-sm font-bold text-text-primary font-mono">
                {allPolicyDecisions.length === 0
                  ? t('ledger.noneYet')
                  : t('ledger.noneStatus', { status: t(`ledger.${activeFilter}` as StringKey) })}
              </h3>
              <p className="text-xs text-text-muted leading-relaxed">
                {allPolicyDecisions.length === 0
                  ? t('ledger.emptyBody')
                  : t('ledger.emptyStatusBody', { status: activeFilter })}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredDecisions.map((decision) => (
              <PolicyDecisionCard
                key={decision.id}
                decision={decision}
                userUnit={userUnit}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
