import React from 'react';
import { Stack } from 'expo-router';
import { THEME } from '../../../constants/theme';

export default function ProgressLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: THEME.colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[exerciseId]" />
    </Stack>
  );
}
