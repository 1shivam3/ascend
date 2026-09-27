import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Image,
  StyleSheet,
  TouchableOpacity,
  PanResponder,
  Animated,
  Text,
  LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../constants/theme';
import { CharacterAssetService, CharacterViewMode } from '../../services/character/CharacterAssetService';
import { BodyRegionId, BODY_REGIONS } from './types';
import { getRankColor } from '../../constants/ranks';

export interface Character2DProps {
  height?: number;
  globalLevel?: number;
  rankTier?: string;
  selectedRegion?: BodyRegionId | null;
  onSelectRegion?: (regionId: BodyRegionId) => void;
  onOpenCustomizer?: () => void;
  showControls?: boolean;
  interactiveHotspots?: boolean;
}

interface MuscleHotspot {
  id: BodyRegionId;
  name: string;
  topPct: number;
  leftPct: number;
  widthPct: number;
  heightPct: number;
}

// Normalized coordinate percentages on the character silhouette
const FRONT_HOTSPOTS: MuscleHotspot[] = [
  { id: 'head', name: 'HEAD / NECK', topPct: 4, leftPct: 40, widthPct: 20, heightPct: 11 },
  { id: 'left_shoulder', name: 'L. SHOULDER', topPct: 15, leftPct: 25, widthPct: 15, heightPct: 10 },
  { id: 'chest', name: 'CHEST', topPct: 17, leftPct: 37, widthPct: 26, heightPct: 12 },
  { id: 'right_shoulder', name: 'R. SHOULDER', topPct: 15, leftPct: 60, widthPct: 15, heightPct: 10 },
  { id: 'left_arm', name: 'L. ARM', topPct: 24, leftPct: 20, widthPct: 15, heightPct: 22 },
  { id: 'core', name: 'CORE & ABS', topPct: 28, leftPct: 38, widthPct: 24, heightPct: 14 },
  { id: 'right_arm', name: 'R. ARM', topPct: 24, leftPct: 65, widthPct: 15, heightPct: 22 },
  { id: 'left_leg', name: 'L. LEG', topPct: 45, leftPct: 30, widthPct: 19, heightPct: 48 },
  { id: 'right_leg', name: 'R. LEG', topPct: 45, leftPct: 51, widthPct: 19, heightPct: 48 },
];

const BACK_HOTSPOTS: MuscleHotspot[] = [
  { id: 'head', name: 'HEAD / TRAPS', topPct: 4, leftPct: 40, widthPct: 20, heightPct: 11 },
  { id: 'left_shoulder', name: 'L. REAR DELT', topPct: 15, leftPct: 25, widthPct: 15, heightPct: 10 },
  { id: 'back', name: 'BACK / LATS', topPct: 16, leftPct: 35, widthPct: 30, heightPct: 18 },
  { id: 'right_shoulder', name: 'R. REAR DELT', topPct: 15, leftPct: 60, widthPct: 15, heightPct: 10 },
  { id: 'left_arm', name: 'L. ARM', topPct: 24, leftPct: 18, widthPct: 16, heightPct: 22 },
  { id: 'right_arm', name: 'R. ARM', topPct: 24, leftPct: 66, widthPct: 16, heightPct: 22 },
  { id: 'left_leg', name: 'L. HAMSTRINGS', topPct: 45, leftPct: 30, widthPct: 19, heightPct: 48 },
  { id: 'right_leg', name: 'R. HAMSTRINGS', topPct: 45, leftPct: 51, widthPct: 19, heightPct: 48 },
];

export const Character2D: React.FC<Character2DProps> = ({
  height = 260,
  globalLevel = 1,
  rankTier = 'E',
  selectedRegion,
  onSelectRegion,
  onOpenCustomizer,
  showControls = true,
  interactiveHotspots = true,
}) => {
  const { colors, borderRadius, isDark } = useTheme();
  const [viewMode, setViewMode] = useState<CharacterViewMode>('FRONT');
  const [containerLayout, setContainerLayout] = useState({ width: 0, height: 0 });

  // Resolve current active character assets based on progression level & rank
  const characterBundle = useMemo(
    () => CharacterAssetService.getActiveCharacter(globalLevel, rankTier),
    [globalLevel, rankTier]
  );

  const rankColor = getRankColor(rankTier);

  // Subtle horizontal swipe gesture handler
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 25 && Math.abs(gestureState.dy) < 30;
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 40) {
          // Swiped right -> switch to FRONT
          setViewMode('FRONT');
        } else if (gestureState.dx < -40) {
          // Swiped left -> switch to BACK
          setViewMode('BACK');
        }
      },
    })
  ).current;

  const currentImageSource = viewMode === 'FRONT' ? characterBundle.front : characterBundle.back;
  const currentHotspots = viewMode === 'FRONT' ? FRONT_HOTSPOTS : BACK_HOTSPOTS;

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height: h } = e.nativeEvent.layout;
    setContainerLayout({ width, height: h });
  };

  const handleHotspotPress = (regionId: BodyRegionId) => {
    if (onSelectRegion) {
      onSelectRegion(regionId);
    }
  };

  return (
    <View
      style={[styles.container, { height }]}
      onLayout={handleLayout}
      {...panResponder.panHandlers}
    >
      {/* 1. Atmospheric Rank Aura / Glow Behind Silhouette */}
      <View
        style={[
          styles.rankAuraGlow,
          {
            backgroundColor: isDark ? `${rankColor}18` : `${rankColor}12`,
            borderColor: isDark ? `${rankColor}33` : 'transparent',
          },
        ]}
      />

      {/* 2. Character Rendered Image */}
      <View style={styles.imageWrapper}>
        <Image
          source={currentImageSource}
          style={styles.characterImage}
          resizeMode="contain"
          fadeDuration={200}
        />

        {/* 3. Interactive Muscle Hotspot Overlays */}
        {interactiveHotspots && containerLayout.width > 0 && (
          <View style={StyleSheet.absoluteFill}>
            {currentHotspots.map((spot) => {
              const isSelected = selectedRegion === spot.id;
              return (
                <TouchableOpacity
                  key={`${viewMode}-${spot.id}`}
                  activeOpacity={0.7}
                  onPress={() => handleHotspotPress(spot.id)}
                  style={[
                    styles.hotspotTouchArea,
                    {
                      top: `${spot.topPct}%`,
                      left: `${spot.leftPct}%`,
                      width: `${spot.widthPct}%`,
                      height: `${spot.heightPct}%`,
                    },
                    isSelected && {
                      borderColor: rankColor,
                      backgroundColor: `${rankColor}33`,
                      borderWidth: 1.5,
                      borderRadius: 8,
                    },
                  ]}
                >
                  {isSelected && (
                    <View style={[styles.selectedPin, { backgroundColor: rankColor }]}>
                      <Text style={styles.selectedPinText}>
                        {BODY_REGIONS[spot.id]?.name || spot.id}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* 4. Controls: View Switcher Pill & Stage Badge */}
      {showControls && (
        <View style={styles.bottomBar}>
          {/* View Switcher Pill (Front / Back) */}
          <View
            style={[
              styles.viewTogglePill,
              {
                backgroundColor: isDark ? 'rgba(15, 17, 23, 0.85)' : 'rgba(255, 255, 255, 0.90)',
                borderColor: colors.border,
              },
            ]}
          >
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setViewMode('FRONT')}
              style={[
                styles.toggleSegment,
                viewMode === 'FRONT' && [
                  styles.toggleSegmentActive,
                  { backgroundColor: isDark ? '#FFFFFF' : '#111827' },
                ],
              ]}
            >
              <Text
                style={[
                  styles.toggleText,
                  {
                    color:
                      viewMode === 'FRONT'
                        ? isDark
                          ? '#0E1015'
                          : '#FFFFFF'
                        : colors.textSecondary,
                  },
                ]}
              >
                ← FRONT
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setViewMode('BACK')}
              style={[
                styles.toggleSegment,
                viewMode === 'BACK' && [
                  styles.toggleSegmentActive,
                  { backgroundColor: isDark ? '#FFFFFF' : '#111827' },
                ],
              ]}
            >
              <Text
                style={[
                  styles.toggleText,
                  {
                    color:
                      viewMode === 'BACK'
                        ? isDark
                          ? '#0E1015'
                          : '#FFFFFF'
                        : colors.textSecondary,
                  },
                ]}
              >
                BACK →
              </Text>
            </TouchableOpacity>
          </View>

          {/* Evolution Stage Indicator / Customizer Trigger */}
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={onOpenCustomizer}
            style={[
              styles.stageIndicatorPill,
              {
                backgroundColor: isDark ? 'rgba(23, 25, 34, 0.80)' : 'rgba(241, 243, 245, 0.90)',
                borderColor: colors.border,
              },
            ]}
          >
            <Ionicons name="sparkles" size={12} color={rankColor} style={{ marginRight: 4 }} />
            <Text style={[styles.stageText, { color: colors.textPrimary }]}>
              {characterBundle.stageName}
            </Text>
            {onOpenCustomizer && (
              <Ionicons name="chevron-forward" size={12} color={colors.textMuted} style={{ marginLeft: 3 }} />
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  rankAuraGlow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
  },
  imageWrapper: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  characterImage: {
    width: '100%',
    height: '100%',
  },
  hotspotTouchArea: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedPin: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    position: 'absolute',
    top: -14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 2,
  },
  selectedPinText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 8,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  viewTogglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 9999,
    borderWidth: 1,
    padding: 2,
  },
  toggleSegment: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 9999,
  },
  toggleSegmentActive: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  toggleText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  stageIndicatorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9999,
    borderWidth: 1,
  },
  stageText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
