import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { THEME } from '../../constants/theme';
import { Heading, Text, Caption } from '../ui/Typography';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { TrainingLocation } from '../../utils/validation/onboardingSchema';

interface Props {
  selectedLocation: TrainingLocation;
  onSelect: (location: TrainingLocation) => void;
  onNext: () => void;
  onBack: () => void;
}

interface LocationOption {
  id: TrainingLocation;
  title: string;
  glyph: string;
  desc: string;
  envTag: string;
}

const LOCATIONS: LocationOption[] = [
  {
    id: 'COMMERCIAL_GYM',
    title: 'Commercial Fitness Center',
    glyph: '🏢',
    desc: 'Standard athletic club with power cages, platforms, cable systems, and complete plate inventories.',
    envTag: 'FULL SPECTRUM ACCESS',
  },
  {
    id: 'HOME_GYM',
    title: 'Garage / Home Facility',
    glyph: '🏠',
    desc: 'Dedicated private gym with squatrack, barbell, bench, and customizable personal implements.',
    envTag: 'AUTONOMOUS BASE',
  },
  {
    id: 'OUTDOORS',
    title: 'Calisthenics / Outdoor Field',
    glyph: '🌲',
    desc: 'Public parks, pull-up rigs, parallel bars, weighted vests, and open athletic tracks.',
    envTag: 'NATURAL ENVIRONMENT',
  },
  {
    id: 'BODYWEIGHT_ONLY',
    title: 'Mobile / Bodyweight Focus',
    glyph: '🎒',
    desc: 'Deploy anywhere: hotel rooms, living rooms, and travel destinations without fixed gym hardware.',
    envTag: 'ANYWHERE DEPLOYMENT',
  },
];

export function StepLocation({ selectedLocation, onSelect, onNext, onBack }: Props) {
  return (
    <View style={styles.container}>
      <View>
        <Heading level={2} style={styles.header}>OPERATIONAL BASE</Heading>
        <Caption style={styles.sub}>
          Where will your primary training missions take place?
        </Caption>

        <View style={styles.list}>
          {LOCATIONS.map(loc => {
            const isSelected = selectedLocation === loc.id;
            return (
              <TouchableOpacity
                key={loc.id}
                activeOpacity={0.8}
                onPress={() => onSelect(loc.id)}
              >
                <Card
                  variant={isSelected ? 'elevated' : 'surface'}
                  accentBorder={isSelected ? THEME.colors.cyan : undefined}
                  style={[styles.card, isSelected && styles.cardActive]}
                >
                  <View style={styles.topRow}>
                    <View style={styles.titleGroup}>
                      <Heading level={3} style={styles.glyph}>{loc.glyph}</Heading>
                      <View>
                        <Heading level={3} color={isSelected ? THEME.colors.cyan : THEME.colors.textPrimary}>
                          {loc.title}
                        </Heading>
                        <Caption color={THEME.colors.cyan}>{loc.envTag}</Caption>
                      </View>
                    </View>
                    {isSelected && <Badge label="ACTIVE" variant="cyan" size="sm" dot />}
                  </View>

                  <Text color={THEME.colors.textSecondary} style={styles.desc}>
                    {loc.desc}
                  </Text>
                </Card>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.footerRow}>
        <Button title="← BACK" variant="ghost" onPress={onBack} style={{ flex: 1 }} />
        <Button title="CONFIRM BASE →" variant="primary" onPress={onNext} style={{ flex: 2 }} />
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
    marginBottom: THEME.spacing.md,
    lineHeight: 18,
  },
  list: {
    gap: 10,
  },
  card: {
    padding: 12,
  },
  cardActive: {
    backgroundColor: THEME.colors.surfaceElevated,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  glyph: {
    fontSize: 22,
  },
  desc: {
    fontSize: 12,
    lineHeight: 17,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: THEME.spacing.md,
  },
});
