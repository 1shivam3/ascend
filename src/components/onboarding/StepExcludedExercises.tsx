import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { THEME } from '../../constants/theme';
import { Heading, Text, Caption } from '../ui/Typography';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { STARTER_EXERCISES } from '../../constants/exercises';

interface Props {
  excludedIds: string[];
  onToggle: (id: string) => void;
  onClearAll: () => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepExcludedExercises({ excludedIds, onToggle, onClearAll, onNext, onBack }: Props) {
  const [search, setSearch] = useState('');

  const filtered = STARTER_EXERCISES.filter(ex =>
    ex.name.toLowerCase().includes(search.toLowerCase()) ||
    ex.primaryMuscle.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 15);

  return (
    <View style={styles.container}>
      <View style={{ flex: 1 }}>
        <Heading level={2} style={styles.header}>EXCLUDED MOVEMENTS</Heading>
        <Caption style={styles.sub}>
          Flag any lifts you want excluded from your routines due to preference or equipment limitations.
        </Caption>

        {/* Search & Clear Bar */}
        <View style={styles.filterRow}>
          <TextInput
            placeholder="Search exercises to exclude..."
            placeholderTextColor={THEME.colors.textMuted}
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
          />
          {excludedIds.length > 0 && (
            <TouchableOpacity onPress={onClearAll} style={styles.clearBtn}>
              <Caption color={THEME.colors.crimson}>CLEAR</Caption>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.counterRow}>
          <Caption upper>{excludedIds.length} EXERCISES EXCLUDED</Caption>
          <Caption color={THEME.colors.crimson}>RED = OMITTED</Caption>
        </View>

        {/* List */}
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {filtered.map(ex => {
            const isExcluded = excludedIds.includes(ex.id);
            return (
              <TouchableOpacity
                key={ex.id}
                activeOpacity={0.8}
                onPress={() => onToggle(ex.id)}
              >
                <Card
                  variant={isExcluded ? 'elevated' : 'surface'}
                  accentBorder={isExcluded ? THEME.colors.crimson : undefined}
                  style={[styles.card, isExcluded && styles.cardExcluded]}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.titleArea}>
                      <Text style={[styles.exName, isExcluded && styles.exNameExcluded]}>
                        {ex.name}
                      </Text>
                      <Caption color={THEME.colors.textMuted}>
                        {ex.primaryMuscle} • {ex.equipment}
                      </Caption>
                    </View>
                    <Badge
                      label={isExcluded ? '✕ EXCLUDED' : 'ALLOW'}
                      variant={isExcluded ? 'crimson' : 'neutral'}
                      size="sm"
                    />
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.footerRow}>
        <Button title="← BACK" variant="ghost" onPress={onBack} style={{ flex: 1 }} />
        <Button title="CONTINUE →" variant="primary" onPress={onNext} style={{ flex: 2 }} />
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
  header: {
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  sub: {
    marginBottom: THEME.spacing.sm,
    lineHeight: 18,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    paddingHorizontal: 12,
    color: THEME.colors.textPrimary,
    fontSize: 12,
  },
  clearBtn: {
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  counterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  list: {
    maxHeight: 340,
  },
  card: {
    padding: 10,
    marginBottom: 6,
  },
  cardExcluded: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleArea: {
    flex: 1,
  },
  exName: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  exNameExcluded: {
    color: THEME.colors.crimson,
    textDecorationLine: 'line-through',
  },
  footerRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: THEME.spacing.md,
  },
});
