import React from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../constants/theme';
import { useStepStore } from '../../store/useStepStore';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button, PrimaryButton } from '../ui/Button';
import { ProgressBar } from '../ui/ProgressBar';
import { Heading, Text, Caption, MonoText } from '../ui/Typography';
import { SectionHeader } from '../ui/SectionHeader';
import { Divider } from '../ui/Divider';

interface DeviceActivityModalProps {
  visible: boolean;
  onClose: () => void;
}

const GOAL_OPTIONS = [5000, 8000, 10000, 12000, 15000];

export const DeviceActivityModal: React.FC<DeviceActivityModalProps> = ({
  visible,
  onClose,
}) => {
  const { colors, borderRadius, isDark } = useTheme();
  const {
    todaySteps,
    stepGoal,
    sensorStatus,
    progressPercent,
    refreshSteps,
    requestPermission,
    setStepGoal,
  } = useStepStore();

  const getStatusBadge = () => {
    switch (sensorStatus) {
      case 'READY':
        return <Badge label="HARDWARE SENSOR ACTIVE" variant="emerald" size="sm" />;
      case 'PERMISSION_DENIED':
        return <Badge label="PERMISSION REQUIRED" variant="amber" size="sm" />;
      case 'UNAVAILABLE':
        return <Badge label="SENSOR UNAVAILABLE" variant="neutral" size="sm" />;
      default:
        return <Badge label="INITIALIZING" variant="cyan" size="sm" />;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View
              style={[
                styles.container,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: borderRadius.lg,
                },
              ]}
            >
              {/* Header */}
              <View style={styles.headerRow}>
                <View style={styles.titleGroup}>
                  <View
                    style={[
                      styles.iconBox,
                      {
                        backgroundColor: colors.accentSubtle,
                        borderRadius: borderRadius.sm,
                      },
                    ]}
                  >
                    <Ionicons name="footsteps" size={20} color={colors.accent} />
                  </View>
                  <View>
                    <Heading level={3} style={{ color: colors.textPrimary }}>
                      Device Activity
                    </Heading>
                    <Caption style={{ color: colors.textSecondary }}>
                      Native Android Step Counter
                    </Caption>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={onClose}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityLabel="Close"
                >
                  <Ionicons name="close" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <Divider marginVertical={12} />

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 16 }}
              >
                {/* Status Indicator */}
                <View style={styles.statusRow}>
                  {getStatusBadge()}
                  <Caption style={{ color: colors.textMuted }}>
                    Android Step Counter
                  </Caption>
                </View>

                {/* Main Step Metric Card */}
                <Card variant="elevated" style={styles.metricCard}>
                  <Caption upper style={{ color: colors.textMuted, fontSize: 11 }}>
                    TODAY'S STEP COUNT
                  </Caption>
                  <View style={styles.stepValueRow}>
                    <Heading level={1} style={styles.stepBigText}>
                      {todaySteps.toLocaleString()}
                    </Heading>
                    <Text style={[styles.goalSubText, { color: colors.textSecondary }]}>
                      / {stepGoal.toLocaleString()}
                    </Text>
                  </View>

                  <View style={styles.progressWrapper}>
                    <ProgressBar
                      progressPercent={progressPercent}
                      size="md"
                      color={colors.accent}
                    />
                    <View style={styles.progressLabelRow}>
                      <Caption style={{ color: colors.textSecondary }}>
                        {progressPercent}% of daily goal
                      </Caption>
                      <MonoText style={{ color: colors.accent, fontSize: 12 }}>
                        {Math.max(0, stepGoal - todaySteps).toLocaleString()} remaining
                      </MonoText>
                    </View>
                  </View>
                </Card>

                {/* Daily Goal Configuration */}
                <View style={styles.sectionMargin}>
                  <SectionHeader title="DAILY STEP GOAL" />
                  <View style={styles.goalChipsRow}>
                    {GOAL_OPTIONS.map((g) => {
                      const isSelected = stepGoal === g;
                      return (
                        <TouchableOpacity
                          key={g}
                          onPress={() => setStepGoal(g)}
                          style={[
                            styles.goalChip,
                            {
                              borderColor: isSelected ? colors.accent : colors.border,
                              backgroundColor: isSelected
                                ? colors.accentSubtle
                                : isDark
                                ? colors.surface
                                : '#F8FAFC',
                              borderRadius: borderRadius.sm,
                            },
                          ]}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.goalChipText,
                              {
                                color: isSelected
                                  ? colors.accent
                                  : colors.textPrimary,
                                fontWeight: isSelected ? '700' : '500',
                              },
                            ]}
                          >
                            {(g / 1000).toFixed(0)}k
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Action CTA */}
                <View style={styles.sectionMargin}>
                  {sensorStatus === 'PERMISSION_DENIED' ? (
                    <PrimaryButton
                      title="ENABLE ACTIVITY PERMISSION"
                      size="md"
                      icon={
                        <Ionicons
                          name="shield-checkmark"
                          size={18}
                          color={colors.primaryButtonText}
                        />
                      }
                      onPress={async () => {
                        await requestPermission();
                      }}
                    />
                  ) : (
                    <Button
                      title="REFRESH HARDWARE STEPS"
                      variant="secondary"
                      size="md"
                      icon={
                        <Ionicons
                          name="refresh"
                          size={18}
                          color={colors.textPrimary}
                        />
                      }
                      onPress={async () => {
                        await refreshSteps();
                      }}
                    />
                  )}
                </View>

                {/* Architectural & Background Notice */}
                <Card variant="surface" style={styles.infoCard}>
                  <View style={styles.infoTitleRow}>
                    <Ionicons
                      name="information-circle-outline"
                      size={16}
                      color={colors.textSecondary}
                    />
                    <Caption style={{ color: colors.textSecondary, marginLeft: 6 }}>
                      Hardware Sensor Architecture
                    </Caption>
                  </View>
                  <Text style={[styles.infoBody, { color: colors.textMuted }]}>
                    • ASCEND reads your device's low-power hardware step counter directly without external companion apps.
                  </Text>
                  <Text style={[styles.infoBody, { color: colors.textMuted }]}>
                    • When the phone is carried in your pocket with ASCEND closed, steps continue accumulating in hardware and refresh immediately when the app resumes.
                  </Text>
                  <Text style={[styles.infoBody, { color: colors.textMuted }]}>
                    • Gym workout XP and Exercise Mastery are strictly reserved for verified weight training sessions.
                  </Text>
                </Card>
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    width: '100%',
    maxHeight: '90%',
    padding: 20,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  metricCard: {
    padding: 16,
    marginBottom: 16,
  },
  stepValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 4,
    marginBottom: 14,
  },
  stepBigText: {
    fontSize: 34,
    lineHeight: 40,
  },
  goalSubText: {
    fontSize: 16,
  },
  progressWrapper: {
    marginTop: 4,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  sectionMargin: {
    marginBottom: 16,
  },
  goalChipsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  goalChip: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginHorizontal: 3,
  },
  goalChipText: {
    fontSize: 13,
  },
  infoCard: {
    padding: 14,
    marginTop: 4,
  },
  infoTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoBody: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 6,
  },
});
