import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { THEME } from '../constants/theme';
import { initializeDatabase } from '../database/migrations/init';
import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useAuthStore(s => s.loadProfile);
  const loadSettings = useSettingsStore(s => s.loadSettings);

  useEffect(() => {
    async function prepare() {
      try {
        // Initialize SQLite schema and seed exercises & profile
        await initializeDatabase();
        await loadProfile();
        await loadSettings();
        setIsReady(true);
      } catch (err: any) {
        console.error('Failed to initialize database:', err);
        setError(err.message || 'Initialization failed');
      }
    }

    prepare();
  }, [loadProfile, loadSettings]);

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>ASCEND BOOT ERROR</Text>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!isReady) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.logoText}>ASCEND</Text>
        <Text style={styles.subText}>INITIALIZING TACTICAL CORE...</Text>
        <ActivityIndicator color={THEME.colors.cyan} size="large" style={{ marginTop: 24 }} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" backgroundColor={THEME.colors.background} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: THEME.colors.background },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="modals/active-workout"
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
          }}
        />
      </Stack>
    </>
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
    color: THEME.colors.cyan,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 4,
    marginBottom: 6,
  },
  subText: {
    color: THEME.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  errorTitle: {
    color: THEME.colors.crimson,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 8,
  },
  errorText: {
    color: THEME.colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
});
