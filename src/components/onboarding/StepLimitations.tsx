import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { THEME } from '../../constants/theme';
import { Heading, Text, Caption } from '../ui/Typography';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';

interface Props {
  selectedLimitations: string[];
  onToggle: (limitationId: string) => void;
  onSetNone: () => void;
  onNext: () => void;
  onBack: () => void;
}

interface LimitationItem {
  id: string;
  title: string;
  glyph: string;
  desc: string;
  cautionTag: string;
}

const LIMITATIONS: LimitationItem[] = [
  {
    id: 'NONE',
    title: 'Full Physical Clearance',
    glyph: '✅',
    desc: 'No joint or musculoskeletal restrictions. Cleared for all barbell, compound, and isolation movements.',
    cautionTag: 'UNRESTRICTED MOBILITY',
  },
  {
    id: 'LOWER_BACK',
    title: 'Lumbar Spine Sensitivity',
    glyph: '⚠️',
    desc: 'Avoid heavy spinal compression or unbraced axial loads. Suggest chest-supported rows and belt squats.',
    cautionTag: 'AXIAL LOAD MITIGATION',
  },
  {
    id: 'SHOULDER',
    title: 'Shoulder Joint / Rotator Cuff',
    glyph: '⚠️',
    desc: 'Limit extreme external rotation under load. Prefer neutral grip dumbbell presses and Swiss bars.',
    cautionTag: 'IMPINGEMENT PROTOCOL',
  },
  {
    id: 'KNEE',
    title: 'Patellar Tendon / Meniscus',
    glyph: '⚠️',
    desc: 'Reduce acute knee shear angles. Favor hip-dominant Romanian Deadlifts and box squats.',
    cautionTag: 'KNEE SHEAR MANAGEMENT',
  },
  {
    id: 'WRIST',
    title: 'Wrist / Forearm Strain',
    glyph: '⚠️',
    desc: 'Wrist extension strain. Recommend wrist wraps and ergonomic multi-grip handles.',
    cautionTag: 'ERGONOMIC GRIP FOCUS',
  },
  {
    id: 'ELBOW',
    title: 'Elbow Epicondylitis',
    glyph: '⚠️',
    desc: 'Medial/lateral tendon sensitivity. Replace skull crushers with cable rope pushdowns and neutral pull-ups.',
    cautionTag: 'TENDON RESTORATION',
  },
];

export function StepLimitations({ selectedLimitations, onToggle, onSetNone, onNext, onBack }: Props) {
  const isNone = selectedLimitations.length === 0 || selectedLimitations.includes('NONE');

  return (
    <View style={styles.container}>
      <View>
        <Heading level={2} style={styles.header}>ORTHOPEDIC SCREENING</Heading>
        <Caption style={styles.sub}>
          Flag any joint considerations so the algorithm can prescribe safer movement substitutions.
        </Caption>

        <View style={styles.list}>
          {LIMITATIONS.map(item => {
            const isSelected = item.id === 'NONE' ? isNone : selectedLimitations.includes(item.id);
            const isWarning = item.id !== 'NONE' && isSelected;

            return (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.8}
                onPress={() => (item.id === 'NONE' ? onSetNone() : onToggle(item.id))}
              >
                <Card
                  variant={isSelected ? 'elevated' : 'surface'}
                  accentBorder={isWarning ? THEME.colors.amber : isSelected ? THEME.colors.emerald : undefined}
                  style={[styles.card, isSelected && styles.cardActive]}
                >
                  <View style={styles.topRow}>
                    <View style={styles.titleGroup}>
                      <Heading level={3} style={styles.glyph}>{item.glyph}</Heading>
                      <View>
                        <Heading
                          level={3}
                          color={isWarning ? THEME.colors.amber : isSelected ? THEME.colors.emerald : THEME.colors.textPrimary}
                        >
                          {item.title}
                        </Heading>
                        <Caption color={isWarning ? THEME.colors.amber : THEME.colors.textMuted}>
                          {item.cautionTag}
                        </Caption>
                      </View>
                    </View>
                    <Badge
                      label={isSelected ? 'FLAGGED' : 'CLEAR'}
                      variant={isWarning ? 'amber' : isSelected ? 'emerald' : 'neutral'}
                      size="sm"
                    />
                  </View>

                  <Text color={THEME.colors.textSecondary} style={styles.desc}>
                    {item.desc}
                  </Text>
                </Card>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.footerRow}>
        <Button title="← BACK" variant="ghost" onPress={onBack} style={{ flex: 1 }} />
        <Button title="CONFIRM SCREENING →" variant="primary" onPress={onNext} style={{ flex: 2 }} />
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
    gap: 8,
  },
  card: {
    padding: 10,
  },
  cardActive: {
    backgroundColor: THEME.colors.surfaceElevated,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  glyph: {
    fontSize: 18,
  },
  desc: {
    fontSize: 11,
    lineHeight: 16,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: THEME.spacing.md,
  },
});
