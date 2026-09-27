import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { THEME } from '../../constants/theme';
import { Divider } from './Divider';

export interface CleanListProps<T> {
  data: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor?: (item: T, index: number) => string;
  showDividers?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function CleanList<T>({
  data,
  renderItem,
  keyExtractor = (_, index) => String(index),
  showDividers = true,
  style,
}: CleanListProps<T>) {
  return (
    <View style={[styles.container, style]}>
      {data.map((item, index) => {
        const isLast = index === data.length - 1;
        const key = keyExtractor(item, index);
        return (
          <React.Fragment key={key}>
            {renderItem(item, index)}
            {showDividers && !isLast && (
              <Divider marginVertical={THEME.spacing.sm} color={THEME.colors.borderSubtle} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
});
