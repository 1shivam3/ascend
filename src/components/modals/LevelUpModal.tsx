import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Modal, TouchableOpacity, Animated } from 'react-native';
import { THEME } from '../../constants/theme';
import { BackgroundLayer } from '../layout/BackgroundLayer';
import { Heading, Text, Caption, MonoText } from '../ui/Typography';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { SubtleContainer } from '../ui/SubtleContainer';
import { QuoteEngine } from '../../services/quotes/QuoteEngine';

export interface LevelUpModalProps {
  visible: boolean;
  oldLevel: number;
  newLevel: number;
  newXpRequired?: number;
  onDismiss: () => void;
}

export const LevelUpModal: React.FC<LevelUpModalProps> = ({
  visible,
  oldLevel,
  newLevel,
  newXpRequired = 1000,
  onDismiss,
}) => {
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.9);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  if (!visible) return null;

  const quote = QuoteEngine.getQuote('LEVEL_UP');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <BackgroundLayer theme="ASCENSION" intensity={0.12} />

        <Animated.View
          style={[
            styles.cardContainer,
            {
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
            },
          ]}
        >
          <SubtleContainer accentBorder={THEME.colors.cyan} style={styles.card}>
            {/* Header Badge */}
            <View style={styles.header}>
              <View style={styles.iconCircle}>
                <Text style={styles.iconText}>⚡</Text>
              </View>
              <MonoText style={styles.headerSubtitle}>PHYSIOLOGICAL BREAKTHROUGH</MonoText>
              <Heading level={1} style={styles.headerTitle}>
                LEVEL ASCENT
              </Heading>
            </View>

            {/* Level Comparison Display */}
            <View style={styles.levelRow}>
              <View style={styles.levelBox}>
                <Caption style={styles.levelLabel}>PREVIOUS</Caption>
                <MonoText style={styles.oldLevelNum}>LV {oldLevel}</MonoText>
              </View>

              <View style={styles.arrowBox}>
                <Text style={styles.arrowText}>➔</Text>
              </View>

              <View style={[styles.levelBox, styles.newLevelBox]}>
                <Caption style={[styles.levelLabel, { color: THEME.colors.cyan }]}>CURRENT</Caption>
                <MonoText style={styles.newLevelNum}>LV {newLevel}</MonoText>
              </View>
            </View>

            {/* Telemetry Pill */}
            <View style={styles.metaRow}>
              <Badge label={`NEXT TIER: ${newXpRequired} XP`} variant="cyan" size="md" />
              <Badge label="ATTRIBUTES BOOSTED" variant="emerald" size="md" />
            </View>

            {/* Contextual Mentality Quote */}
            <View style={styles.quoteBox}>
              <Text style={styles.quoteText}>"{quote.text}"</Text>
              <Caption style={styles.quoteAuthor}>— ASCEND DOCTRINE</Caption>
            </View>

            {/* Action Button */}
            <Button
              title="CLAIM ASCENSION →"
              variant="primary"
              size="lg"
              onPress={onDismiss}
              style={styles.actionBtn}
            />
          </SubtleContainer>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(8, 9, 12, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: THEME.spacing.lg,
  },
  cardContainer: {
    width: '100%',
    maxWidth: 380,
  },
  card: {
    padding: THEME.spacing.lg,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: THEME.spacing.md,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 229, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: THEME.colors.cyan,
    marginBottom: 8,
  },
  iconText: {
    fontSize: 22,
    color: THEME.colors.cyan,
  },
  headerSubtitle: {
    fontSize: 9,
    letterSpacing: 1.5,
    color: THEME.colors.cyan,
    fontWeight: '900',
  },
  headerTitle: {
    letterSpacing: 2,
    color: THEME.colors.textPrimary,
    marginTop: 2,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginVertical: THEME.spacing.sm,
    width: '100%',
  },
  levelBox: {
    alignItems: 'center',
    padding: 12,
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    minWidth: 90,
  },
  newLevelBox: {
    borderColor: THEME.colors.cyan,
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
  },
  levelLabel: {
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: '800',
    color: THEME.colors.textMuted,
  },
  oldLevelNum: {
    fontSize: 24,
    fontWeight: '900',
    color: THEME.colors.textMuted,
    marginTop: 4,
  },
  arrowBox: {
    paddingHorizontal: 4,
  },
  arrowText: {
    fontSize: 20,
    color: THEME.colors.cyan,
    fontWeight: '900',
  },
  newLevelNum: {
    fontSize: 28,
    fontWeight: '900',
    color: THEME.colors.cyan,
    marginTop: 4,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: THEME.spacing.sm,
  },
  quoteBox: {
    backgroundColor: THEME.colors.background,
    borderRadius: THEME.borderRadius.sharp,
    padding: 12,
    borderLeftWidth: 2,
    borderLeftColor: THEME.colors.cyan,
    marginVertical: THEME.spacing.md,
    width: '100%',
  },
  quoteText: {
    fontSize: 12,
    fontStyle: 'italic',
    color: THEME.colors.textSecondary,
    lineHeight: 18,
    textAlign: 'center',
  },
  quoteAuthor: {
    fontSize: 8,
    letterSpacing: 1,
    color: THEME.colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    fontWeight: '800',
  },
  actionBtn: {
    width: '100%',
    marginTop: THEME.spacing.xs,
  },
});
