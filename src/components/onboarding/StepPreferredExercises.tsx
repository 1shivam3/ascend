import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { THEME } from '../../constants/theme';
import { Heading, Text, Caption } from '../ui/Typography';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { STARTER_EXERCISES } from '../../constants/exercises';

interface Props {
  selectedIds: string[];
  onToggle: (id: string) => void;
  onSetAll: (ids: string[]) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepPreferredExercises({ selectedIds, onToggle, onSetAll, onNext, onBack }: Props) {
  const [search, setSearch] = useState('');

  const filtered = STARTER_EXERCISES.filter(ex =>
    ex.name.toLowerCase().includes(search.toLowerCase()) ||
    ex.primaryMuscle.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 15);

  const bigFourIds = [
    'ex-barbell-bench-press',
    'ex-barbell-back-squat',
    'ex-conventional-barbell-deadlift',
    'ex-overhead-press',
  ];

  return (
    <View style={styles.container}>
      <View style={{ flex: 1 }}>
        <Heading level={2} style={styles.header}>PREFERRED MOVEMENTS</Heading>
        <Caption style={styles.sub}>
          Star exercises you want prioritized in your generated routine and character mastery tree.
        </Caption>

        {/* Search & Quick Action Bar */}
        <View style={styles.filterRow}>
          <TextInput
            placeholder="Search exercises (e.g. Bench, Squat, Row)..."
            placeholderTextColor={THEME.colors.textMuted}
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
          />
          <TouchableOpacity
            onPress={() => onSetAll(bigFourIds)}
            style={styles.quickSelectBtn}
          >
            <Caption color={THEME.colors.cyan}>+ THE BIG 4</Caption>
          </TouchableOpacity>
        </View>

        <View style={styles.counterRow}>
          <Caption upper>{selectedIds.length} MOVEMENTS STARRED</Caption>
          <Caption color={THEME.colors.cyan}>TAP TO TOGGLE</Caption>
        </View>

        {/* Scrollable List */}
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {filtered.map(ex => {
            const isSelected = selectedIds.includes(ex.id);
            return (
              <TouchableOpacity
                key={ex.id}
                activeOpacity={0.8}
                onPress={() => onToggle(ex.id)}
              >
                <Card
                  variant={isSelected ? 'elevated' : 'surface'}
                  accentBorder={isSelected ? THEME.colors.cyan : undefined}
                  style={[styles.card, isSelected && styles.cardActive]}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.titleArea}>
                      <Text style={[styles.exName, isSelected && { color: THEME.colors.cyan }]}>
                        {ex.name}
                      </Text>
                      <Caption color={THEME.colors.textMuted}>
                        {ex.primaryMuscle} • {ex.equipment}
                      </Caption>
                    </View>
                    <Badge
                      label={isSelected ? '★ STARRED' : 'ADD'}
                      variant={isSelected ? 'cyan' : 'neutral'}
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
  quickSelectBtn: {
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
  cardActive: {
    backgroundColor: THEME.colors.surfaceElevated,
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
  footerRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: THEME.spacing.md,
  },
});
