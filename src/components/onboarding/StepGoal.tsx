import React from 'react';
import { View, StyleSheet, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { THEME } from '../../constants/theme';
import { Heading, Text, Caption, MonoText } from '../ui/Typography';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { PrimaryGoal } from '../../types/domain.types';
import { normalizeGoal } from '../../utils/validation/onboardingSchema';

interface Props {
  selectedGoal: string;
  selectedSecondaryGoals?: PrimaryGoal[];
  customGoalDescription?: string;
  sportName?: string;
  onSelect: (goal: string) => void;
  onSelectSecondary?: (goals: PrimaryGoal[]) => void;
  onUpdateCustomGoal?: (desc: string) => void;
  onUpdateSportName?: (sport: string) => void;
  onNext: () => void;
  onBack: () => void;
}

interface GoalOption {
  id: PrimaryGoal;
  title: string;
  glyph: string;
  description: string;
  attributeTag: string;
  accentColor: string;
}

const ALL_PRIMARY_GOAL_OPTIONS: GoalOption[] = [
  {
    id: 'BUILD_MUSCLE',
    title: 'Build Muscle',
    glyph: '⚔️',
    description: 'Volume, muscle hypertrophy, and structural symmetry across optimal 8-12 rep ranges.',
    attributeTag: '+STRENGTH // +VITALITY',
    accentColor: THEME.colors.violet,
  },
  {
    id: 'GET_STRONGER',
    title: 'Get Stronger',
    glyph: '⚡',
    description: 'Maximal force production, compound strength progression, and high neuromuscular tension.',
    attributeTag: '+STRENGTH // +DISCIPLINE',
    accentColor: THEME.colors.cyan,
  },
  {
    id: 'ATHLETIC_PERFORMANCE',
    title: 'Athletic Performance',
    glyph: '🐺',
    description: 'Explosive power, bar speed, unilateral stability, carries, and jump capacity.',
    attributeTag: '+AGILITY // +STAMINA',
    accentColor: THEME.colors.amber,
  },
  {
    id: 'CALISTHENICS',
    title: 'Calisthenics',
    glyph: '🤸',
    description: 'Relative bodyweight mastery, strict pull-ups, dips, handstands, and gymnastic lever skills.',
    attributeTag: '+AGILITY // +STRENGTH',
    accentColor: THEME.colors.cyan,
  },
  {
    id: 'ENDURANCE',
    title: 'Endurance',
    glyph: '🛡️',
    description: 'Aerobic engine progression, distance, pace, high repetition thresholds, and stamina.',
    attributeTag: '+STAMINA // +VITALITY',
    accentColor: THEME.colors.emerald,
  },
  {
    id: 'LOSE_FAT',
    title: 'Lose Fat',
    glyph: '🔥',
    description: 'High work density, metabolic conditioning, compound circuits, and caloric output.',
    attributeTag: '+STAMINA // +DISCIPLINE',
    accentColor: THEME.colors.crimson,
  },
  {
    id: 'SPORT_PERFORMANCE',
    title: 'Sport Performance',
    glyph: '🎯',
    description: 'Sport-specific kinetic readiness, multi-planar deceleration, agility, and rotational drive.',
    attributeTag: '+AGILITY // +STAMINA',
    accentColor: THEME.colors.amber,
  },
  {
    id: 'GENERAL_FITNESS',
    title: 'General Fitness',
    glyph: '⚖️',
    description: 'Harmonious hybrid balance across compound strength, mobility, and cardiovascular health.',
    attributeTag: '+ALL ATTRIBUTES',
    accentColor: THEME.colors.emerald,
  },
  {
    id: 'CUSTOM',
    title: 'Custom Protocol',
    glyph: '⚙️',
    description: 'Tailored training directives and custom focus parameters for unique training goals.',
    attributeTag: '+CUSTOM MATRIX',
    accentColor: THEME.colors.textSecondary,
  },
];

export function StepGoal({
  selectedGoal,
  selectedSecondaryGoals = [],
  customGoalDescription = '',
  sportName = '',
  onSelect,
  onSelectSecondary,
  onUpdateCustomGoal,
  onUpdateSportName,
  onNext,
  onBack,
}: Props) {
  const normalizedSelected = normalizeGoal(selectedGoal);

  const toggleSecondaryGoal = (goal: PrimaryGoal) => {
    if (!onSelectSecondary) return;
    if (selectedSecondaryGoals.includes(goal)) {
      onSelectSecondary(selectedSecondaryGoals.filter(g => g !== goal));
    } else {
      onSelectSecondary([...selectedSecondaryGoals, goal]);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Heading level={2} style={styles.header}>PRIMARY DIRECTIVE</Heading>
        <Caption style={styles.sub}>
          Select your primary discipline. This configures progression curves, workout templates, and KPI telemetry.
        </Caption>

        <View style={styles.goalList}>
          {ALL_PRIMARY_GOAL_OPTIONS.map(g => {
            const isSelected = normalizedSelected === g.id;
            return (
              <TouchableOpacity
                key={g.id}
                activeOpacity={0.8}
                onPress={() => onSelect(g.id)}
              >
                <Card
                  variant={isSelected ? 'elevated' : 'surface'}
                  accentBorder={isSelected ? g.accentColor : undefined}
                  style={[styles.goalCard, isSelected && styles.goalCardSelected]}
                >
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.titleWithIcon}>
                      <Heading level={2} style={styles.glyph}>{g.glyph}</Heading>
                      <Heading level={3} color={isSelected ? g.accentColor : THEME.colors.textPrimary}>
                        {g.title}
                      </Heading>
                    </View>
                    {isSelected && <Badge label="PRIMARY" variant="cyan" size="sm" dot />}
                  </View>
                  <Text color={THEME.colors.textSecondary} style={styles.desc}>
                    {g.description}
                  </Text>
                  <Caption color={g.accentColor} style={styles.tag}>
                    {g.attributeTag}
                  </Caption>
                </Card>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Dynamic Contextual Inputs */}
        {normalizedSelected === 'SPORT_PERFORMANCE' && (
          <View style={styles.customSection}>
            <MonoText color={THEME.colors.amber} style={styles.customLabel}>
              TARGET SPORT / ATHLETIC DISCIPLINE
            </MonoText>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Basketball, Rugby, BJJ, Boxing, Tennis"
              placeholderTextColor={THEME.colors.textMuted}
              value={sportName}
              onChangeText={onUpdateSportName}
            />
          </View>
        )}

        {normalizedSelected === 'CUSTOM' && (
          <View style={styles.customSection}>
            <MonoText color={THEME.colors.cyan} style={styles.customLabel}>
              CUSTOM PROTOCOL DIRECTIVES
            </MonoText>
            <TextInput
              style={[styles.textInput, styles.textAreaInput]}
              placeholder="Describe your training goals, specific focus areas, or constraints..."
              placeholderTextColor={THEME.colors.textMuted}
              multiline
              numberOfLines={3}
              value={customGoalDescription}
              onChangeText={onUpdateCustomGoal}
            />
          </View>
        )}

        {/* Secondary Goals Section */}
        <View style={styles.secondarySection}>
          <Heading level={3} style={styles.secondaryHeader}>SECONDARY GOALS (OPTIONAL)</Heading>
          <Caption style={styles.secondarySub}>
            Augment your primary directive with complementary athletic attributes.
          </Caption>
          <View style={styles.chipsRow}>
            {ALL_PRIMARY_GOAL_OPTIONS.filter(g => g.id !== normalizedSelected).map(g => {
              const isChipSelected = selectedSecondaryGoals.includes(g.id);
              return (
                <TouchableOpacity
                  key={g.id}
                  activeOpacity={0.7}
                  onPress={() => toggleSecondaryGoal(g.id)}
                  style={[
                    styles.chip,
                    isChipSelected && styles.chipSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      isChipSelected && { color: THEME.colors.cyan, fontWeight: '700' },
                    ]}
                  >
                    {g.glyph} {g.title}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <View style={styles.footerRow}>
        <Button title="← BACK" variant="ghost" onPress={onBack} style={{ flex: 1 }} />
        <Button title="CONFIRM GOALS →" variant="primary" onPress={onNext} style={{ flex: 2 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: THEME.spacing.sm,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  sub: {
    marginBottom: THEME.spacing.md,
    lineHeight: 18,
  },
  goalList: {
    gap: 10,
  },
  goalCard: {
    padding: 12,
  },
  goalCardSelected: {
    backgroundColor: THEME.colors.surfaceElevated,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  glyph: {
    fontSize: 20,
  },
  desc: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 6,
  },
  tag: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  customSection: {
    marginTop: 16,
    padding: 12,
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
  },
  customLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: 1,
  },
  textInput: {
    backgroundColor: THEME.colors.surface,
    borderColor: THEME.colors.borderSubtle,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: THEME.colors.textPrimary,
    fontSize: 14,
  },
  textAreaInput: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  secondarySection: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.borderSubtle,
  },
  secondaryHeader: {
    fontSize: 14,
    letterSpacing: 1,
    marginBottom: 4,
  },
  secondarySub: {
    marginBottom: 12,
    fontSize: 12,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: THEME.colors.surface,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
  },
  chipSelected: {
    backgroundColor: THEME.colors.surfaceElevated,
    borderColor: THEME.colors.cyan,
  },
  chipText: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: THEME.spacing.md,
  },
});
