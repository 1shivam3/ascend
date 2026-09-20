import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { THEME } from '../../constants/theme';
import {
  ActivityFeedItem,
  ActivityReactionType,
} from '../../types/social.types';
import { Card } from '../ui/Card';
import { Heading, Text, Caption, MonoText } from '../ui/Typography';
import { Badge } from '../ui/Badge';

interface ActivityFeedCardProps {
  item: ActivityFeedItem;
  currentUserId: string;
  onReact: (activityId: string, reactionType: ActivityReactionType) => void;
  onPressAuthor?: (userId: string) => void;
  onDelete?: (activityId: string) => void;
}

const EVENT_CONFIG: Record<
  string,
  { label: string; icon: string; borderColor: string; badgeVariant: 'cyan' | 'amber' | 'emerald' | 'violet' | 'crimson' }
> = {
  WORKOUT_COMPLETED: {
    label: 'PROTOCOL COMPLETE',
    icon: '📋',
    borderColor: THEME.colors.border,
    badgeVariant: 'cyan',
  },
  PR_ACHIEVED: {
    label: 'PR BREAKTHROUGH',
    icon: '⚡',
    borderColor: THEME.colors.amber,
    badgeVariant: 'amber',
  },
  LEVEL_UP: {
    label: 'LEVEL ELEVATION',
    icon: '🏆',
    borderColor: THEME.colors.cyan,
    badgeVariant: 'cyan',
  },
  RANK_UP: {
    label: 'RANK ASCENSION',
    icon: '👑',
    borderColor: THEME.colors.violet,
    badgeVariant: 'violet',
  },
  ACHIEVEMENT_UNLOCKED: {
    label: 'BADGE UNLOCKED',
    icon: '🎖️',
    borderColor: THEME.colors.emerald,
    badgeVariant: 'emerald',
  },
  CHALLENGE_COMPLETED: {
    label: 'DIRECTIVE FULFILLED',
    icon: '🎯',
    borderColor: THEME.colors.cyan,
    badgeVariant: 'cyan',
  },
  CHARACTER_EVOLUTION: {
    label: 'FORM EVOLVED',
    icon: '🧬',
    borderColor: THEME.colors.violet,
    badgeVariant: 'violet',
  },
};

const REACTIONS: { type: ActivityReactionType; icon: string; label: string }[] = [
  { type: 'LIKE', icon: '⚡', label: 'ENERGY' },
  { type: 'FIRE', icon: '🔥', label: 'FIRE' },
  { type: 'RESPECT', icon: '🛡️', label: 'RESPECT' },
  { type: 'WARRIOR', icon: '⚔️', label: 'WARRIOR' },
  { type: 'STRENGTH', icon: '💪', label: 'STRENGTH' },
  { type: 'PRECISION', icon: '🎯', label: 'PRECISION' },
];

export const ActivityFeedCard: React.FC<ActivityFeedCardProps> = ({
  item,
  currentUserId,
  onReact,
  onPressAuthor,
  onDelete,
}) => {
  const config = EVENT_CONFIG[item.eventType] || EVENT_CONFIG.WORKOUT_COMPLETED;
  const isAuthor = item.userId === currentUserId;

  return (
    <Card variant="surface" accentBorder={config.borderColor} style={styles.card}>
      {/* Header: Author Info & Event Badge */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.authorSection}
          onPress={() => onPressAuthor?.(item.userId)}
          activeOpacity={0.7}
        >
          <Text style={styles.avatar}>{item.author?.avatarUrl || '⚔️'}</Text>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Heading level={3} style={styles.authorName}>
                {item.author?.displayName || item.author?.username || 'Operative'}
              </Heading>
              {isAuthor && <Badge label="YOU" variant="neutral" size="sm" />}
            </View>
            <Caption color={THEME.colors.textMuted} style={styles.authorMeta}>
              LVL {item.author?.globalLevel || 1} • {item.author?.rankTier || 'E'}-RANK DIV {item.author?.rankDivision || 4}
            </Caption>
          </View>
        </TouchableOpacity>

        <Badge
          label={`${config.icon} ${config.label}`}
          variant={config.badgeVariant}
          size="sm"
        />
      </View>

      {/* Main Content */}
      <View style={styles.body}>
        <Text style={styles.eventTitle}>{item.title}</Text>
        <Caption color={THEME.colors.textSecondary} style={styles.eventSummary}>
          {item.summary}
        </Caption>

        {/* Athletic Telemetry Pills */}
        {item.metadata && (
          <View style={styles.telemetryRow}>
            {item.metadata.durationMinutes ? (
              <View style={styles.telemetryPill}>
                <Caption color={THEME.colors.cyan}>⏱️ {item.metadata.durationMinutes} MIN</Caption>
              </View>
            ) : null}
            {item.metadata.totalVolumeKg ? (
              <View style={styles.telemetryPill}>
                <Caption color={THEME.colors.emerald}>
                  🏋️ {item.metadata.totalVolumeKg.toLocaleString()} KG
                </Caption>
              </View>
            ) : null}
            {item.metadata.prValue ? (
              <View style={[styles.telemetryPill, { borderColor: THEME.colors.amber }]}>
                <Caption color={THEME.colors.amber}>
                  ⚡ {item.metadata.prValue} KG PR
                </Caption>
              </View>
            ) : null}
            {item.metadata.evolutionStage ? (
              <View style={[styles.telemetryPill, { borderColor: THEME.colors.violet }]}>
                <Caption color={THEME.colors.violet}>
                  🧬 STAGE {item.metadata.evolutionStage}
                </Caption>
              </View>
            ) : null}
          </View>
        )}
      </View>

      {/* Footer: Lightweight Athletic Reactions */}
      <View style={styles.footer}>
        <View style={styles.reactionsRow}>
          {REACTIONS.map(rx => {
            const count = item.reactions?.[rx.type] || 0;
            const isSelected = item.userReaction === rx.type;

            return (
              <TouchableOpacity
                key={rx.type}
                style={[
                  styles.reactionBtn,
                  isSelected && styles.reactionBtnActive,
                  count > 0 && !isSelected && styles.reactionBtnHasCount,
                ]}
                onPress={() => onReact(item.id, rx.type)}
                activeOpacity={0.7}
              >
                <Text style={styles.reactionIcon}>{rx.icon}</Text>
                {count > 0 && (
                  <MonoText
                    color={isSelected ? THEME.colors.cyan : THEME.colors.textSecondary}
                    style={styles.reactionCount}
                  >
                    {count}
                  </MonoText>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {isAuthor && onDelete && (
          <TouchableOpacity
            onPress={() => onDelete(item.id)}
            style={styles.deleteBtn}
            activeOpacity={0.6}
          >
            <Caption color={THEME.colors.crimson}>✕</Caption>
          </TouchableOpacity>
        )}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 14,
    marginBottom: THEME.spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  authorSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  avatar: {
    fontSize: 22,
  },
  authorName: {
    fontSize: 14,
    fontWeight: '800',
  },
  authorMeta: {
    fontSize: 10,
    letterSpacing: 0.5,
  },
  body: {
    marginBottom: 12,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 4,
  },
  eventSummary: {
    fontSize: 12,
    lineHeight: 18,
  },
  telemetryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  telemetryPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surfaceElevated,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: THEME.colors.borderSubtle,
    paddingTop: 10,
  },
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  reactionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: THEME.borderRadius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
    backgroundColor: THEME.colors.surface,
  },
  reactionBtnActive: {
    borderColor: THEME.colors.cyan,
    backgroundColor: THEME.colors.cyanSubtle,
  },
  reactionBtnHasCount: {
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surfaceElevated,
  },
  reactionIcon: {
    fontSize: 13,
  },
  reactionCount: {
    fontSize: 11,
    fontWeight: '700',
  },
  deleteBtn: {
    padding: 6,
    marginLeft: 8,
  },
});
