import React from 'react';
import { Tabs } from 'expo-router';
import { Platform, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../constants/theme';

export default function TabsLayout() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const activeColor = colors.accent;
  const inactiveColor = colors.textMuted;
  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'ios' ? 16 : 8);
  const barHeight = 56 + bottomPadding;

  const renderTabIcon = (focused: boolean, focusedName: keyof typeof Ionicons.glyphMap, unfocusedName: keyof typeof Ionicons.glyphMap, size: number) => (
    <View
      style={
        focused
          ? {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(17, 24, 39, 0.08)',
              paddingHorizontal: 14,
              paddingVertical: 3,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
            }
          : {
              paddingHorizontal: 14,
              paddingVertical: 3,
              alignItems: 'center',
              justifyContent: 'center',
            }
      }
    >
      <Ionicons
        name={focused ? focusedName : unfocusedName}
        size={size}
        color={focused ? (isDark ? '#FFFFFF' : '#111827') : inactiveColor}
      />
    </View>
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: barHeight,
          paddingBottom: bottomPadding,
          paddingTop: 6,
          elevation: isDark ? 8 : 2,
          shadowColor: isDark ? '#000000' : '#0F172A',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: isDark ? 0.3 : 0.03,
          shadowRadius: 8,
        },
        tabBarActiveTintColor: isDark ? '#FFFFFF' : '#111827',
        tabBarInactiveTintColor: inactiveColor,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 0.2,
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => renderTabIcon(focused, 'flash', 'flash-outline', 21),
        }}
      />
      <Tabs.Screen
        name="workout/index"
        options={{
          title: 'Train',
          tabBarIcon: ({ focused }) => renderTabIcon(focused, 'barbell', 'barbell-outline', 22),
        }}
      />
      <Tabs.Screen
        name="mastery/index"
        options={{
          title: 'Mastery',
          tabBarIcon: ({ focused }) => renderTabIcon(focused, 'shield-checkmark', 'shield-checkmark-outline', 21),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarIcon: ({ focused }) => renderTabIcon(focused, 'trending-up', 'trending-up-outline', 21),
        }}
      />
      <Tabs.Screen
        name="profile/index"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => renderTabIcon(focused, 'person', 'person-outline', 21),
        }}
      />
      {/* Retain Quests route for deep links while keeping 5 primary navigation tabs */}
      <Tabs.Screen
        name="quests/index"
        options={{
          href: null,
        }}
      />
      {/* Challenges dedicated screen */}
      <Tabs.Screen
        name="challenges/index"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
