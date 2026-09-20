import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
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

import { useRouter } from 'expo-router';

export default function RootLayout() {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profile = useAuthStore(s => s.profile);
  const loadProfile = useAuthStore(s => s.loadProfile);
  const loadSettings = useSettingsStore(s => s.loadSettings);
  const restoreActiveWorkout = useWorkoutStore(s => s.restoreActiveWorkout);

  useEffect(() => {
    async function prepare() {
      try {
        await initializeDatabase();
        await loadProfile();
        await loadSettings();

        // Initialize background sync engine
        SyncEngine.init();

        setIsReady(true);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Initialization failed';
        console.error('Failed to initialize database:', err);
        setError(message);
      }
    }

    prepare();

    return () => {
      SyncEngine.destroy();
    };
  }, [loadProfile, loadSettings]);

  // Restore active workout from SQLite on startup
  useEffect(() => {
    if (isReady && profile?.id) {
      restoreActiveWorkout(profile.id).catch(() => {});
    }
  }, [isReady, profile?.id, restoreActiveWorkout]);

  // Navigate to onboarding if user has not completed onboarding
  useEffect(() => {
    if (isReady && profile) {
      if (!profile.onboardingCompleted) {
        router.replace('/onboarding' as any);
      }
    }
  }, [isReady, profile, router]);

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

  if (!isReady) {
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
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding/index" options={{ headerShown: false, gestureEnabled: false }} />
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
