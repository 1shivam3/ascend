import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../constants/theme';
import { Heading, Text, Caption, MonoText } from '../ui/Typography';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { CategorizedPrsResult, CategorizedPrItem } from '../../services/progress/ProgressAnalyticsService';

interface CategorizedPRsViewProps {
  prsResult: CategorizedPrsResult | null;
  onSelectPr?: (pr: CategorizedPrItem) => void;
}

type PRCategoryTab = 'TESTED_1RM' | 'ESTIMATED_1RM' | 'BEST_WORKING_SET' | 'REPETITION_PR' | 'VOLUME_PR';

const CATEGORIES: { id: PRCategoryTab; label: string; badge: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'TESTED_1RM', label: 'Tested 1RM', badge: 'TESTED', icon: 'shield-checkmark-outline' },
  { id: 'ESTIMATED_1RM', label: 'Est. 1RM', badge: 'ESTIMATED', icon: 'calculator-outline' },
  { id: 'BEST_WORKING_SET', label: 'Best Set', badge: 'WORKING', icon: 'barbell-outline' },
  { id: 'REPETITION_PR', label: 'Rep PR', badge: 'REPS', icon: 'repeat-outline' },
  { id: 'VOLUME_PR', label: 'Volume PR', badge: 'TONNAGE', icon: 'layers-outline' },
];

export const CategorizedPRsView: React.FC<CategorizedPRsViewProps> = ({
  prsResult,
  onSelectPr,
}) => {
  const { colors, borderRadius, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState<PRCategoryTab>('TESTED_1RM');

  const getListForTab = (): CategorizedPrItem[] => {
    if (!prsResult) return [];
    switch (activeTab) {
      case 'TESTED_1RM':
        return prsResult.tested1Rm;
      case 'ESTIMATED_1RM':
        return prsResult.estimated1Rm;
      case 'BEST_WORKING_SET':
        return prsResult.bestWorkingSet;
      case 'REPETITION_PR':
        return prsResult.repetitionPr;
      case 'VOLUME_PR':
        return prsResult.volumePr;
      default:
        return [];
    }
  };

  const list = getListForTab();
  const currentCategory = CATEGORIES.find((c) => c.id === activeTab)!;

  return (
    <View style={styles.container}>
      {/* Category Pills Header */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsScroll}
      >
        {CATEGORIES.map((cat) => {
          const isSelected = activeTab === cat.id;
          let count = 0;
          if (prsResult) {
            if (cat.id === 'TESTED_1RM') count = prsResult.tested1Rm.length;
            else if (cat.id === 'ESTIMATED_1RM') count = prsResult.estimated1Rm.length;
            else if (cat.id === 'BEST_WORKING_SET') count = prsResult.bestWorkingSet.length;
            else if (cat.id === 'REPETITION_PR') count = prsResult.repetitionPr.length;
            else if (cat.id === 'VOLUME_PR') count = prsResult.volumePr.length;
          }

          return (
            <TouchableOpacity
              key={cat.id}
              onPress={() => {
                setActiveTab(cat.id);
                Haptics.selectionAsync();
              }}
              style={[
                styles.tabPill,
                {
                  backgroundColor: isSelected
                    ? isDark
                      ? colors.cyan
                      : colors.primary
                    : colors.surface,
                  borderColor: isSelected ? 'transparent' : colors.border,
                  borderRadius: borderRadius.full,
                },
              ]}
              activeOpacity={0.75}
            >
              <Ionicons
                name={cat.icon}
                size={13}
                color={isSelected ? (isDark ? '#000000' : '#FFFFFF') : colors.textSecondary}
              />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: isSelected ? '700' : '500',
                  color: isSelected ? (isDark ? '#000000' : '#FFFFFF') : colors.textSecondary,
                }}
              >
                {cat.label} {count > 0 ? `(${count})` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Category Explanation Banner */}
      <View style={[styles.banner, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC', borderRadius: borderRadius.sm }]}>
        <Caption style={{ color: colors.textSecondary, fontSize: 11 }}>
          {activeTab === 'TESTED_1RM' && 'Single repetition performed at high exertion (RPE ≥ 8.5). Directly tested maximal output.'}
          {activeTab === 'ESTIMATED_1RM' && 'Calculated via Epley formula from submaximal sets strictly capped at ≤ 10 reps.'}
          {activeTab === 'BEST_WORKING_SET' && 'Heaviest submaximal multi-rep working set load achieved in completed training.'}
          {activeTab === 'REPETITION_PR' && 'Max repetitions completed in a single set for this movement.'}
          {activeTab === 'VOLUME_PR' && 'Highest total single-set tonnage load (weight × reps).'}
        </Caption>
      </View>

      {/* PR Items List */}
      {list.length === 0 ? (
        <Card variant="surface" style={styles.emptyBox}>
          <Ionicons name="trophy-outline" size={30} color={colors.textMuted} style={{ marginBottom: 6 }} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textSecondary }}>
            No {currentCategory.label}s Logged Yet
          </Text>
          <Caption style={{ color: colors.textMuted, textAlign: 'center', marginTop: 3 }}>
            {activeTab === 'TESTED_1RM'
              ? 'Log a heavy 1-rep attempt at RPE ≥ 8.5 to establish a verified tested 1RM.'
              : 'Complete workout sets to establish verified personal records in this category.'}
          </Caption>
        </Card>
      ) : (
        <View style={styles.prList}>
          {list.map((pr) => (
            <TouchableOpacity
              key={pr.id}
              activeOpacity={0.8}
              onPress={() => onSelectPr && onSelectPr(pr)}
            >
              <Card variant="surface" style={styles.prCard}>
                <View style={styles.prLeft}>
                  <View
                    style={[
                      styles.iconCircle,
                      {
                        backgroundColor: `${colors.amber}18`,
                        borderRadius: borderRadius.sm,
                      },
                    ]}
                  >
                    <Ionicons name="trophy" size={16} color={colors.amber} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>
                      {pr.exerciseName}
                    </Text>
                    <Caption style={{ color: colors.textMuted, fontSize: 11 }}>
                      {new Date(pr.achievedAt).toLocaleDateString()} • {pr.details}
                    </Caption>
                  </View>
                </View>

                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <MonoText style={{ fontSize: 16, fontWeight: '800', color: colors.amber }}>
                    {pr.value} {pr.unit}
                  </MonoText>
                  <Badge
                    label={pr.isDirectlyRecorded ? 'TESTED' : 'FORMULA'}
                    variant={pr.isDirectlyRecorded ? 'emerald' : 'amber'}
                    size="sm"
                  />
                </View>
              </Card>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  tabsScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
  },
  banner: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
  },
  emptyBox: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prList: {
    gap: 8,
    marginTop: 4,
  },
  prCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  prLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconCircle: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
