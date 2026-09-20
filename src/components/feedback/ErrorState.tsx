import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { THEME } from '../../constants/theme';
import { Heading, Text, Caption } from '../ui/Typography';
import { Button } from '../ui/Button';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  errorCode?: string;
  onRetry?: () => void;
  retryLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'TELEMETRY ANOMALY DETECTED',
  message = 'An unexpected error occurred while executing the operation. Local data remains secure.',
  errorCode,
  onRetry,
  retryLabel = 'RETRY OPERATION',
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.alertIconBox}>
        <Heading level={2} color={THEME.colors.crimson}>
          ⚠️
        </Heading>
      </View>

      <Heading level={2} color={THEME.colors.crimson} align="center" style={styles.title}>
        {title}
      </Heading>

      <Text color={THEME.colors.textSecondary} align="center" style={styles.message}>
        {message}
      </Text>

      {errorCode ? (
        <Caption upper align="center" color={THEME.colors.textMuted} style={styles.code}>
          CODE: {errorCode}
        </Caption>
      ) : null}

      {onRetry ? (
        <Button
          title={retryLabel}
          variant="outline"
          size="sm"
          onPress={onRetry}
          style={styles.retryBtn}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: THEME.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.crimsonSubtle,
    marginVertical: THEME.spacing.md,
  },
  alertIconBox: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: THEME.colors.crimsonSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: THEME.spacing.md,
    borderWidth: 1,
    borderColor: THEME.colors.crimson,
  },
  title: {
    letterSpacing: 1,
    marginBottom: THEME.spacing.sm,
  },
  message: {
    fontSize: 13,
    lineHeight: 20,
    maxWidth: 320,
    marginBottom: THEME.spacing.md,
  },
  code: {
    marginBottom: THEME.spacing.md,
  },
  retryBtn: {
    minWidth: 180,
  },
});
