import React from 'react';
import { View, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { THEME } from '../../constants/theme';
import { BackgroundLayer } from '../layout/BackgroundLayer';
import { Heading, Text, Caption, MonoText } from '../ui/Typography';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { SubtleContainer } from '../ui/SubtleContainer';
import { QuoteEngine } from '../../services/quotes/QuoteEngine';

export interface MissedQuestModalProps {
  visible: boolean;
  onDismiss: () => void;
  onRecalibrate?: () => void;
}

export const MissedQuestModal: React.FC<MissedQuestModalProps> = ({
  visible,
  onDismiss,
  onRecalibrate,
}) => {
  if (!visible) return null;

  const quote = QuoteEngine.getQuote('DIFFICULT_DAYS');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <BackgroundLayer theme="STORM" intensity={0.12} />

        <View style={styles.cardContainer}>
          <SubtleContainer accentBorder={THEME.colors.blue} style={styles.card}>
            {/* Header Icon */}
            <View style={styles.iconCircle}>
              <Text style={styles.iconText}>🛡️</Text>
            </View>

            <MonoText style={styles.headerSubtitle}>TACTICAL RESET PROTOCOL</MonoText>
            <Heading level={1} style={styles.headerTitle}>
              TRAINING RECALIBRATION
            </Heading>

            {/* Supportive Message Box */}
            <View style={styles.supportBox}>
              <Text style={styles.supportTitle}>Every Hunter Needs Recovery</Text>
              <Caption style={styles.supportDesc}>
                A missed deployment is not a failure — it is physiological adaptation. Rest allows
                connective tissue and nervous systems to supercompensate.
              </Caption>
            </View>

            {/* Recalibration Recommendations */}
            <View style={styles.recommendationsList}>
              <View style={styles.recItem}>
                <Text style={styles.recBullet}>›</Text>
                <Text style={styles.recText}>Prioritize 8+ hours deep sleep & hydration</Text>
              </View>
              <View style={styles.recItem}>
                <Text style={styles.recBullet}>›</Text>
                <Text style={styles.recText}>Perform 10 min mobility & joint decompression</Text>
              </View>
              <View style={styles.recItem}>
                <Text style={styles.recBullet}>›</Text>
                <Text style={styles.recText}>Next session will auto-scale to your current state</Text>
              </View>
            </View>

            {/* Quote */}
            <View style={styles.quoteBox}>
              <Text style={styles.quoteText}>"{quote.text}"</Text>
              <Caption style={styles.quoteAuthor}>— ASCEND CODE</Caption>
            </View>

            {/* Action Buttons */}
            <Button
              title="RECALIBRATE & ADVANCE →"
              variant="primary"
              size="lg"
              onPress={() => {
                if (onRecalibrate) onRecalibrate();
                onDismiss();
              }}
              style={styles.actionBtn}
            />
          </SubtleContainer>
        </View>
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
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 112, 243, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: THEME.colors.blue,
    marginBottom: 8,
  },
  iconText: {
    fontSize: 22,
  },
  headerSubtitle: {
    fontSize: 9,
    letterSpacing: 1.5,
    color: THEME.colors.blue,
    fontWeight: '900',
  },
  headerTitle: {
    letterSpacing: 1.5,
    color: THEME.colors.textPrimary,
    marginTop: 2,
    textAlign: 'center',
  },
  supportBox: {
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.sharp,
    padding: 12,
    marginVertical: THEME.spacing.md,
    width: '100%',
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  supportTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 4,
  },
  supportDesc: {
    color: THEME.colors.textSecondary,
    lineHeight: 17,
  },
  recommendationsList: {
    width: '100%',
    gap: 8,
    marginBottom: THEME.spacing.sm,
  },
  recItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recBullet: {
    color: THEME.colors.cyan,
    fontSize: 14,
    fontWeight: '900',
  },
  recText: {
    fontSize: 12,
    color: THEME.colors.textPrimary,
    flex: 1,
  },
  quoteBox: {
    backgroundColor: THEME.colors.background,
    borderRadius: THEME.borderRadius.sharp,
    padding: 12,
    borderLeftWidth: 2,
    borderLeftColor: THEME.colors.blue,
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
