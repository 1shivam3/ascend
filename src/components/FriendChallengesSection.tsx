'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Users, Copy, Check, Share2, UserPlus, Plus, Trophy } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useToday } from '@/lib/use-today';
import { useTranslation } from '@/lib/i18n';
import { safeRandomId } from '@/lib/formatters';
import { buildActiveDays, calculateStreak } from '@/lib/streak-freeze';
import { XP_CHALLENGE_COMPLETE } from '@/lib/xp-system';
import {
  FRIEND_CHALLENGE_PRESETS,
  FRIEND_CHALLENGE_DURATIONS,
  createFriendChallengeDef,
  encodeChallengeCode,
  decodeChallengeCode,
  encodeScoreCode,
  decodeScoreCode,
  extractCode,
  evaluateFriendChallenge,
  buildLeaderboard,
  friendRewardDue,
  friendChallengeXpEventId,
  friendChallengeStatus,
  friendChallengeDaysLeft,
  formatFriendChallengeInvite,
  formatFriendScoreShare,
  metricLabel,
  type FriendChallengeDef,
} from '@/lib/friend-challenges';
import { useToast } from '@/components/ui/Toast';

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function whatsappUrl(text: string): string {
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
}

/** A code in a box with copy + WhatsApp share — the whole exchange mechanism. */
function CodeShareBox({ text, shareText }: { text: string; shareText: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be unavailable (permissions) — the code stays selectable.
    }
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-stretch gap-1.5">
        <code className="flex-1 min-w-0 px-2.5 py-2 rounded-lg bg-bg-primary border border-border/60 text-2xs font-mono text-text-secondary break-all select-all">
          {text}
        </code>
        <button
          type="button"
          onClick={copy}
          className="px-2.5 rounded-lg bg-bg-primary border border-border text-text-secondary hover:text-text-primary flex items-center gap-1 text-2xs font-semibold shrink-0 cursor-pointer"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? t('friends.copied') : t('friends.copyCode')}
        </button>
      </div>
      <a
        href={whatsappUrl(shareText)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-2xs font-semibold text-accent hover:underline"
      >
        <Share2 className="w-3 h-3" />
        WhatsApp
      </a>
    </div>
  );
}

interface FriendChallengesSectionProps {
  /** Render only when the parent sheet is open (keeps reward effect scoped). */
  active: boolean;
}

/**
 * "With Friends" — small-group challenges exchanged by code. Deliberately
 * manual: there is no server sync behind this, and the copy says so.
 * Progress comes from the user's own logs; scores move only when someone
 * shares a fresh score code.
 */
export default function FriendChallengesSection({ active }: FriendChallengesSectionProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const {
    profile,
    workouts,
    meals,
    prs,
    waterLogs,
    streak,
    friendChallenges,
    addFriendChallenge,
    removeFriendChallenge,
    applyFriendScore,
    grantFriendChallengeReward,
    awardXpEvents,
  } = useStore();
  const todayStr = useToday();

  const myName = (profile?.name || '').trim() || 'Me';

  const [showCreate, setShowCreate] = useState(false);
  const [presetIdx, setPresetIdx] = useState(0);
  const [duration, setDuration] = useState<number>(14);
  const [nameDraft, setNameDraft] = useState('');
  const [joinDraft, setJoinDraft] = useState('');
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({});
  const [openCodeBox, setOpenCodeBox] = useState<string | null>(null);

  const data = useMemo(() => {
    const normalizedWorkouts = workouts.map((w) => ({ ...w, date: w.date.split('T')[0] }));
    const activeDays = buildActiveDays(normalizedWorkouts, meals);
    const streakInfo = calculateStreak({
      dailyActivity: activeDays,
      freezesAvailable: streak.freezesAvailable,
      todayStr,
    });
    return {
      workouts: normalizedWorkouts,
      meals,
      prs: (prs || []).map((p) => ({ date: (p.date || '').split('T')[0] })),
      currentStreak: streakInfo.currentStreak,
      waterDays: Object.keys(waterLogs || {}).filter((d) => (waterLogs?.[d] || 0) > 0),
    };
  }, [workouts, meals, prs, waterLogs, streak.freezesAvailable, todayStr]);

  const records = useMemo(
    () =>
      Object.values(friendChallenges.records).sort((a, b) =>
        b.def.startDate.localeCompare(a.def.startDate),
      ),
    [friendChallenges.records],
  );

  const evaluations = useMemo(() => {
    const map: Record<string, ReturnType<typeof evaluateFriendChallenge>> = {};
    for (const rec of records) map[rec.def.id] = evaluateFriendChallenge(rec.def, data);
    return map;
  }, [records, data]);

  // Completion → 200 XP via the ledger (idempotent), exactly once per
  // challenge thanks to the record's rewardGranted flag.
  useEffect(() => {
    if (!active) return;
    for (const rec of records) {
      const evaluation = evaluations[rec.def.id];
      if (evaluation && friendRewardDue(rec, evaluation)) {
        awardXpEvents([{ id: friendChallengeXpEventId(rec.def.id), type: 'challenge' }]);
        grantFriendChallengeReward(rec.def.id);
        toast.success(t('toast.challengeCompleteXP', { title: rec.def.title, xp: XP_CHALLENGE_COMPLETE }), t('toast.titleChallengeComplete'));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, records, evaluations]);

  const handleCreate = () => {
    const preset = FRIEND_CHALLENGE_PRESETS[presetIdx];
    const creator = (nameDraft || myName).slice(0, 40);
    const def = createFriendChallengeDef({
      id: safeRandomId('fc'),
      title: preset.title,
      metric: preset.metric,
      target: preset.target,
      startDate: todayStr,
      durationDays: duration,
      creatorName: creator,
      createdByMe: true,
    });
    addFriendChallenge(def);
    setShowCreate(false);
    setOpenCodeBox(`invite:${def.id}`);
    toast.success(t('friends.challengeJoined'), def.title);
  };

  const handleJoin = () => {
    const code = extractCode(joinDraft, 'challenge') || joinDraft.trim();
    const def = decodeChallengeCode(code);
    if (!def) {
      toast.info(t('friends.invalidCode'), t('friends.title'));
      return;
    }
    addFriendChallenge(def);
    setJoinDraft('');
    toast.success(t('friends.challengeJoined'), def.title);
  };

  const handleAddScore = (def: FriendChallengeDef) => {
    const draft = scoreDrafts[def.id] || '';
    const code = extractCode(draft, 'score') || draft.trim();
    const payload = decodeScoreCode(code);
    if (!payload) {
      toast.info(t('friends.invalidCode'), def.title);
      return;
    }
    if (payload.challengeId !== def.id) {
      toast.info(t('friends.scoreWrongChallenge'), def.title);
      return;
    }
    applyFriendScore(def.id, {
      name: payload.name,
      progress: payload.progress,
      updatedDate: payload.date,
    });
    setScoreDrafts((s) => ({ ...s, [def.id]: '' }));
    toast.success(t('friends.scoreAdded'), def.title);
  };

  const myScoreCode = (def: FriendChallengeDef): string =>
    encodeScoreCode({
      challengeId: def.id,
      name: myName,
      progress: evaluations[def.id]?.progress ?? 0,
      date: todayStr,
    });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pt-1">
        <span className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
          <Users className="w-4 h-4" />
        </span>
        <div>
          <h3 className="text-base font-bold text-text-primary">{t('friends.title')}</h3>
          <p className="text-2xs text-text-muted">{t('friends.subtitle')}</p>
        </div>
      </div>

      <p className="text-2xs text-text-muted leading-relaxed">{t('friends.howItWorks')}</p>

      {/* Create / Join */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="py-2 px-3.5 rounded-xl bg-accent text-accent-on text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('friends.create')}
        </button>
      </div>

      {showCreate && (
        <div className="p-3.5 rounded-2xl bg-bg-secondary border border-border/60 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {FRIEND_CHALLENGE_PRESETS.map((p, i) => (
              <button
                key={p.metric}
                type="button"
                onClick={() => setPresetIdx(i)}
                className={`px-2.5 py-1.5 rounded-lg text-2xs font-semibold transition-colors cursor-pointer ${
                  presetIdx === i
                    ? 'bg-accent text-accent-on font-bold'
                    : 'bg-bg-primary border border-border text-text-muted hover:text-text-primary'
                }`}
              >
                {p.title} · {p.target} {metricLabel(p.metric)}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            {FRIEND_CHALLENGE_DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDuration(d)}
                className={`px-2.5 py-1.5 rounded-lg text-2xs font-semibold transition-colors cursor-pointer ${
                  duration === d
                    ? 'bg-accent text-accent-on font-bold'
                    : 'bg-bg-primary border border-border text-text-muted hover:text-text-primary'
                }`}
              >
                {t('friends.durationDays', { days: d })}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder={t('friends.yourName')}
            maxLength={40}
            className="w-full bg-bg-primary border border-border rounded-xl px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-accent outline-none"
          />
          <button
            type="button"
            onClick={handleCreate}
            className="py-2 px-4 rounded-xl bg-accent text-accent-on text-xs font-bold active:scale-95 transition-all cursor-pointer"
          >
            {t('friends.create')}
          </button>
        </div>
      )}

      <div className="flex gap-1.5">
        <input
          type="text"
          value={joinDraft}
          onChange={(e) => setJoinDraft(e.target.value)}
          placeholder={t('friends.pasteChallengeCode')}
          className="flex-1 min-w-0 bg-bg-secondary border border-border rounded-xl px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-accent outline-none"
        />
        <button
          type="button"
          onClick={handleJoin}
          disabled={!joinDraft.trim()}
          className="py-2 px-3.5 rounded-xl bg-bg-secondary border border-accent/50 text-accent text-xs font-bold flex items-center gap-1.5 disabled:opacity-40 active:scale-95 transition-all cursor-pointer shrink-0"
        >
          <UserPlus className="w-3.5 h-3.5" />
          {t('friends.join')}
        </button>
      </div>

      {/* My friend challenges */}
      {records.length === 0 ? (
        <p className="text-2xs text-text-muted">{t('friends.noChallenges')}</p>
      ) : (
        records.map((rec) => {
          const { def } = rec;
          const evaluation = evaluations[def.id];
          const status = friendChallengeStatus(def, todayStr);
          const board = buildLeaderboard(rec, myName, evaluation?.progress ?? 0, todayStr);
          const inviteCode = encodeChallengeCode(def);
          const scoreCode = myScoreCode(def);
          return (
            <div key={def.id} className="p-3.5 rounded-2xl bg-bg-secondary border border-border/60 space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-text-primary">{def.title}</p>
                  <p className="text-2xs text-text-muted mt-0.5">
                    {def.creatorName} · {formatDate(def.startDate)} – {formatDate(def.endDate)} ·{' '}
                    {status === 'expired'
                      ? t('friends.ended')
                      : status === 'upcoming'
                        ? t('friends.startsOn', { date: formatDate(def.startDate) })
                        : t('friends.daysLeft', { days: friendChallengeDaysLeft(def, todayStr) })}
                  </p>
                </div>
                <span className="text-2xs font-bold text-amber-500 tabular-nums shrink-0 pt-0.5">
                  +{XP_CHALLENGE_COMPLETE} XP
                </span>
              </div>

              <div className="w-full h-2 rounded-full bg-border/60 overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-500"
                  style={{ width: `${evaluation?.pct ?? 0}%` }}
                />
              </div>
              <p className="text-2xs text-text-muted tabular-nums">
                {evaluation?.progress ?? 0} of {def.target} {metricLabel(def.metric)}
              </p>

              {/* Leaderboard */}
              <div className="space-y-1">
                {board.map((row) => (
                  <div
                    key={row.name}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs ${
                      row.isMe ? 'bg-accent/10 border border-accent/30' : 'bg-bg-primary border border-border/40'
                    }`}
                  >
                    <span className="text-2xs font-bold text-text-muted w-4 tabular-nums">{row.rank}</span>
                    {row.rank === 1 && <Trophy className="w-3 h-3 text-amber-500 shrink-0" />}
                    <span className="font-semibold text-text-primary truncate">
                      {row.isMe ? `${row.name} (${t('friends.you')})` : row.name}
                    </span>
                    <span className="ml-auto text-2xs font-mono text-text-secondary tabular-nums shrink-0">
                      {row.progress}/{row.target}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-2xs text-text-muted">{t('friends.boardHint')}</p>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setOpenCodeBox(openCodeBox === `invite:${def.id}` ? null : `invite:${def.id}`)}
                  className="px-2.5 py-1.5 rounded-lg bg-bg-primary border border-border text-2xs font-semibold text-text-secondary hover:text-text-primary cursor-pointer"
                >
                  {t('friends.shareInvite')}
                </button>
                <button
                  type="button"
                  onClick={() => setOpenCodeBox(openCodeBox === `score:${def.id}` ? null : `score:${def.id}`)}
                  className="px-2.5 py-1.5 rounded-lg bg-bg-primary border border-border text-2xs font-semibold text-text-secondary hover:text-text-primary cursor-pointer"
                >
                  {t('friends.shareMyScore')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    removeFriendChallenge(def.id);
                    toast.info(t('friends.leave'), def.title);
                  }}
                  className="px-2.5 py-1.5 rounded-lg text-2xs font-semibold text-text-muted hover:text-text-primary cursor-pointer ml-auto"
                >
                  {t('friends.leave')}
                </button>
              </div>

              {openCodeBox === `invite:${def.id}` && (
                <CodeShareBox text={inviteCode} shareText={formatFriendChallengeInvite(def, inviteCode)} />
              )}
              {openCodeBox === `score:${def.id}` && (
                <CodeShareBox
                  text={scoreCode}
                  shareText={formatFriendScoreShare(
                    def,
                    { name: myName, progress: evaluation?.progress ?? 0, updatedDate: todayStr },
                    scoreCode,
                  )}
                />
              )}

              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={scoreDrafts[def.id] || ''}
                  onChange={(e) => setScoreDrafts((s) => ({ ...s, [def.id]: e.target.value }))}
                  placeholder={t('friends.pasteScoreCode')}
                  className="flex-1 min-w-0 bg-bg-primary border border-border rounded-xl px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-accent outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleAddScore(def)}
                  disabled={!(scoreDrafts[def.id] || '').trim()}
                  className="py-2 px-3 rounded-xl bg-bg-primary border border-accent/50 text-accent text-xs font-bold disabled:opacity-40 active:scale-95 transition-all cursor-pointer shrink-0"
                >
                  {t('friends.addScore')}
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
