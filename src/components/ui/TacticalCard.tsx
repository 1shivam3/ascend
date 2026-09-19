import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { THEME } from '../../constants/theme';

interface TacticalCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accentColor?: string;
  glow?: boolean;
}

export const TacticalCard: React.FC<TacticalCardProps> = ({
  children,
  style,
  accentColor,
  glow = false,
}) => {
  return (
    <View
      style={[
        styles.card,
        accentColor ? { borderColor: accentColor } : undefined,
        glow && accentColor
          ? {
              shadowColor: accentColor,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.35,
              shadowRadius: 10,
              elevation: 4,
            }
          : undefined,
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    padding: THEME.spacing.md,
    marginVertical: THEME.spacing.xs,
  },
});
