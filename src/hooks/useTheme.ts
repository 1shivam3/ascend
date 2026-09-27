import { useColorScheme } from 'react-native';
import { useSettingsStore } from '../store/useSettingsStore';
import { LIGHT_THEME, DARK_THEME, AppTheme } from '../constants/theme';

export interface ThemeResult {
  theme: AppTheme;
  colors: AppTheme['colors'];
  shadows: AppTheme['shadows'];
  borderRadius: AppTheme['borderRadius'];
  spacing: AppTheme['spacing'];
  typography: AppTheme['typography'];
  typographyStyles: AppTheme['typographyStyles'];
  displayTypography: AppTheme['displayTypography'];
  bodyTypography: AppTheme['bodyTypography'];
  isDark: boolean;
}

export function useTheme(): ThemeResult {
  const systemColorScheme = useColorScheme();
  const themeMode = useSettingsStore((state) => state.settings.themeMode || 'light');

  const isDark =
    themeMode === 'dark' ||
    (themeMode === 'system' && systemColorScheme === 'dark');

  const theme = isDark ? DARK_THEME : LIGHT_THEME;

  return {
    theme,
    colors: theme.colors,
    shadows: theme.shadows,
    borderRadius: theme.borderRadius,
    spacing: theme.spacing,
    typography: theme.typography,
    typographyStyles: theme.typographyStyles,
    displayTypography: theme.displayTypography,
    bodyTypography: theme.bodyTypography,
    isDark,
  };
}
