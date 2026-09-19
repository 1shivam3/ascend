import React from 'react';
import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { THEME } from '../../constants/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: THEME.colors.surface,
          borderTopColor: THEME.colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: THEME.colors.cyan,
        tabBarInactiveTintColor: THEME.colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '800',
          letterSpacing: 0.5,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'HUD',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 18, color }}>⚡</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="workouts"
        options={{
          title: 'ROUTINES',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 18, color }}>📋</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="exercises"
        options={{
          title: 'MASTERY',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 18, color }}>⚔️</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="quests"
        options={{
          title: 'QUESTS',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 18, color }}>🎯</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'PROFILE',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 18, color }}>🛡️</Text>
          ),
        }}
      />
    </Tabs>
  );
}
