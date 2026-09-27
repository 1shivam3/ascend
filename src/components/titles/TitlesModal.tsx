import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME } from '../../constants/theme';
import { Heading, Text, Caption, MonoText } from '../ui/Typography';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { TitleCategory, TitleRarity } from '../../types/title.types';
import { TitleRepository, TitleWithStatus } from '../../database/repositories/TitleRepository';

interface TitlesModalProps {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onTitleChanged?: (activeTitle: string | null) => void;
}

const CATEGORY_TABS: { label: string; value: 'ALL' | TitleCategory }[] = [
  { label: 'ALL', value: 'ALL' },
  { label: 'STRENGTH', value: 'STRENGTH' },
  { label: 'CONSISTENCY', value: 'CONSISTENCY' },
  { label: 'CHALLENGES', value: 'CHALLENGE' },
  { label: 'MOBILITY', value: 'MOBILITY' },
  { label: 'PROGRESSION', value: 'PROGRESSION' },
];

const RARITY_COLORS: Record<TitleRarity, { bg: string; text: string; border: string }> = {
  COMMON: { bg: 'rgba(100, 116, 139, 0.12)', text: '#64748B', border: 'rgba(100, 116, 139, 0.25)' },
  RARE: { bg: 'rgba(2, 132, 199, 0.12)', text: '#0284C7', border: 'rgba(2, 132, 199, 0.25)' },
  EPIC: { bg: 'rgba(147, 51, 234, 0.12)', text: '#9333EA', border: 'rgba(147, 51, 234, 0.25)' },
  LEGENDARY: { bg: 'rgba(245, 158, 11, 0.12)', text: '#F59E0B', border: 'rgba(245, 158, 11, 0.3)' },
};

export const TitlesModal: React.FC<TitlesModalProps> = ({
  visible,
  userId,
  onClose,
  onTitleChanged,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | TitleCategory>('ALL');
  const [titles, setTitles] = useState<TitleWithStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEquipping, setIsEquipping] = useState<string | null>(null);

  const loadTitles = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const data = await TitleRepository.getAllTitlesWithStatus(userId);
      setTitles(data);
    } catch (err) {
      console.error('[TitlesModal] Failed to load titles:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (visible) {
      loadTitles();
    }
  }, [visible, loadTitles]);

  const handleEquipTitle = async (titleId: string, titleName: string) => {
    if (!userId) return;
    setIsEquipping(titleId);
    try {
      await TitleRepository.setActiveTitle(userId, titleId);
      await loadTitles();
      if (onTitleChanged) {
        onTitleChanged(titleName);
      }
      Alert.alert('Title Equipped', `Your active title is now "${titleName}".`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to equip title');
    } finally {
      setIsEquipping(null);
    }
  };

  const handleUnequipTitle = async () => {
    if (!userId) return;
    setIsEquipping('unequip');
    try {
      await TitleRepository.setActiveTitle(userId, null);
      await loadTitles();
      if (onTitleChanged) {
        onTitleChanged(null);
      }
      Alert.alert('Title Unequipped', 'You have unequipped your active title.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to unequip title');
    } finally {
      setIsEquipping(null);
    }
  };

  const filteredTitles = titles.filter((t) => {
    if (selectedCategory === 'ALL') return true;
    return t.definition.category === selectedCategory;
  });

  const totalUnlocked = titles.filter((t) => t.isUnlocked).length;
  const activeTitleItem = titles.find((t) => t.isActive);

  return (
    <Modal visible={visible} onClose={onClose} title="OPERATIVE TITLES" contentStyle={{ maxHeight: 680 }}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header Stat & Equipped Overview */}
        <View style={styles.statsBanner}>
          <View style={styles.statItem}>
            <Caption style={styles.statLabel}>UNLOCKED</Caption>
            <Text style={styles.statValue}>
              {totalUnlocked} <Caption style={styles.statTotal}>/ {titles.length}</Caption>
            </Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Caption style={styles.statLabel}>ACTIVE TITLE</Caption>
            <Text style={styles.statValue} numberOfLines={1}>
              {activeTitleItem ? activeTitleItem.definition.name : 'None Equipped'}
            </Text>
          </View>
        </View>

        {/* Anti-Exploit Security Callout */}
        <View style={styles.securityNotice}>
          <Ionicons name="shield-checkmark" size={16} color={THEME.colors.primary} style={styles.noticeIcon} />
          <Caption style={styles.noticeText}>
            Titles are non-exclusive honors earned through verified physical training and discipline. No titles are awarded for merely visiting or opening the app.
          </Caption>
        </View>

        {/* Category Filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContainer}
        >
          {CATEGORY_TABS.map((tab) => (
            <TouchableOpacity
              key={tab.value}
              onPress={() => setSelectedCategory(tab.value)}
              style={[
                styles.tabButton,
                selectedCategory === tab.value && styles.tabButtonActive,
              ]}
            >
              <MonoText
                style={[
                  styles.tabText,
                  selectedCategory === tab.value && styles.tabTextActive,
                ]}
              >
                {tab.label}
              </MonoText>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Titles List */}
        {isLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="small" color={THEME.colors.primary} />
            <Caption style={{ marginTop: 8 }}>Auditing title catalog...</Caption>
          </View>
        ) : filteredTitles.length === 0 ? (
          <View style={styles.centerContainer}>
            <Text style={{ color: THEME.colors.textSecondary }}>No titles found in this category.</Text>
          </View>
        ) : (
          filteredTitles.map((item) => {
            const { definition, isUnlocked, isActive, unlockedAt } = item;
            const rarityStyle = RARITY_COLORS[definition.rarity] || RARITY_COLORS.COMMON;

            return (
              <Card
                key={definition.id}
                style={[
                  styles.titleCard,
                  isActive && styles.activeTitleCard,
                  !isUnlocked && styles.lockedTitleCard,
                ]}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.titleInfoRow}>
                    <View
                      style={[
                        styles.iconContainer,
                        { backgroundColor: rarityStyle.bg, borderColor: rarityStyle.border },
                      ]}
                    >
                      <Ionicons
                        name={(definition.icon as any) || 'ribbon-outline'}
                        size={20}
                        color={isUnlocked ? rarityStyle.text : THEME.colors.textMuted}
                      />
                    </View>
                    <View style={styles.nameContainer}>
                      <View style={styles.badgesRow}>
                        <Badge
                          label={definition.rarity}
                          variant="neutral"
                          size="sm"
                          style={{ borderColor: rarityStyle.border }}
                        />
                        <Badge
                          label={definition.category}
                          variant="cyan"
                          size="sm"
                          style={{ marginLeft: 6 }}
                        />
                        {isActive && (
                          <Badge
                            label="EQUIPPED"
                            variant="emerald"
                            size="sm"
                            style={{ marginLeft: 6 }}
                          />
                        )}
                      </View>
                      <Heading level={3} style={[styles.titleName, !isUnlocked && styles.lockedText]}>
                        {definition.name}
                      </Heading>
                    </View>
                  </View>
                </View>

                <Text style={styles.descriptionText}>{definition.description}</Text>

                {/* Unlock Condition Box */}
                <View style={styles.conditionBox}>
                  <Ionicons
                    name={isUnlocked ? 'checkmark-circle-outline' : 'lock-closed-outline'}
                    size={14}
                    color={isUnlocked ? THEME.colors.emerald : THEME.colors.textMuted}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.conditionText}>
                    <Caption style={{ fontWeight: '700' }}>REQUIREMENT: </Caption>
                    {definition.unlockConditionText}
                  </Text>
                </View>

                {/* Footer Actions / Unlock Timestamp */}
                <View style={styles.cardFooter}>
                  {isUnlocked ? (
                    <View style={styles.actionRow}>
                      <Caption style={styles.unlockedDate}>
                        Unlocked {unlockedAt ? new Date(unlockedAt).toLocaleDateString() : ''}
                      </Caption>
                      {isActive ? (
                        <TouchableOpacity
                          onPress={handleUnequipTitle}
                          disabled={isEquipping !== null}
                          style={styles.unequipButton}
                        >
                          <MonoText style={styles.unequipButtonText}>UNEQUIP</MonoText>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          onPress={() => handleEquipTitle(definition.id, definition.name)}
                          disabled={isEquipping !== null}
                          style={styles.equipButton}
                        >
                          {isEquipping === definition.id ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <MonoText style={styles.equipButtonText}>EQUIP TITLE</MonoText>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : (
                    <View style={styles.lockedRow}>
                      <Ionicons name="lock-closed" size={14} color={THEME.colors.textMuted} />
                      <Caption style={styles.lockedLabel}>LOCKED — COMPLETE OBJECTIVE TO EARN</Caption>
                    </View>
                  )}
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
  },
  statsBanner: {
    flexDirection: 'row',
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: 12,
  },
  statItem: {
    flex: 1,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textMuted,
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginTop: 2,
  },
  statTotal: {
    fontSize: 12,
    color: THEME.colors.textMuted,
  },
  statDivider: {
    width: 1,
    backgroundColor: THEME.colors.border,
    marginHorizontal: 16,
  },
  securityNotice: {
    flexDirection: 'row',
    backgroundColor: THEME.colors.surfaceGlass,
    borderRadius: THEME.borderRadius.sm,
    padding: 10,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
    marginBottom: 14,
    alignItems: 'center',
  },
  noticeIcon: {
    marginRight: 8,
  },
  noticeText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    color: THEME.colors.textSecondary,
  },
  tabsContainer: {
    paddingVertical: 4,
    gap: 8,
    marginBottom: 16,
  },
  tabButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surface,
  },
  tabButtonActive: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primary,
  },
  tabText: {
    fontSize: 11,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  centerContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCard: {
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surface,
  },
  activeTitleCard: {
    borderColor: THEME.colors.primary,
    borderWidth: 1.5,
    backgroundColor: THEME.colors.surfaceElevated,
  },
  lockedTitleCard: {
    opacity: 0.72,
    backgroundColor: THEME.colors.surfaceMuted,
  },
  cardHeader: {
    marginBottom: 8,
  },
  titleInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: THEME.borderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  nameContainer: {
    flex: 1,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  titleName: {
    fontSize: 16,
    color: THEME.colors.textPrimary,
  },
  lockedText: {
    color: THEME.colors.textSecondary,
  },
  descriptionText: {
    fontSize: 12,
    lineHeight: 17,
    color: THEME.colors.textSecondary,
    marginBottom: 10,
  },
  conditionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
    marginBottom: 10,
  },
  conditionText: {
    fontSize: 11,
    color: THEME.colors.textPrimary,
    flex: 1,
  },
  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: THEME.colors.borderSubtle,
    paddingTop: 10,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  unlockedDate: {
    fontSize: 11,
    color: THEME.colors.textMuted,
  },
  equipButton: {
    backgroundColor: THEME.colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: THEME.borderRadius.sharp,
  },
  equipButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  unequipButton: {
    borderWidth: 1,
    borderColor: THEME.colors.crimson,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: THEME.borderRadius.sharp,
  },
  unequipButtonText: {
    color: THEME.colors.crimson,
    fontSize: 11,
    fontWeight: '700',
  },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lockedLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textMuted,
    letterSpacing: 0.5,
  },
});
