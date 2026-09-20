import React, { useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import Svg, { Rect, Line, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';
import { THEME } from '../../constants/theme';
import { Caption, MonoText } from '../ui/Typography';

export interface VolumeBarDataPoint {
  label: string; // e.g. "Mon", "12/09"
  value: number; // e.g. 3500
}

export interface VolumeBarChartProps {
  data: VolumeBarDataPoint[];
  height?: number;
  barColor?: string;
  unit?: string;
  emptyMessage?: string;
}

export const VolumeBarChart: React.FC<VolumeBarChartProps> = ({
  data,
  height = 140,
  barColor = THEME.colors.cyan,
  unit = 'kg',
  emptyMessage = 'No session volume data available',
}) => {
  const [containerWidth, setContainerWidth] = useState(300);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setContainerWidth(w);
  };

  if (!data || data.length === 0 || data.every(d => d.value === 0)) {
    return (
      <View style={[styles.container, { height }]} onLayout={onLayout}>
        <View style={styles.emptyBox}>
          <Caption align="center">{emptyMessage}</Caption>
        </View>
      </View>
    );
  }

  const maxValue = Math.max(...data.map(d => d.value), 1);
  const chartHeight = height - 30; // Leave room for X-axis labels
  const barCount = data.length;
  const paddingX = 16;
  const availableWidth = containerWidth - paddingX * 2;
  const barSlotWidth = availableWidth / barCount;
  const barWidth = Math.min(28, barSlotWidth * 0.65);

  return (
    <View style={[styles.container, { height }]} onLayout={onLayout}>
      <Svg width={containerWidth} height={height}>
        <Defs>
          <LinearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={barColor} stopOpacity="1" />
            <Stop offset="100%" stopColor={barColor} stopOpacity="0.3" />
          </LinearGradient>
        </Defs>

        {/* Baseline Grid Line */}
        <Line
          x1={paddingX}
          y1={chartHeight}
          x2={containerWidth - paddingX}
          y2={chartHeight}
          stroke={THEME.colors.borderSubtle}
          strokeWidth="1"
        />

        {/* Mid Grid Line */}
        <Line
          x1={paddingX}
          y1={chartHeight / 2}
          x2={containerWidth - paddingX}
          y2={chartHeight / 2}
          stroke={THEME.colors.borderSubtle}
          strokeWidth="1"
          strokeDasharray="4, 4"
        />

        {/* Max reference line label */}
        <SvgText
          x={containerWidth - paddingX - 4}
          y={12}
          fill={THEME.colors.textMuted}
          fontSize="9"
          fontWeight="bold"
          textAnchor="end"
          fontFamily="monospace"
        >
          {Math.round(maxValue)} {unit}
        </SvgText>

        {/* Data Bars */}
        {data.map((item, index) => {
          const barHeight = Math.max(4, (item.value / maxValue) * (chartHeight - 16));
          const x = paddingX + index * barSlotWidth + (barSlotWidth - barWidth) / 2;
          const y = chartHeight - barHeight;

          return (
            <React.Fragment key={index}>
              {/* Bar */}
              <Rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={3}
                fill={item.value > 0 ? 'url(#barGrad)' : THEME.colors.surfaceElevated}
              />

              {/* Top value badge if prominent */}
              {item.value === maxValue && maxValue > 0 && (
                <SvgText
                  x={x + barWidth / 2}
                  y={Math.max(10, y - 4)}
                  fill={THEME.colors.textPrimary}
                  fontSize="8"
                  fontWeight="bold"
                  textAnchor="middle"
                  fontFamily="monospace"
                >
                  {Math.round(item.value)}
                </SvgText>
              )}

              {/* X-axis Label */}
              <SvgText
                x={x + barWidth / 2}
                y={height - 8}
                fill={THEME.colors.textMuted}
                fontSize="9"
                fontWeight="700"
                textAnchor="middle"
              >
                {item.label}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    paddingTop: 8,
    marginVertical: THEME.spacing.xs,
    justifyContent: 'center',
  },
  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
