import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { THEME } from '../../constants/theme';
import { Heading, Text } from '../ui/Typography';
import { Button } from '../ui/Button';

export interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = '📋',
  title,
  description,
  actionLabel,
  onAction,
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.iconBox}>
        <Heading level={1} align="center">
          {icon}
        </Heading>
      </View>

      <Heading level={2} align="center" style={styles.title}>
        {title}
      </Heading>

      <Text color={THEME.colors.textSecondary} align="center" style={styles.desc}>
        {description}
      </Text>

      {actionLabel && onAction ? (
        <Button
          title={actionLabel}
          variant="primary"
          size="sm"
          onPress={onAction}
          style={styles.actionBtn}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: THEME.spacing.xl,
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginVertical: THEME.spacing.md,
  },
  iconBox: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: THEME.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: THEME.spacing.md,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
  },
  title: {
    letterSpacing: 0.8,
    marginBottom: THEME.spacing.xs,
  },
  desc: {
    fontSize: 13,
    lineHeight: 20,
    maxWidth: 300,
    marginBottom: THEME.spacing.lg,
  },
  actionBtn: {
    minWidth: 180,
  },
});
