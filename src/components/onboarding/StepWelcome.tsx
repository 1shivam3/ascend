import React from 'react';
import { View, StyleSheet } from 'react-native';
import { THEME } from '../../constants/theme';
import { Heading, Text, Caption } from '../ui/Typography';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';

interface Props {
  onNext: () => void;
}

export function StepWelcome({ onNext }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.badgeRow}>
        <Badge label="ASCEND // SYSTEM CORE" variant="cyan" size="md" dot />
      </View>

      <View style={styles.heroBox}>
        <View style={styles.insigniaOuter}>
          <Heading level={1} style={styles.insigniaIcon}>⚔️</Heading>
        </View>
        <Heading level={1} color={THEME.colors.cyan} style={styles.title}>
          ASCEND
        </Heading>
        <Caption upper style={styles.subtitle}>
          ATHLETIC RPG PROTOCOL
        </Caption>
      </View>

      <Card variant="glass" accentBorder={THEME.colors.cyan} style={styles.manifestoCard}>
        <Heading level={3} style={styles.cardHeader}>
          TRAIN IN REALITY. LEVEL UP IN ASCEND.
        </Heading>
        <Text color={THEME.colors.textSecondary} style={styles.manifestoText}>
          Every set logged, every kilogram lifted, and every personal record broken fuels your character progression.
        </Text>
        <Text color={THEME.colors.textSecondary} style={styles.manifestoText}>
          We will calibrate your baseline biometrics, training split, and tactical directives.
        </Text>

        <View style={styles.featureGrid}>
          <View style={styles.featureItem}>
            <Text color={THEME.colors.cyan} style={styles.featureBullet}>◆</Text>
            <Caption>Deterministic 1RM & Mastery</Caption>
          </View>
          <View style={styles.featureItem}>
            <Text color={THEME.colors.amber} style={styles.featureBullet}>◆</Text>
            <Caption>5 Tactical RPG Attributes</Caption>
          </View>
          <View style={styles.featureItem}>
            <Text color={THEME.colors.emerald} style={styles.featureBullet}>◆</Text>
            <Caption>Offline-First Local Storage</Caption>
          </View>
        </View>
      </Card>

      <View style={styles.footer}>
        <Button
          title="COMMENCE INITIALIZATION →"
          variant="primary"
          size="lg"
          onPress={onNext}
        />
        <Caption align="center" style={styles.disclaimer}>
          Calibrating biometrics and physical programming for your operative profile.
        </Caption>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: THEME.spacing.md,
  },
  badgeRow: {
    alignItems: 'center',
    marginBottom: THEME.spacing.sm,
  },
  heroBox: {
    alignItems: 'center',
    marginVertical: THEME.spacing.md,
  },
  insigniaOuter: {
    width: 84,
    height: 84,
    borderRadius: 20,
    backgroundColor: THEME.colors.surfaceElevated,
    borderWidth: 2,
    borderColor: THEME.colors.cyan,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: THEME.spacing.sm,
  },
  insigniaIcon: {
    fontSize: 40,
  },
  title: {
    fontSize: 34,
    letterSpacing: 6,
    fontWeight: '900',
  },
  subtitle: {
    letterSpacing: 3,
    color: THEME.colors.textMuted,
    marginTop: 4,
  },
  manifestoCard: {
    padding: THEME.spacing.lg,
    marginVertical: THEME.spacing.md,
  },
  cardHeader: {
    marginBottom: THEME.spacing.xs,
    fontSize: 15,
    letterSpacing: 1,
  },
  manifestoText: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 8,
  },
  featureGrid: {
    marginTop: THEME.spacing.sm,
    gap: 8,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureBullet: {
    fontSize: 12,
  },
  footer: {
    marginTop: THEME.spacing.lg,
    gap: 12,
  },
  disclaimer: {
    color: THEME.colors.textMuted,
  },
});
