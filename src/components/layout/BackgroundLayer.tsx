import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, {
  Defs,
  RadialGradient,
  LinearGradient,
  Stop,
  Rect,
  Circle,
  Path,
} from 'react-native-svg';
import { BackgroundThemeId, BACKGROUND_THEMES } from '../../constants/backgrounds';
import { THEME } from '../../constants/theme';

export interface BackgroundLayerProps {
  theme?: BackgroundThemeId;
  intensity?: number; // 0.05 to 1.0
  children?: React.ReactNode;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const BackgroundLayer: React.FC<BackgroundLayerProps> = ({
  theme = 'ASCENSION',
  intensity,
  children,
}) => {
  const themeConfig = BACKGROUND_THEMES[theme] || BACKGROUND_THEMES.ASCENSION;
  const activeIntensity = intensity ?? themeConfig.defaultIntensity;

  const renderArchitecturalDetails = () => {
    switch (theme) {
      case 'ASCENSION':
        // Futuristic training chamber subtle depth lines & chamber ring
        return (
          <>
            <Circle
              cx={SCREEN_WIDTH / 2}
              cy={SCREEN_HEIGHT * 0.35}
              r={SCREEN_WIDTH * 0.55}
              stroke={themeConfig.primaryColor}
              strokeWidth="1"
              strokeDasharray="4 8"
              opacity={0.12 * activeIntensity}
              fill="none"
            />
            <Circle
              cx={SCREEN_WIDTH / 2}
              cy={SCREEN_HEIGHT * 0.35}
              r={SCREEN_WIDTH * 0.7}
              stroke={themeConfig.secondaryColor}
              strokeWidth="1"
              opacity={0.06 * activeIntensity}
              fill="none"
            />
            <Path
              d={`M0,${SCREEN_HEIGHT * 0.2} L${SCREEN_WIDTH * 0.3},${SCREEN_HEIGHT * 0.35} L${SCREEN_WIDTH * 0.7},${SCREEN_HEIGHT * 0.35} L${SCREEN_WIDTH},${SCREEN_HEIGHT * 0.2}`}
              stroke={themeConfig.primaryColor}
              strokeWidth="1"
              opacity={0.08 * activeIntensity}
              fill="none"
            />
          </>
        );

      case 'IRON_FORGE':
        // Industrial vertical grid lines & warm subtle accents
        return (
          <>
            <Path
              d={`M${SCREEN_WIDTH * 0.2},0 L${SCREEN_WIDTH * 0.2},${SCREEN_HEIGHT}`}
              stroke={themeConfig.primaryColor}
              strokeWidth="1"
              strokeDasharray="2 12"
              opacity={0.08 * activeIntensity}
            />
            <Path
              d={`M${SCREEN_WIDTH * 0.8},0 L${SCREEN_WIDTH * 0.8},${SCREEN_HEIGHT}`}
              stroke={themeConfig.primaryColor}
              strokeWidth="1"
              strokeDasharray="2 12"
              opacity={0.08 * activeIntensity}
            />
          </>
        );

      case 'ECLIPSE':
        // High-contrast eclipse circle & solar corona
        return (
          <>
            <Circle
              cx={SCREEN_WIDTH / 2}
              cy={SCREEN_HEIGHT * 0.28}
              r={SCREEN_WIDTH * 0.45}
              fill="url(#eclipseGlow)"
              opacity={0.6 * activeIntensity}
            />
            <Circle
              cx={SCREEN_WIDTH / 2}
              cy={SCREEN_HEIGHT * 0.28}
              r={SCREEN_WIDTH * 0.36}
              fill="#06070A"
            />
          </>
        );

      case 'STORM':
        // Atmospheric angled energy currents
        return (
          <>
            <Path
              d={`M0,${SCREEN_HEIGHT * 0.15} L${SCREEN_WIDTH},${SCREEN_HEIGHT * 0.4}`}
              stroke={themeConfig.primaryColor}
              strokeWidth="1"
              strokeDasharray="6 14"
              opacity={0.08 * activeIntensity}
            />
          </>
        );

      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <Svg
        width={SCREEN_WIDTH}
        height={SCREEN_HEIGHT}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      >
        <Defs>
          {/* Vertical base atmospheric gradient */}
          <LinearGradient id="baseBgGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={themeConfig.gradientStops[0]} stopOpacity="1" />
            <Stop offset="40%" stopColor={themeConfig.gradientStops[1]} stopOpacity="1" />
            <Stop offset="100%" stopColor={themeConfig.gradientStops[2]} stopOpacity="1" />
          </LinearGradient>

          {/* Core chamber ambient lighting source */}
          <RadialGradient
            id="ambientSource"
            cx="50%"
            cy="32%"
            r="50%"
            fx="50%"
            fy="32%"
          >
            <Stop offset="0%" stopColor={themeConfig.primaryColor} stopOpacity={0.22 * activeIntensity} />
            <Stop offset="50%" stopColor={themeConfig.secondaryColor} stopOpacity={0.08 * activeIntensity} />
            <Stop offset="100%" stopColor={THEME.colors.obsidian} stopOpacity="0" />
          </RadialGradient>

          {/* Special Eclipse Corona */}
          <RadialGradient
            id="eclipseGlow"
            cx="50%"
            cy="50%"
            r="50%"
          >
            <Stop offset="70%" stopColor={themeConfig.primaryColor} stopOpacity={0.5 * activeIntensity} />
            <Stop offset="90%" stopColor={themeConfig.secondaryColor} stopOpacity={0.2 * activeIntensity} />
            <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </RadialGradient>

          {/* Vignette overlay to keep UI & text readable */}
          <LinearGradient id="textProtector" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#000000" stopOpacity="0.2" />
            <Stop offset="50%" stopColor="#000000" stopOpacity="0.1" />
            <Stop offset="90%" stopColor={THEME.colors.obsidian} stopOpacity="0.85" />
            <Stop offset="100%" stopColor={THEME.colors.obsidian} stopOpacity="1" />
          </LinearGradient>
        </Defs>

        {/* Base Layer */}
        <Rect width="100%" height="100%" fill="url(#baseBgGrad)" />

        {/* Ambient Radial Source */}
        <Rect width="100%" height="100%" fill="url(#ambientSource)" />

        {/* Architectural / Environmental Motifs */}
        {renderArchitecturalDetails()}

        {/* Top & Bottom Vignette Overlay to guarantee high contrast */}
        <Rect width="100%" height="100%" fill="url(#textProtector)" />
      </Svg>

      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
});
