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
          height: 60,
          paddingBottom: 6,
          paddingTop: 6,
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
          title: 'HOME',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 16, color }}>⚡</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="quests/index"
        options={{
          title: 'QUESTS',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 16, color }}>🎯</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="workout/index"
        options={{
          title: 'WORKOUT',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 16, color }}>📋</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'PROGRESS',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 16, color }}>⚔️</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="profile/index"
        options={{
          title: 'PROFILE',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 16, color }}>🛡️</Text>
          ),
        }}
      />
    </Tabs>
  );
}
