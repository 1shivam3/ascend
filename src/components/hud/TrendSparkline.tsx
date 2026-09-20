import React, { useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient, Stop, Line } from 'react-native-svg';
import { THEME } from '../../constants/theme';
import { Text, Caption, MonoText } from '../ui/Typography';

export interface TrendDataPoint {
  date: string;
  value: number;
}

export type SparklinePoint = TrendDataPoint | number;

export interface TrendSparklineProps {
  data: SparklinePoint[];
  title?: string;
  label?: string; // alias
  unit?: string;
  currentValue?: string; // override value display
  delta?: string; // override delta display
  lineColor?: string;
  strokeColor?: string; // alias
  height?: number;
  showDelta?: boolean;
}

export const TrendSparkline: React.FC<TrendSparklineProps> = ({
  data,
  title,
  label,
  unit = '',
  currentValue,
  delta: deltaOverride,
  lineColor = THEME.colors.cyan,
  strokeColor,
  height = 90,
  showDelta = true,
}) => {
  const [width, setWidth] = useState(300);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setWidth(w);
  };

  if (!data || data.length === 0) {
    return null;
  }

  const normalizedData: TrendDataPoint[] = data.map((d, i) =>
    typeof d === 'number' ? { date: String(i), value: d } : d
  );

  const displayTitle = label || title || '';
  const activeColor = strokeColor || lineColor;

  const values = normalizedData.map(d => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  const currentVal = values[values.length - 1];
  const initialVal = values[0];
  const calcDelta = Math.round((currentVal - initialVal) * 10) / 10;
  const isPositive = deltaOverride ? !deltaOverride.startsWith('-') : calcDelta >= 0;

  // Chart bounds
  const paddingX = 16;
  const paddingY = 12;
  const chartW = width - paddingX * 2;
  const chartH = height - 40; // Room for top header

  // Generate SVG path coordinates
  const points = normalizedData.map((d, idx) => {
    const x = paddingX + (idx / Math.max(1, normalizedData.length - 1)) * chartW;
    const normalizedY = (d.value - minVal) / range;
    const y = 32 + chartH - normalizedY * chartH;
    return { x, y, val: d.value };
  });

  const pathD = points.reduce((acc, p, idx) => {
    return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
  }, '');

  // Fill area under line
  const lastP = points[points.length - 1];
  const firstP = points[0];
  const fillD = `${pathD} L ${lastP.x} ${32 + chartH} L ${firstP.x} ${32 + chartH} Z`;

  const deltaTextDisplay = deltaOverride || (isPositive ? `+${calcDelta} ${unit}`.trim() : `${calcDelta} ${unit}`.trim());
  const currentValDisplay = currentValue || `${currentVal} ${unit}`.trim();

  return (
    <View style={styles.card} onLayout={onLayout}>
      <View style={styles.topRow}>
        <View>
          <Caption upper style={styles.title}>{displayTitle}</Caption>
          <MonoText style={styles.currentValText}>
            {currentValDisplay}
          </MonoText>
        </View>

        {showDelta && normalizedData.length > 1 && (
          <View style={[styles.deltaBadge, isPositive ? styles.deltaPos : styles.deltaNeg]}>
            <Text style={[styles.deltaText, { color: isPositive ? THEME.colors.emerald : THEME.colors.crimson }]}>
              {deltaTextDisplay}
            </Text>
          </View>
        )}
      </View>

      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={activeColor} stopOpacity="0.25" />
            <Stop offset="100%" stopColor={activeColor} stopOpacity="0.0" />
          </LinearGradient>
        </Defs>

        {/* Baseline guide line */}
        <Line
          x1={paddingX}
          y1={32 + chartH}
          x2={width - paddingX}
          y2={32 + chartH}
          stroke={THEME.colors.borderSubtle}
          strokeWidth="1"
        />

        {/* Filled polygon */}
        <Path d={fillD} fill="url(#sparkFill)" />

        {/* Line */}
        <Path d={pathD} stroke={activeColor} strokeWidth="2.5" fill="none" strokeLinecap="round" />

        {/* End pulse dot */}
        <Circle cx={lastP.x} cy={lastP.y} r="4" fill={activeColor} />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    paddingTop: THEME.spacing.sm,
    marginVertical: THEME.spacing.xs,
    overflow: 'hidden',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: THEME.spacing.md,
    marginBottom: 4,
  },
  title: {
    letterSpacing: 1.2,
    fontWeight: '800',
  },
  currentValText: {
    fontSize: 16,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
    marginTop: 2,
  },
  deltaBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
  },
  deltaPos: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: THEME.colors.emerald,
  },
  deltaNeg: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: THEME.colors.crimson,
  },
  deltaText: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
});
