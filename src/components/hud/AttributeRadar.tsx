import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { THEME } from '../../constants/theme';
import { CharacterAttributes } from '../../types/domain.types';

interface AttributeRadarProps {
  attributes: CharacterAttributes;
}

const ATTRIBUTE_CONFIG = [
  { key: 'strength', label: 'STR', name: 'Strength', color: '#FF3366', icon: '⚡' },
  { key: 'stamina', label: 'STA', name: 'Stamina', color: '#FFB800', icon: '🔥' },
  { key: 'agility', label: 'AGI', name: 'Agility', color: '#00F0FF', icon: '🌪️' },
  { key: 'discipline', label: 'DIS', name: 'Discipline', color: '#8B5CF6', icon: '🛡️' },
  { key: 'vitality', label: 'VIT', name: 'Vitality', color: '#10B981', icon: '❤️' },
] as const;

export const AttributeRadar: React.FC<AttributeRadarProps> = ({ attributes }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.sectionHeader}>TACTICAL ATTRIBUTES (1–100)</Text>

      <View style={styles.grid}>
        {ATTRIBUTE_CONFIG.map(attr => {
          const value = attributes[attr.key as keyof CharacterAttributes] || 10;
          const fillPercent = Math.min(100, Math.max(10, value));

          return (
            <View key={attr.key} style={styles.attrCard}>
              <View style={styles.headerRow}>
                <Text style={styles.icon}>{attr.icon}</Text>
                <Text style={[styles.code, { color: attr.color }]}>{attr.label}</Text>
                <Text style={styles.value}>{value}</Text>
              </View>

              <Text style={styles.name}>{attr.name}</Text>

              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width: `${fillPercent}%`,
                      backgroundColor: attr.color,
                    },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    padding: THEME.spacing.md,
    marginVertical: THEME.spacing.sm,
  },
  sectionHeader: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: THEME.spacing.md,
  },
  grid: {
    gap: THEME.spacing.sm,
  },
  attrCard: {
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.md,
    padding: THEME.spacing.sm,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  icon: {
    fontSize: 14,
    marginRight: 6,
  },
  code: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
    flex: 1,
  },
  value: {
    color: THEME.colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  name: {
    color: THEME.colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  barTrack: {
    height: 6,
    backgroundColor: THEME.colors.background,
    borderRadius: THEME.borderRadius.full,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: THEME.borderRadius.full,
  },
});
