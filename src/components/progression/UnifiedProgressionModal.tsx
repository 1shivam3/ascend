import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../constants/theme';
import { UnifiedProgressionStatus } from '../../types/progression.types';
import { Heading, Caption, MonoText } from '../ui/Typography';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { ProgressBar } from '../ui/ProgressBar';
import { ProgressRing } from '../ui/ProgressRing';
import { SectionHeader } from '../ui/SectionHeader';
import { TacticalButton } from '../ui/TacticalButton';

interface UnifiedProgressionModalProps {
  visible: boolean;
  status: UnifiedProgressionStatus | null;
  onClose: () => void;
}

export const UnifiedProgressionModal: React.FC<UnifiedProgressionModalProps> = ({
  visible,
  status,
  onClose,
}) => {
  const { colors, borderRadius, isDark } = useTheme();

  if (!status) return null;

  const {
    currentLevel,
    progressPercent,
    effectiveRank,
    rankDivision,
    confirmationStatus,
    verifiedSessionsCount,
    sessionsNeededForConfirmation,
    ascensionBlocked,
    blockedReasons,
    attributes,
    topStrength,
    areaForImprovement,
    nextMilestone,
  } = status;

  const isProvisional = confirmationStatus === 'PROVISIONAL';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.container,
            {
              backgroundColor: colors.surface,
              borderRadius: borderRadius.xl,
              borderColor: isDark ? colors.border : '#E2E8F0',
            },
          ]}
        >
          {/* Modal Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Caption upper style={{ color: colors.textMuted, fontWeight: '700' }}>
                ATHLETIC PROGRESSION TELEMETRY
              </Caption>
              <Heading level={2} style={{ color: colors.textPrimary, marginTop: 2 }}>
                Unified Rank & Level
              </Heading>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={[styles.closeButton, { backgroundColor: isDark ? colors.surfaceElevated : '#F1F5F9' }]}
            >
              <Ionicons name="close" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* 1. Unified Progress Hero Card */}
            <Card
              variant="elevated"
              style={[
                styles.heroCard,
                {
                  borderColor: isDark ? `${effectiveRank.color}44` : `${effectiveRank.color}33`,
                  backgroundColor: isDark ? '#111827' : '#F8FAFC',
                },
              ]}
            >
              <View style={styles.heroRow}>
                <ProgressRing
                  progress={progressPercent}
                  size={92}
                  strokeWidth={8}
                  color={effectiveRank.color}
                  centerText={`${progressPercent}%`}
                  centerSubtext="NEXT LVL"
                />

                <View style={styles.heroDetails}>
                  <View style={styles.badgeRow}>
                    <View
                      style={[
                        styles.rankTierPill,
                        {
                          backgroundColor: `${effectiveRank.color}22`,
                          borderColor: `${effectiveRank.color}66`,
                        },
                      ]}
                    >
                      <Text style={[styles.rankTierText, { color: effectiveRank.color }]}>
                        RANK {effectiveRank.tier}
                      </Text>
                    </View>

                    <Badge
                      label={isProvisional ? 'PROVISIONAL' : 'VERIFIED'}
                      variant={isProvisional ? 'amber' : 'emerald'}
                      size="sm"
                    />
                  </View>

                  <Heading level={2} style={[styles.rankTitle, { color: colors.textPrimary }]}>
                    {effectiveRank.title}
                  </Heading>

                  <Text style={[styles.divisionText, { color: colors.textSecondary }]}>
                    Level {currentLevel} • Division {rankDivision}
                  </Text>
                </View>
              </View>

              {/* Status explanation */}
              <View style={styles.statusBox}>
                <Ionicons
                  name={isProvisional ? 'information-circle-outline' : 'shield-checkmark-outline'}
                  size={16}
                  color={isProvisional ? colors.amber : colors.emerald}
                />
                <Text style={[styles.statusMessage, { color: colors.textSecondary }]}>
                  {isProvisional
                    ? `Provisional standing (${verifiedSessionsCount}/3 verified sessions). Log ${sessionsNeededForConfirmation} more session${sessionsNeededForConfirmation === 1 ? '' : 's'} to confirm.`
                    : `Officially confirmed with ${verifiedSessionsCount} verified workout sessions.`}
                </Text>
              </View>

              {/* Ascension Gate Alert */}
              {ascensionBlocked && (
                <View style={[styles.gateAlert, { backgroundColor: `${colors.amber}18` }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="lock-closed" size={16} color={colors.amber} />
                    <Text style={[styles.gateAlertTitle, { color: colors.amber }]}>
                      Higher Rank Gate Active
                    </Text>
                  </View>
                  <Text style={[styles.gateAlertDesc, { color: colors.textPrimary }]}>
                    You qualify for higher level, but athletic rank requires balanced multi-dimensional performance:
                  </Text>
                  {blockedReasons.map((reason, idx) => (
                    <Text key={idx} style={[styles.gateBullet, { color: colors.textSecondary }]}>
                      • {reason}
                    </Text>
                  ))}
                </View>
              )}
            </Card>

            {/* 2. Four-Dimensional Fitness Matrix */}
            <View style={styles.sectionMargin}>
              <SectionHeader title="MULTI-DIMENSIONAL FITNESS PROFILE" />
              <Caption style={{ color: colors.textMuted, marginBottom: 10 }}>
                Ascension requires verified physical progress across all 4 dimensions.
              </Caption>

              <View style={styles.dimensionsGrid}>
                {/* 1. Strength */}
                <Card variant="surface" style={styles.dimensionCard}>
                  <View style={styles.dimensionHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="barbell-outline" size={18} color={colors.primary} />
                      <Text style={[styles.dimTitle, { color: colors.textPrimary }]}>Strength</Text>
                    </View>
                    <MonoText style={[styles.dimScore, { color: colors.primary }]}>
                      {attributes.strength}/100
                    </MonoText>
                  </View>
                  <ProgressBar
                    progressPercent={attributes.strength}
                    size="sm"
                    color={colors.primary}
                  />
                  <Caption style={{ color: colors.textMuted, marginTop: 4 }}>
                    Relative compound 1RM to bodyweight & Wilks load.
                  </Caption>
                </Card>

                {/* 2. Endurance */}
                <Card variant="surface" style={styles.dimensionCard}>
                  <View style={styles.dimensionHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="speedometer-outline" size={18} color={colors.skyText} />
                      <Text style={[styles.dimTitle, { color: colors.textPrimary }]}>Endurance</Text>
                    </View>
                    <MonoText style={[styles.dimScore, { color: colors.skyText }]}>
                      {attributes.endurance}/100
                    </MonoText>
                  </View>
                  <ProgressBar
                    progressPercent={attributes.endurance}
                    size="sm"
                    color={colors.skyText}
                  />
                  <Caption style={{ color: colors.textMuted, marginTop: 4 }}>
                    Tonnage capacity, rep volume tolerance & density.
                  </Caption>
                </Card>

                {/* 3. Mobility */}
                <Card variant="surface" style={styles.dimensionCard}>
                  <View style={styles.dimensionHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="body-outline" size={18} color={colors.lavenderText} />
                      <Text style={[styles.dimTitle, { color: colors.textPrimary }]}>Mobility</Text>
                    </View>
                    <MonoText style={[styles.dimScore, { color: colors.lavenderText }]}>
                      {attributes.mobility ?? 10}/100
                    </MonoText>
                  </View>
                  <ProgressBar
                    progressPercent={attributes.mobility ?? 10}
                    size="sm"
                    color={colors.lavenderText}
                  />
                  <Caption style={{ color: colors.textMuted, marginTop: 4 }}>
                    Movement range, active recovery & flexibility.
                  </Caption>
                </Card>

                {/* 4. Consistency */}
                <Card variant="surface" style={styles.dimensionCard}>
                  <View style={styles.dimensionHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="flame-outline" size={18} color={colors.amber} />
                      <Text style={[styles.dimTitle, { color: colors.textPrimary }]}>Consistency</Text>
                    </View>
                    <MonoText style={[styles.dimScore, { color: colors.amber }]}>
                      {attributes.consistency}/100
                    </MonoText>
                  </View>
                  <ProgressBar
                    progressPercent={attributes.consistency}
                    size="sm"
                    color={colors.amber}
                  />
                  <Caption style={{ color: colors.textMuted, marginTop: 4 }}>
                    Weekly schedule adherence & streak momentum.
                  </Caption>
                </Card>
              </View>
            </View>

            {/* 3. Strengths & Focus Areas */}
            <View style={styles.sectionMargin}>
              <SectionHeader title="DIAGNOSTIC ANALYSIS" />

              {/* Top Strength Card */}
              <Card
                variant="surface"
                style={[
                  styles.insightCard,
                  { borderColor: isDark ? `${colors.emerald}44` : '#D1FAE5' },
                ]}
              >
                <View style={styles.insightHeader}>
                  <Ionicons name="trending-up-outline" size={20} color={colors.emerald} />
                  <Text style={[styles.insightTitle, { color: colors.emerald }]}>
                    {topStrength.title}
                  </Text>
                </View>
                <Text style={[styles.insightDesc, { color: colors.textPrimary }]}>
                  {topStrength.description}
                </Text>
              </Card>

              {/* Area for Improvement Card */}
              <Card
                variant="surface"
                style={[
                  styles.insightCard,
                  { marginTop: 10, borderColor: isDark ? `${colors.amber}44` : '#FEF3C7' },
                ]}
              >
                <View style={styles.insightHeader}>
                  <Ionicons name="sparkles-outline" size={20} color={colors.amber} />
                  <Text style={[styles.insightTitle, { color: colors.amber }]}>
                    {areaForImprovement.title}
                  </Text>
                </View>
                <Text style={[styles.insightDesc, { color: colors.textPrimary }]}>
                  {areaForImprovement.description}
                </Text>
                <Text style={[styles.insightAction, { color: colors.textSecondary }]}>
                  💡 Action: {areaForImprovement.actionRecommendation}
                </Text>
              </Card>
            </View>

            {/* 4. Next Milestone Requirements */}
            <View style={styles.sectionMargin}>
              <SectionHeader title="NEXT RANK MILESTONE" />

              <Card
                variant="elevated"
                style={[
                  styles.roadmapCard,
                  { borderColor: isDark ? colors.border : '#E2E8F0' },
                ]}
              >
                <View style={styles.roadmapHeader}>
                  <Text style={[styles.roadmapTitle, { color: colors.textPrimary }]}>
                    Target: {nextMilestone.nextRankTitle}
                  </Text>
                  <Badge label={`Lvl ${nextMilestone.levelProgress.required}`} variant="cyan" size="sm" />
                </View>

                <Text style={[styles.roadmapSummary, { color: colors.textSecondary }]}>
                  {nextMilestone.summaryMessage}
                </Text>

                {/* Level requirement row */}
                <View style={styles.reqRow}>
                  <Text style={[styles.reqLabel, { color: colors.textPrimary }]}>
                    Character Level Progress
                  </Text>
                  <MonoText style={{ color: colors.textSecondary, fontSize: 13 }}>
                    {nextMilestone.levelProgress.current} / {nextMilestone.levelProgress.required}
                  </MonoText>
                </View>
                <ProgressBar
                  progressPercent={nextMilestone.levelProgress.percent}
                  size="sm"
                  color={colors.cyan}
                />

                {/* Dimensional Checkmarks */}
                <View style={styles.reqGrid}>
                  {nextMilestone.dimensions.map((dim) => (
                    <View key={dim.dimension} style={styles.reqItem}>
                      <Ionicons
                        name={dim.satisfied ? 'checkmark-circle' : 'time-outline'}
                        size={16}
                        color={dim.satisfied ? colors.emerald : colors.textMuted}
                      />
                      <Text
                        style={[
                          styles.reqItemText,
                          { color: dim.satisfied ? colors.textPrimary : colors.textMuted },
                        ]}
                      >
                        {dim.label}: {dim.score}/{dim.target}
                      </Text>
                    </View>
                  ))}
                </View>
              </Card>
            </View>

            {/* Dismiss Button */}
            <TacticalButton
              title="Acknowledge Standing"
              onPress={onClose}
              variant="primary"
              style={{ marginTop: 20, marginBottom: 10 }}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    width: '100%',
    maxHeight: '90%',
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150, 150, 150, 0.2)',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 20,
  },
  heroCard: {
    padding: 16,
    borderWidth: 1.5,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  heroDetails: {
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  rankTierPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  rankTierText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  rankTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  divisionText: {
    fontSize: 13,
    marginTop: 2,
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(150, 150, 150, 0.2)',
  },
  statusMessage: {
    fontSize: 12,
    flex: 1,
  },
  gateAlert: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  gateAlertTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  gateAlertDesc: {
    fontSize: 12,
    marginTop: 4,
  },
  gateBullet: {
    fontSize: 11,
    marginTop: 2,
    marginLeft: 6,
  },
  sectionMargin: {
    marginTop: 20,
  },
  dimensionsGrid: {
    gap: 10,
  },
  dimensionCard: {
    padding: 14,
  },
  dimensionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  dimTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  dimScore: {
    fontSize: 14,
    fontWeight: '700',
  },
  insightCard: {
    padding: 14,
    borderWidth: 1,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  insightDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  insightAction: {
    fontSize: 12,
    marginTop: 6,
    fontStyle: 'italic',
  },
  roadmapCard: {
    padding: 16,
    borderWidth: 1,
  },
  roadmapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  roadmapTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  roadmapSummary: {
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },
  reqRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  reqLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  reqGrid: {
    marginTop: 12,
    gap: 8,
  },
  reqItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reqItemText: {
    fontSize: 13,
  },
});
