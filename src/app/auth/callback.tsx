import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useTheme } from '../../constants/theme';
import { useAuthStore } from '../../store/useAuthStore';
import { AuthService } from '../../services/auth/AuthService';
import { Heading, Text, Caption } from '../../components/ui/Typography';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const setSessionUser = useAuthStore((s) => s.setSessionUser);
  const [statusMessage, setStatusMessage] = useState('Verifying Google credentials...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function processCallback() {
      try {
        const initialUrl = await Linking.getInitialURL();
        const urlToProcess = initialUrl || Linking.createURL('auth/callback');

        const res = await AuthService.handleAuthCallback(urlToProcess);
        if (res.success && res.userId) {
          setStatusMessage('Identity verified! Initializing operative session...');
          await setSessionUser(res.userId, res.email);
          // Navigation guard in _layout.tsx will route to /onboarding or /(tabs)
          router.replace('/' as any);
        } else {
          setErrorMessage(res.error || 'Authentication could not be completed.');
          setTimeout(() => {
            router.replace('/auth' as any);
          }, 2000);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Authentication verification failure';
        setErrorMessage(AuthService.translateAuthError(message));
        setTimeout(() => {
          router.replace('/auth' as any);
        }, 2000);
      }
    }

    processCallback();
  }, [router, setSessionUser]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {errorMessage ? (
        <View style={styles.contentBox}>
          <Heading level={2} style={{ color: colors.crimson, marginBottom: 8 }}>
            Authentication Failed
          </Heading>
          <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>
            {errorMessage}
          </Text>
          <Caption style={{ color: colors.textMuted, marginTop: 12 }}>
            Redirecting to login...
          </Caption>
        </View>
      ) : (
        <View style={styles.contentBox}>
          <ActivityIndicator size="large" color={colors.accent} style={{ marginBottom: 16 }} />
          <Heading level={2} style={{ color: colors.textPrimary, marginBottom: 6 }}>
            AUTHENTICATING
          </Heading>
          <Caption style={{ color: colors.textSecondary, textAlign: 'center' }}>
            {statusMessage}
          </Caption>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  contentBox: {
    alignItems: 'center',
    maxWidth: 320,
  },
});
