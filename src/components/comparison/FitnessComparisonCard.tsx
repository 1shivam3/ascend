import React from 'react';
import { View, StyleSheet, TouchableOpacity, ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../constants/theme';
import { FitnessComparisonEvaluation } from '../../types/comparison.types';
import { Heading, Text, Caption, MonoText } from '../ui/Typography';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';

interface FitnessComparisonCardProps {
  evaluation: FitnessComparisonEvaluation | null;
  onOpenModal: () => void;
  style?: StyleProp<ViewStyle>;
}

export const FitnessComparisonCard: React.FC<FitnessComparisonCardProps> = ({
  evaluation,
  onOpenModal,
  style,
}) => {
  const { colors, borderRadius, isDark } = useTheme();

  if (!evaluation) {
    return null;
  }

  const {
    exerciseName,
    hasReliableData,
    enteredPerformance,
    bodyweightKg,
    relativeStrengthRatio,
    referenceGroup,
    performanceValueType,
    dataVerificationStatus,
    contextualObservation,
    insufficientDataMessage,
  } = evaluation;

  const getCohortBadgeVariant = (): 'neutral' | 'emerald' | 'cyan' => {
    if (!hasReliableData) return 'neutral';
    if (evaluation.referenceGroup.toLowerCase().includes('general population')) return 'emerald';
    return 'cyan';
  };

  const getVerificationBadgeVariant = (): 'emerald' | 'amber' => {
    return dataVerificationStatus === 'VERIFIED_WORKOUT_DATA' ? 'emerald' : 'amber';
  };

  const getValueTypeLabel = () => {
    switch (performanceValueType) {
      case 'TESTED_1RM':
        return 'TESTED 1RM';
      case 'ESTIMATED_1RM':
        return 'ESTIMATED 1RM (EPLEY ≤10)';
      case 'BODYWEIGHT_REPETITIONS':
        return 'BODYWEIGHT REPS';
      default:
        return 'RECORDED SET';
    }
  };

  return (
    <Card
      style={[
        styles.card,
        {
          borderColor: hasReliableData
            ? isDark
              ? 'rgba(56, 189, 248, 0.25)'
              : 'rgba(14, 165, 233, 0.25)'
            : isDark
            ? 'rgba(239, 68, 68, 0.25)'
            : 'rgba(220, 38, 38, 0.25)',
        },
        style,
      ]}
    >
      {/* Top Banner */}
      <View style={styles.headerRow}>
        <View style={styles.headerTitleContainer}>
          <View style={styles.labelWithIcon}>
            <Ionicons
              name="analytics-outline"
              size={14}
              color={hasReliableData ? colors.accent : colors.textMuted}
            />
            <Caption
              style={{
                color: hasReliableData ? colors.accent : colors.textMuted,
                fontWeight: '800',
                letterSpacing: 0.8,
                marginLeft: 4,
                fontSize: 10,
              }}
            >
              TRANSPARENT FITNESS COMPARISON
            </Caption>
          </View>
          <Heading level={3} style={{ color: colors.textPrimary, marginTop: 4 }}>
            {exerciseName}
          </Heading>
        </View>

        <TouchableOpacity
          onPress={onOpenModal}
          style={[styles.inspectBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="expand-outline" size={16} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Badges Row */}
      <View style={styles.badgeRow}>
        <Badge
          label={getValueTypeLabel()}
          variant={performanceValueType === 'TESTED_1RM' ? 'emerald' : 'cyan'}
          size="sm"
        />
        <Badge
          label={dataVerificationStatus === 'VERIFIED_WORKOUT_DATA' ? 'VERIFIED DATA' : 'SELF-REPORTED'}
          variant={getVerificationBadgeVariant()}
          size="sm"
        />
        {hasReliableData && (
          <Badge
            label={
              referenceGroup.toLowerCase().includes('general population')
                ? 'GENERAL POPULATION'
                : 'RECREATIONAL TRAINEES'
            }
            variant={getCohortBadgeVariant()}
            size="sm"
          />
        )}
      </View>

      {/* Performance & Ratio Summary */}
      <View style={[styles.statsContainer, { backgroundColor: colors.surface, borderRadius: borderRadius.md }]}>
        <View style={styles.statBox}>
          <Caption style={{ color: colors.textMuted, fontSize: 10 }}>USER PERFORMANCE</Caption>
          <MonoText style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700', marginTop: 2 }}>
            {enteredPerformance.weightKg > 0
              ? `${enteredPerformance.weightKg} kg × ${enteredPerformance.reps}`
              : `${enteredPerformance.reps} reps`}
          </MonoText>
          <Caption style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
            {performanceValueType === 'BODYWEIGHT_REPETITIONS'
              ? 'Bodyweight load'
              : `e1RM: ${enteredPerformance.effective1RmKg} kg`}
          </Caption>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <View style={styles.statBox}>
          <Caption style={{ color: colors.textMuted, fontSize: 10 }}>RELATIVE STRENGTH</Caption>
          <MonoText style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700', marginTop: 2 }}>
            {performanceValueType === 'BODYWEIGHT_REPETITIONS'
              ? `${enteredPerformance.reps} reps`
              : `${relativeStrengthRatio}x BW`}
          </MonoText>
          <Caption style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
            At {bodyweightKg} kg mass
          </Caption>
        </View>
      </View>

      {/* Cohort Observation or Insufficient Data State */}
      {hasReliableData && contextualObservation ? (
        <View style={[styles.normBox, { backgroundColor: colors.surfaceMuted, borderRadius: borderRadius.md }]}>
          <View style={styles.normHeader}>
            <Ionicons name="people-outline" size={16} color={colors.accent} />
            <Text style={{ color: colors.textPrimary, fontWeight: '700', marginLeft: 6, fontSize: 13 }}>
              {contextualObservation.tierName}
            </Text>
            <View style={{ flex: 1 }} />
            <Caption style={{ color: colors.textSecondary, fontSize: 11 }}>
              {contextualObservation.percentileBand}
            </Caption>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4, lineHeight: 16 }}>
            {contextualObservation.description}
          </Text>
        </View>
      ) : (
        <View
          style={[
            styles.insufficientBox,
            {
              backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : 'rgba(254, 226, 226, 0.6)',
              borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)',
              borderRadius: borderRadius.md,
            },
          ]}
        >
          <View style={styles.insufficientHeader}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.error || '#EF4444'} />
            <Text
              style={{
                color: colors.error || '#EF4444',
                fontWeight: '700',
                marginLeft: 6,
                fontSize: 13,
              }}
            >
              {insufficientDataMessage || 'Not enough reliable data for this comparison.'}
            </Text>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4, lineHeight: 15 }}>
            ASCEND enforces strict scientific integrity: we will never simulate fake population percentiles or
            fabricate world rankings without peer-reviewed epidemiological cohorts.
          </Text>
        </View>
      )}

      {/* Action to open full dossier */}
      <TouchableOpacity
        onPress={onOpenModal}
        style={[
          styles.actionButton,
          {
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
            borderColor: colors.border,
            borderRadius: borderRadius.md,
          },
        ]}
      >
        <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: '600' }}>
          View Full Transparency Dossier (11 Points)
        </Text>
        <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
      </TouchableOpacity>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderWidth: 1,
    marginVertical: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerTitleContainer: {
    flex: 1,
    marginRight: 8,
  },
  labelWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inspectBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  statsContainer: {
    flexDirection: 'row',
    marginTop: 12,
    padding: 10,
  },
  statBox: {
    flex: 1,
  },
  divider: {
    width: 1,
    marginHorizontal: 12,
  },
  normBox: {
    padding: 10,
    marginTop: 10,
  },
  normHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  insufficientBox: {
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
  },
  insufficientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    marginTop: 12,
  },
});
