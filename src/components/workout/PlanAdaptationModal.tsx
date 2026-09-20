import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { THEME } from '../../constants/theme';
import { Heading, Text, Caption, MonoText } from '../ui/Typography';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { AIWorkoutPlan, FeedbackType } from '../../services/ai/schemas';
import { WorkoutAdaptationEngine } from '../../services/ai/WorkoutAdaptationEngine';

interface PlanAdaptationModalProps {
  visible: boolean;
  userId: string;
  plan: AIWorkoutPlan | null;
  currentDayNumber?: number;
  onClose: () => void;
  onPlanUpdated: (updatedPlan: AIWorkoutPlan) => void;
}

export const PlanAdaptationModal: React.FC<PlanAdaptationModalProps> = ({
  visible,
  userId,
  plan,
  currentDayNumber = 1,
  onClose,
  onPlanUpdated,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackType | null>(null);

  if (!plan) return null;

  const handleFeedback = async (feedback: FeedbackType) => {
    setSelectedFeedback(feedback);
    setIsProcessing(true);
    try {
      const updated = await WorkoutAdaptationEngine.applySessionFeedback(
        userId,
        plan,
        currentDayNumber,
        feedback
      );
      onPlanUpdated(updated);
      Alert.alert(
        'Telemetry Calibrated',
        `AI adaptation applied to upcoming sessions based on your '${feedback.replace('_', ' ')}' feedback.`
      );
      onClose();
    } catch (err) {
      Alert.alert('Adaptation Error', (err as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAdaptEnvironment = async (mode: 'HOME_WORKOUT' | 'NO_EQUIPMENT') => {
    setIsProcessing(true);
    try {
      const updated = await WorkoutAdaptationEngine.adaptToEnvironment(userId, plan, mode);
      onPlanUpdated(updated);
      Alert.alert(
        'Environment Adapted',
        `Your upcoming training schedule has been calibrated for ${mode.replace('_', ' ')}.`
      );
      onClose();
    } catch (err) {
      Alert.alert('Adaptation Error', (err as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleChangeDifficulty = async (direction: 'EASIER' | 'HARDER') => {
    setIsProcessing(true);
    try {
      const updated = await WorkoutAdaptationEngine.changeDifficulty(userId, plan, direction);
      onPlanUpdated(updated);
      Alert.alert(
        'Difficulty Adjusted',
        `Program volume and intensity have been adjusted ${direction.toLowerCase()}.`
      );
      onClose();
    } catch (err) {
      Alert.alert('Adjustment Error', (err as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal visible={visible} onClose={onClose} title="TACTICAL PROGRAM ADAPTATION">
      <View style={styles.container}>
        {/* Session Feedback Section */}
        <Caption upper style={styles.sectionTitle}>POST-SESSION STIMULUS FEEDBACK</Caption>
        <Caption style={styles.sectionDesc}>
          Calibrate intensity and volume for subsequent cycles based on today's perceived exertion.
        </Caption>

        <View style={styles.feedbackRow}>
          <TouchableOpacity
            style={[styles.feedbackBtn, styles.feedbackEasy]}
            onPress={() => handleFeedback('TOO_EASY')}
            disabled={isProcessing}
          >
            <Text style={styles.feedbackEmoji}>⚡</Text>
            <MonoText style={styles.feedbackText}>TOO EASY</MonoText>
            <Caption style={styles.feedbackSub}>+Load / +Reps</Caption>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.feedbackBtn, styles.feedbackGood]}
            onPress={() => handleFeedback('GOOD')}
            disabled={isProcessing}
          >
            <Text style={styles.feedbackEmoji}>🎯</Text>
            <MonoText style={styles.feedbackText}>GOOD</MonoText>
            <Caption style={styles.feedbackSub}>Standard Curve</Caption>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.feedbackBtn, styles.feedbackHard]}
            onPress={() => handleFeedback('TOO_HARD')}
            disabled={isProcessing}
          >
            <Text style={styles.feedbackEmoji}>🔥</Text>
            <MonoText style={styles.feedbackText}>TOO HARD</MonoText>
            <Caption style={styles.feedbackSub}>-Fatigue / +Rest</Caption>
          </TouchableOpacity>
        </View>

        {/* Tactical Context Adaptations */}
        <Caption upper style={[styles.sectionTitle, { marginTop: THEME.spacing.md }]}>
          ENVIRONMENT & CONTEXT OVERRIDES
        </Caption>

        <View style={styles.actionGrid}>
          <Button
            title="🏠 SWITCH TO HOME WORKOUT"
            variant="secondary"
            size="sm"
            onPress={() => handleAdaptEnvironment('HOME_WORKOUT')}
            disabled={isProcessing}
            style={styles.actionBtn}
          />

          <Button
            title="🤸 NO EQUIPMENT (CALISTHENICS)"
            variant="secondary"
            size="sm"
            onPress={() => handleAdaptEnvironment('NO_EQUIPMENT')}
            disabled={isProcessing}
            style={styles.actionBtn}
          />

          <Button
            title="⚡ INCREASE DIFFICULTY (+RPE)"
            variant="outline"
            size="sm"
            onPress={() => handleChangeDifficulty('HARDER')}
            disabled={isProcessing}
            style={styles.actionBtn}
          />

          <Button
            title="🛡️ REDUCE DIFFICULTY (-SETS)"
            variant="outline"
            size="sm"
            onPress={() => handleChangeDifficulty('EASIER')}
            disabled={isProcessing}
            style={styles.actionBtn}
          />
        </View>

        {isProcessing && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="small" color={THEME.colors.cyan} />
            <Caption color={THEME.colors.cyan} style={{ marginTop: 6 }}>
              APPLYING TACTICAL ADAPTATIONS...
            </Caption>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: THEME.spacing.xs,
  },
  sectionTitle: {
    letterSpacing: 1.5,
    marginBottom: 2,
    fontWeight: '800',
  },
  sectionDesc: {
    fontSize: 11,
    lineHeight: 16,
    marginBottom: THEME.spacing.sm,
  },
  feedbackRow: {
    flexDirection: 'row',
    gap: 8,
  },
  feedbackBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
    alignItems: 'center',
    backgroundColor: THEME.colors.surfaceElevated,
  },
  feedbackEasy: {
    borderColor: THEME.colors.cyan,
  },
  feedbackGood: {
    borderColor: THEME.colors.emerald,
  },
  feedbackHard: {
    borderColor: THEME.colors.amber,
  },
  feedbackEmoji: {
    fontSize: 18,
    marginBottom: 4,
  },
  feedbackText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  feedbackSub: {
    fontSize: 8,
    marginTop: 2,
  },
  actionGrid: {
    gap: 8,
  },
  actionBtn: {
    width: '100%',
  },
  loadingOverlay: {
    alignItems: 'center',
    paddingVertical: 12,
  },
});
