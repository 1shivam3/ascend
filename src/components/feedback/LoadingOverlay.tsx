import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { THEME } from '../../constants/theme';
import { Caption, Heading } from '../ui/Typography';

export interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
  subMessage?: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  visible,
  message = 'PROCESSING TELEMETRY...',
  subMessage,
}) => {
  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.box}>
        <ActivityIndicator size="large" color={THEME.colors.cyan} />
        <Heading level={3} color={THEME.colors.textPrimary} align="center" style={styles.message}>
          {message}
        </Heading>
        {subMessage ? (
          <Caption align="center" color={THEME.colors.textMuted} style={styles.subMessage}>
            {subMessage}
          </Caption>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: THEME.colors.backdrop,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  box: {
    backgroundColor: THEME.colors.surfaceElevated,
    padding: THEME.spacing.xl,
    borderRadius: THEME.borderRadius.lg,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    alignItems: 'center',
    maxWidth: 320,
    width: '85%',
  },
  message: {
    marginTop: THEME.spacing.md,
    letterSpacing: 1,
  },
  subMessage: {
    marginTop: THEME.spacing.xs,
  },
});
