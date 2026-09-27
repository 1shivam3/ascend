import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { THEME } from '../../constants/theme';

export interface DividerProps {
  color?: string;
  marginVertical?: number;
  marginHorizontal?: number;
  vertical?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const Divider: React.FC<DividerProps> = ({
  color = THEME.colors.borderSubtle,
  marginVertical = THEME.spacing.md,
  marginHorizontal = 0,
  vertical = false,
  style,
}) => {
  if (vertical) {
    return (
      <View
        style={[
          styles.vertical,
          {
            backgroundColor: color,
            marginHorizontal: marginHorizontal || THEME.spacing.sm,
          },
          style,
        ]}
      />
    );
  }

  return (
    <View
      style={[
        styles.horizontal,
        {
          backgroundColor: color,
          marginVertical,
          marginHorizontal,
        },
        style,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  horizontal: {
    height: 1,
    width: '100%',
  },
  vertical: {
    width: 1,
    height: '100%',
  },
});
