import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { THEME } from '../../constants/theme';
import { XpEngine } from '../../services/progression/XpEngine';
import { getRankForLevel } from '../../constants/ranks';

interface LevelOrbProps {
  totalXp: number;
}

export const LevelOrb: React.FC<LevelOrbProps> = ({ totalXp }) => {
  const levelInfo = XpEngine.getLevelInfo(totalXp);
  const rank = getRankForLevel(levelInfo.level);

  return (
    <View style={styles.container}>
      <View style={[styles.orbOuter, { borderColor: rank.definition.color }]}>
        <View style={styles.orbInner}>
          <Text style={styles.levelLabel}>LVL</Text>
          <Text style={[styles.levelNumber, { color: rank.definition.color }]}>
            {levelInfo.level}
          </Text>
        </View>
      </View>

      <View style={styles.infoContainer}>
        <View style={styles.rankRow}>
          <Text style={[styles.rankTitle, { color: rank.definition.color }]}>
            {rank.definition.title.toUpperCase()} {rank.tier !== 'ASCENDANT' ? `DIV ${rank.division}` : ''}
          </Text>
        </View>

        {/* XP Progress Bar */}
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressBar,
              {
                width: `${levelInfo.progressPercent}%`,
                backgroundColor: rank.definition.color,
              },
            ]}
          />
        </View>

        <View style={styles.xpTextRow}>
          <Text style={styles.xpText}>
            {levelInfo.currentLevelXp.toLocaleString()} / {levelInfo.xpRequiredForNextLevel.toLocaleString()} XP
          </Text>
          <Text style={styles.percentText}>{levelInfo.progressPercent}%</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    padding: THEME.spacing.md,
  },
  orbOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.colors.background,
    marginRight: THEME.spacing.md,
  },
  orbInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelLabel: {
    color: THEME.colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  levelNumber: {
    fontSize: 26,
    fontWeight: '900',
    marginTop: -2,
  },
  infoContainer: {
    flex: 1,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  rankTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  progressTrack: {
    height: 8,
    backgroundColor: THEME.colors.background,
    borderRadius: THEME.borderRadius.full,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
    marginBottom: 4,
  },
  progressBar: {
    height: '100%',
    borderRadius: THEME.borderRadius.full,
  },
  xpTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  xpText: {
    color: THEME.colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  percentText: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
});
