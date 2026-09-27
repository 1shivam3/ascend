import React, { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { THEME } from '../constants/theme';
import { queryClient } from '../lib/queryClient';
import { initializeDatabase } from '../database/migrations/init';
import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { SyncEngine } from '../services/sync/SyncEngine';
import { Heading, Text, Caption } from '../components/ui/Typography';

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { isAuthenticated, profile, isLoading, initializeAuth } = useAuthStore();
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const restoreActiveWorkout = useWorkoutStore((s) => s.restoreActiveWorkout);

  useEffect(() => {
    async function prepare() {
      try {
        await initializeDatabase();
        await initializeAuth();

        const activeUserId = useAuthStore.getState().userId;
        if (activeUserId) {
          await loadSettings(activeUserId);
        }

        // Initialize background sync engine
        SyncEngine.init();

        setIsReady(true);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Initialization failed';
        console.error('Failed to initialize ASCEND runtime:', err);
        setError(message);
      }
    }

    prepare();

    return () => {
      SyncEngine.destroy();
    };
  }, [initializeAuth, loadSettings]);

  // Restore active workout from SQLite on startup if authenticated
  useEffect(() => {
    if (isReady && isAuthenticated && profile?.id) {
      restoreActiveWorkout(profile.id).catch(() => {});
    }
  }, [isReady, isAuthenticated, profile?.id, restoreActiveWorkout]);

  // Strict Navigation Gating
  // Unauthenticated -> /auth only
  // Authenticated + incomplete profile -> /onboarding
  // Authenticated + completed profile -> /(tabs)
  useEffect(() => {
    if (!isReady || isLoading) return;

    const inAuthGroup = segments[0] === 'auth';
    const inOnboarding = segments[0] === 'onboarding';

    if (!isAuthenticated) {
      if (!inAuthGroup) {
        router.replace('/auth' as any);
      }
    } else if (!profile?.onboardingCompleted) {
      if (!inOnboarding) {
        router.replace('/onboarding' as any);
      }
    } else {
      if (inAuthGroup || inOnboarding) {
        router.replace('/(tabs)' as any);
      }
    }
  }, [isReady, isLoading, isAuthenticated, profile?.onboardingCompleted, segments, router]);

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Heading level={2} color={THEME.colors.crimson} style={styles.errorTitle}>
          ASCEND BOOT ERROR
        </Heading>
        <Text color={THEME.colors.textSecondary} align="center">
          {error}
        </Text>
      </View>
    );
  }

  if (!isReady || isLoading) {
    return (
      <View style={styles.centerContainer}>
        <Heading level={1} color={THEME.colors.cyan} style={styles.logoText}>
          ASCEND
        </Heading>
        <Caption upper color={THEME.colors.textMuted} style={styles.subText}>
          INITIALIZING TACTICAL CORE...
        </Caption>
        <ActivityIndicator color={THEME.colors.cyan} size="large" style={{ marginTop: 24 }} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" backgroundColor={THEME.colors.background} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: THEME.colors.background },
            animation: 'fade',
          }}
        >
          <Stack.Screen name="auth/index" options={{ headerShown: false }} />
          <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="onboarding/index"
            options={{ headerShown: false, gestureEnabled: false }}
          />
          <Stack.Screen
            name="modals/active-workout"
            options={{
              presentation: 'fullScreenModal',
              animation: 'slide_from_bottom',
            }}
          />
        </Stack>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    backgroundColor: THEME.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: THEME.spacing.lg,
  },
  logoText: {
    letterSpacing: 4,
    marginBottom: 6,
  },
  subText: {
    letterSpacing: 1.5,
  },
  errorTitle: {
    marginBottom: 8,
  },
});
