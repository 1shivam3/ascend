import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Modal, TouchableOpacity, Animated } from 'react-native';
import { THEME } from '../../constants/theme';
import { BackgroundLayer } from '../layout/BackgroundLayer';
import { Heading, Text, Caption, MonoText } from '../ui/Typography';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { SubtleContainer } from '../ui/SubtleContainer';
import { QuoteEngine } from '../../services/quotes/QuoteEngine';
import { RankTier } from '../../config/progression.config';

export interface RankUpModalProps {
  visible: boolean;
  oldRank: RankTier;
  newRank: RankTier;
  rankTitle?: string;
  rankColor?: string;
  onDismiss: () => void;
}

export const RankUpModal: React.FC<RankUpModalProps> = ({
  visible,
  oldRank,
  newRank,
  rankTitle = 'OPERATIVE ASCENT',
  rankColor = THEME.colors.cyan,
  onDismiss,
}) => {
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 7,
          tension: 35,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.85);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  if (!visible) return null;

  const quote = QuoteEngine.getQuote('RANK_UP');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <BackgroundLayer theme="ECLIPSE" intensity={0.15} />

        <Animated.View
          style={[
            styles.cardContainer,
            {
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
            },
          ]}
        >
          <SubtleContainer accentBorder={rankColor} style={styles.card}>
            {/* Crown Icon */}
            <View style={[styles.emblemBox, { borderColor: rankColor }]}>
              <Text style={styles.emblemIcon}>👑</Text>
            </View>

            <MonoText style={[styles.headerSubtitle, { color: rankColor }]}>
              RANK ASCENSION PROTOCOL
            </MonoText>
            <Heading level={1} style={styles.headerTitle}>
              {rankTitle.toUpperCase()}
            </Heading>

            {/* Old Rank ➔ New Rank */}
            <View style={styles.rankRow}>
              <View style={styles.rankPill}>
                <Caption style={styles.rankLabel}>FORMER</Caption>
                <MonoText style={styles.oldRankText}>{oldRank}</MonoText>
              </View>

              <View style={styles.arrowBox}>
                <Text style={[styles.arrowText, { color: rankColor }]}>➔</Text>
              </View>

              <View style={[styles.rankPill, styles.newRankPill, { borderColor: rankColor }]}>
                <Caption style={[styles.rankLabel, { color: rankColor }]}>ASCENDED</Caption>
                <MonoText style={[styles.newRankText, { color: rankColor }]}>{newRank}</MonoText>
              </View>
            </View>

            {/* Badges */}
            <View style={styles.badgesRow}>
              <Badge label="TIER UNLOCKED" variant="cyan" size="md" />
              <Badge label="GLOBAL STATUS UPDATED" variant="emerald" size="md" />
            </View>

            {/* Quote */}
            <View style={[styles.quoteBox, { borderLeftColor: rankColor }]}>
              <Text style={styles.quoteText}>"{quote.text}"</Text>
              <Caption style={styles.quoteAuthor}>— ASCEND CODE</Caption>
            </View>

            {/* CTA */}
            <Button
              title="ASCEND TO NEW RANK →"
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
    backgroundColor: 'rgba(8, 9, 12, 0.94)',
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
  emblemBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0, 229, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    marginBottom: 8,
  },
  emblemIcon: {
    fontSize: 26,
  },
  headerSubtitle: {
    fontSize: 9,
    letterSpacing: 1.5,
    fontWeight: '900',
  },
  headerTitle: {
    letterSpacing: 2,
    color: THEME.colors.textPrimary,
    marginTop: 2,
    textAlign: 'center',
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginVertical: THEME.spacing.md,
    width: '100%',
  },
  rankPill: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    minWidth: 90,
  },
  newRankPill: {
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
  },
  rankLabel: {
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: '800',
    color: THEME.colors.textMuted,
  },
  oldRankText: {
    fontSize: 32,
    fontWeight: '900',
    color: THEME.colors.textMuted,
    marginTop: 2,
  },
  arrowBox: {
    paddingHorizontal: 4,
  },
  arrowText: {
    fontSize: 24,
    fontWeight: '900',
  },
  newRankText: {
    fontSize: 36,
    fontWeight: '900',
    marginTop: 2,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: THEME.spacing.sm,
  },
  quoteBox: {
    backgroundColor: THEME.colors.background,
    borderRadius: THEME.borderRadius.sharp,
    padding: 12,
    borderLeftWidth: 2,
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
