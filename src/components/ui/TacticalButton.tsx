import React from 'react';
import { ViewStyle, TextStyle } from 'react-native';
import { Button, ButtonVariant, ButtonSize } from './Button';

export interface TacticalButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'amber' | 'danger' | 'ghost';
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const TacticalButton: React.FC<TacticalButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  style,
  textStyle,
}) => {
  let mappedVariant: ButtonVariant = 'primary';
  if (variant === 'danger') mappedVariant = 'destructive';
  else if (variant === 'secondary') mappedVariant = 'secondary';
  else if (variant === 'ghost') mappedVariant = 'ghost';
  else if (variant === 'amber') mappedVariant = 'secondary';

  return (
    <Button
      title={title}
      onPress={onPress}
      variant={mappedVariant}
      size={size}
      disabled={disabled}
      loading={loading}
      icon={icon}
      style={style}
      textStyle={textStyle}
    />
  );
};
