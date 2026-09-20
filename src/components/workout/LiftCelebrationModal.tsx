import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME } from '../../constants/theme';
import { RankTier } from '../../config/progression.config';
import { PROGRESSION_CONFIG } from '../../config/progression.config';

export interface LiftCelebrationItem {
  exerciseName: string;
  oldLevel: number;
  newLevel: number;
  didLevelUp: boolean;
  oldRank?: RankTier;
  newRank?: RankTier;
  didRankUp?: boolean;
  unlockedMilestones?: {
    id: string;
    title: string;
    rewardXp: number;
  }[];
  xpEarned: number;
}

interface LiftCelebrationModalProps {
  visible: boolean;
  onClose: () => void;
  celebrations: LiftCelebrationItem[];
}

export function LiftCelebrationModal({
  visible,
  onClose,
  celebrations,
}: LiftCelebrationModalProps) {
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 7,
          tension: 40,
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

  if (!visible || celebrations.length === 0) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.modalContainer,
            {
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
            },
          ]}
        >
          {/* Header Banner */}
          <View style={styles.header}>
            <Ionicons name="flash" size={28} color={THEME.colors.cyan} />
            <Text style={styles.title}>LIFT MASTERY ASCENT</Text>
            <Text style={styles.subtitle}>Independent Movement Progression Realized</Text>
          </View>

          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {celebrations.map((item, idx) => {
              const rankColor = item.newRank
                ? PROGRESSION_CONFIG.mastery.exerciseRanks[item.newRank]?.color || THEME.colors.cyan
                : THEME.colors.cyan;

              return (
                <View key={idx} style={[styles.celebrationCard, { borderColor: rankColor }]}>
                  <Text style={styles.exerciseName}>{item.exerciseName.toUpperCase()}</Text>

                  {/* Rank Up Announcement */}
                  {item.didRankUp && item.oldRank && item.newRank && (
                    <View style={styles.rankUpRow}>
                      <Ionicons name="ribbon" size={20} color={rankColor} />
                      <Text style={[styles.rankUpText, { color: rankColor }]}>
                        RANK UP: {item.oldRank} ➔ {item.newRank}
                      </Text>
                    </View>
                  )}

                  {/* Level Up Announcement */}
                  {item.didLevelUp && (
                    <View style={styles.levelUpRow}>
                      <Ionicons name="trending-up" size={18} color="#00F0FF" />
                      <Text style={styles.levelUpText}>
                        LEVEL {item.oldLevel} ➔ {item.newLevel}
                      </Text>
                      <Text style={styles.xpEarnedBadge}>+{item.xpEarned} XP</Text>
                    </View>
                  )}

                  {/* Unlocked Milestones */}
                  {item.unlockedMilestones && item.unlockedMilestones.length > 0 && (
                    <View style={styles.milestonesContainer}>
                      <Text style={styles.milestoneSectionTitle}>MILESTONES UNLOCKED</Text>
                      {item.unlockedMilestones.map((m, mIdx) => (
                        <View key={mIdx} style={styles.milestonePill}>
                          <Ionicons name="trophy" size={14} color="#FFD700" />
                          <Text style={styles.milestoneText}>{m.title}</Text>
                          <Text style={styles.milestoneXp}>+{m.rewardXp} XP</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>

          {/* Continue Button */}
          <TouchableOpacity style={styles.continueButton} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.continueButtonText}>CONTINUE ASCENT</Text>
            <Ionicons name="arrow-forward" size={18} color="#000" />
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: THEME.colors.surface,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 240, 255, 0.4)',
    padding: 20,
    shadowColor: '#00F0FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 15,
    elevation: 12,
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 2,
    marginTop: 6,
  },
  subtitle: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    letterSpacing: 1,
    marginTop: 2,
  },
  scrollContent: {
    maxHeight: 380,
  },
  celebrationCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  exerciseName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: 1,
    marginBottom: 8,
  },
  rankUpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 6,
  },
  rankUpText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  levelUpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 240, 255, 0.08)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 6,
  },
  levelUpText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#00F0FF',
    letterSpacing: 1,
    flex: 1,
  },
  xpEarnedBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10B981',
  },
  milestonesContainer: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  milestoneSectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFD700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  milestonePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 215, 0, 0.08)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginTop: 4,
  },
  milestoneText: {
    fontSize: 12,
    color: '#FFF',
    fontWeight: '600',
    flex: 1,
  },
  milestoneXp: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFD700',
  },
  continueButton: {
    backgroundColor: THEME.colors.cyan,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 14,
  },
  continueButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
});
