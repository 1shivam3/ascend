import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  LayoutChangeEvent,
} from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../constants/theme';
import { Heading, Text, Caption, MonoText } from '../ui/Typography';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import {
  ChartMetric,
  ChartTimeRange,
  ChartQueryResult,
  ChartDataPoint,
} from '../../services/progress/ProgressAnalyticsService';
import { Exercise } from '../../types/domain.types';

interface InteractiveProgressChartProps {
  queryResult: ChartQueryResult | null;
  selectedMetric: ChartMetric;
  selectedRange: ChartTimeRange;
  selectedExerciseId?: string;
  exercises: Exercise[];
  onSelectMetric: (metric: ChartMetric) => void;
  onSelectRange: (range: ChartTimeRange) => void;
  onSelectExercise: (exerciseId?: string) => void;
  onOpenCustomRangeModal: () => void;
  onOpenDetailsModal: () => void;
  loading?: boolean;
}

const METRICS: { id: ChartMetric; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'ESTIMATED_1RM', label: 'Est. 1RM', icon: 'flash-outline' },
  { id: 'WEIGHT', label: 'Weight', icon: 'barbell-outline' },
  { id: 'REPETITIONS', label: 'Reps', icon: 'repeat-outline' },
  { id: 'TRAINING_VOLUME', label: 'Volume', icon: 'layers-outline' },
  { id: 'BODY_WEIGHT', label: 'Body Weight', icon: 'speedometer-outline' },
  { id: 'WORKOUT_FREQUENCY', label: 'Frequency', icon: 'calendar-outline' },
];

const TIME_RANGES: { id: ChartTimeRange; label: string }[] = [
  { id: '7D', label: '7D' },
  { id: '30D', label: '30D' },
  { id: '3M', label: '3M' },
  { id: '6M', label: '6M' },
  { id: '1Y', label: '1Y' },
  { id: 'CUSTOM', label: 'Custom' },
];

export const InteractiveProgressChart: React.FC<InteractiveProgressChartProps> = ({
  queryResult,
  selectedMetric,
  selectedRange,
  selectedExerciseId,
  exercises,
  onSelectMetric,
  onSelectRange,
  onSelectExercise,
  onOpenCustomRangeModal,
  onOpenDetailsModal,
  loading = false,
}) => {
  const { colors, borderRadius, isDark } = useTheme();
  const [containerWidth, setContainerWidth] = useState(320);
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null);
  const [exerciseModalVisible, setExerciseModalVisible] = useState(false);

  const isGlobalMetric = selectedMetric === 'BODY_WEIGHT' || selectedMetric === 'WORKOUT_FREQUENCY';
  const activeEx = exercises.find((e) => e.id === selectedExerciseId);
  const exerciseLabel = isGlobalMetric
    ? 'All Body Telemetry'
    : activeEx
    ? activeEx.name
    : 'All Exercises';

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setContainerWidth(w);
  };

  const data = queryResult?.data || [];
  const hasData = data.length > 0;
  const values = data.map((d) => d.value);
  const minVal = hasData ? Math.min(...values) : 0;
  const maxVal = hasData ? Math.max(...values) : 100;
  const rangeVal = maxVal - minVal || 1;

  // Chart dimensions
  const chartHeight = 170;
  const paddingLeft = 46;
  const paddingRight = 16;
  const paddingTop = 24;
  const paddingBottom = 28;
  const plotWidth = containerWidth - paddingLeft - paddingRight;
  const plotHeight = chartHeight - paddingTop - paddingBottom;

  // Calculate coordinates for SVG
  const points = data.map((d, i) => {
    const x =
      data.length === 1
        ? paddingLeft + plotWidth / 2
        : paddingLeft + (i / (data.length - 1)) * plotWidth;
    const normY = (d.value - minVal) / rangeVal;
    const y = paddingTop + plotHeight - normY * plotHeight;
    return { x, y, ...d };
  });

  // Construct line path
  const pathD = points.reduce((acc, p, i) => {
    return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
  }, '');

  // Active highlighted point
  const selectedPoint =
    activePointIndex !== null && points[activePointIndex]
      ? points[activePointIndex]
      : points.length > 0
      ? points[points.length - 1]
      : null;

  const activeColor = isDark ? colors.cyan : colors.primary;

  return (
    <View onLayout={onLayout}>
      <Card variant="surface" style={styles.container}>
      {/* Metric Selector Pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.metricPillsScroll}
      >
        {METRICS.map((m) => {
          const isSelected = selectedMetric === m.id;
          return (
            <TouchableOpacity
              key={m.id}
              onPress={() => {
                onSelectMetric(m.id);
                setActivePointIndex(null);
                Haptics.selectionAsync();
              }}
              style={[
                styles.metricPill,
                {
                  backgroundColor: isSelected
                    ? isDark
                      ? colors.cyan
                      : colors.primary
                    : isDark
                    ? 'rgba(255,255,255,0.04)'
                    : '#F1F5F9',
                  borderColor: isSelected ? 'transparent' : colors.border,
                  borderRadius: borderRadius.full,
                },
              ]}
              activeOpacity={0.75}
            >
              <Ionicons
                name={m.icon}
                size={14}
                color={isSelected ? (isDark ? '#000000' : '#FFFFFF') : colors.textSecondary}
              />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: isSelected ? '700' : '500',
                  color: isSelected ? (isDark ? '#000000' : '#FFFFFF') : colors.textSecondary,
                }}
              >
                {m.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Control Row: Exercise Dropdown & Time Ranges */}
      <View style={styles.controlRow}>
        {/* Exercise Selector */}
        <TouchableOpacity
          disabled={isGlobalMetric}
          onPress={() => {
            setExerciseModalVisible(true);
            Haptics.selectionAsync();
          }}
          style={[
            styles.exercisePickerBtn,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC',
              borderColor: colors.border,
              borderRadius: borderRadius.sm,
              opacity: isGlobalMetric ? 0.6 : 1,
            },
          ]}
        >
          <Ionicons
            name={isGlobalMetric ? 'globe-outline' : 'barbell-outline'}
            size={14}
            color={isDark ? colors.cyan : colors.primary}
          />
          <Text
            style={{
              fontSize: 12,
              fontWeight: '700',
              color: colors.textPrimary,
              flex: 1,
            }}
            numberOfLines={1}
          >
            {exerciseLabel}
          </Text>
          {!isGlobalMetric && <Ionicons name="chevron-down" size={14} color={colors.textMuted} />}
        </TouchableOpacity>

        {/* Time Range Pills */}
        <View style={[styles.rangePillBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F1F5F9', borderRadius: borderRadius.sm }]}>
          {TIME_RANGES.map((r) => {
            const isSelected = selectedRange === r.id;
            return (
              <TouchableOpacity
                key={r.id}
                onPress={() => {
                  if (r.id === 'CUSTOM') {
                    onOpenCustomRangeModal();
                  } else {
                    onSelectRange(r.id);
                  }
                  setActivePointIndex(null);
                  Haptics.selectionAsync();
                }}
                style={[
                  styles.rangeBtn,
                  {
                    backgroundColor: isSelected
                      ? isDark
                        ? colors.cyan
                        : colors.primary
                      : 'transparent',
                    borderRadius: borderRadius.xs,
                  },
                ]}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: isSelected ? '800' : '600',
                    color: isSelected ? (isDark ? '#000000' : '#FFFFFF') : colors.textSecondary,
                  }}
                >
                  {r.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Header Metric & Estimation Badge */}
      <View style={styles.metricHeaderRow}>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <MonoText style={{ fontSize: 24, fontWeight: '800', color: colors.textPrimary }}>
              {selectedPoint ? selectedPoint.value : queryResult?.currentValue || 0}
            </MonoText>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textMuted }}>
              {queryResult?.unit || 'kg'}
            </Text>
            {queryResult && queryResult.delta !== 0 && (
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '700',
                  color: queryResult.delta >= 0 ? colors.emerald : colors.crimson,
                  marginLeft: 6,
                }}
              >
                {queryResult.delta > 0 ? `+${queryResult.delta}` : queryResult.delta}{' '}
                {queryResult.unit} ({queryResult.deltaPercent > 0 ? `+${queryResult.deltaPercent}%` : `${queryResult.deltaPercent}%`})
              </Text>
            )}
          </View>
          <Caption style={{ color: colors.textMuted }}>
            {selectedPoint
              ? `${selectedPoint.date}${selectedPoint.details ? ` • ${selectedPoint.details}` : ''}`
              : selectedMetric.replace(/_/g, ' ')}
          </Caption>
        </View>

        <Badge
          label={
            queryResult?.isEstimatedMetric
              ? 'EPLEY ESTIMATE (≤10 REPS)'
              : 'DIRECTLY RECORDED'
          }
          variant={queryResult?.isEstimatedMetric ? 'amber' : 'emerald'}
          size="sm"
        />
      </View>

      {/* SVG Graph or Empty State */}
      {!hasData ? (
        <View style={[styles.emptyBox, { height: chartHeight }]}>
          <Ionicons name="bar-chart-outline" size={32} color={colors.textMuted} style={{ marginBottom: 6 }} />
          <Text style={{ color: colors.textSecondary, fontWeight: '600', textAlign: 'center', fontSize: 13 }}>
            No Data Recorded
          </Text>
          <Caption style={{ textAlign: 'center', color: colors.textMuted, marginTop: 4, paddingHorizontal: 20 }}>
            {queryResult?.emptyReason || 'Complete a workout session to begin tracking progress over time.'}
          </Caption>
        </View>
      ) : (
        <View style={{ height: chartHeight, position: 'relative' }}>
          <Svg width={containerWidth - 32} height={chartHeight}>
            <Defs>
              <LinearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={activeColor} stopOpacity="0.25" />
                <Stop offset="100%" stopColor={activeColor} stopOpacity="0.0" />
              </LinearGradient>
            </Defs>

            {/* Baseline & Top Grid Lines */}
            <Line
              x1={paddingLeft}
              y1={paddingTop + plotHeight}
              x2={paddingLeft + plotWidth}
              y2={paddingTop + plotHeight}
              stroke={colors.borderSubtle}
              strokeWidth="1"
            />
            <Line
              x1={paddingLeft}
              y1={paddingTop + plotHeight / 2}
              x2={paddingLeft + plotWidth}
              y2={paddingTop + plotHeight / 2}
              stroke={colors.borderSubtle}
              strokeWidth="1"
              strokeDasharray="4, 4"
            />
            <Line
              x1={paddingLeft}
              y1={paddingTop}
              x2={paddingLeft + plotWidth}
              y2={paddingTop}
              stroke={colors.borderSubtle}
              strokeWidth="1"
              strokeDasharray="4, 4"
            />

            {/* Y Axis Reference Labels */}
            <SvgText
              x={paddingLeft - 6}
              y={paddingTop + 4}
              fill={colors.textMuted}
              fontSize="9"
              textAnchor="end"
              fontFamily="monospace"
            >
              {Math.round(maxVal)}
            </SvgText>
            <SvgText
              x={paddingLeft - 6}
              y={paddingTop + plotHeight / 2 + 3}
              fill={colors.textMuted}
              fontSize="9"
              textAnchor="end"
              fontFamily="monospace"
            >
              {Math.round((maxVal + minVal) / 2)}
            </SvgText>
            <SvgText
              x={paddingLeft - 6}
              y={paddingTop + plotHeight + 3}
              fill={colors.textMuted}
              fontSize="9"
              textAnchor="end"
              fontFamily="monospace"
            >
              {Math.round(minVal)}
            </SvgText>

            {/* Gradient Fill under Path */}
            {points.length > 1 && (
              <Path
                d={`${pathD} L ${points[points.length - 1].x} ${paddingTop + plotHeight} L ${points[0].x} ${paddingTop + plotHeight} Z`}
                fill="url(#chartGrad)"
              />
            )}

            {/* Main Connecting Stroke */}
            {points.length > 1 && (
              <Path
                d={pathD}
                fill="none"
                stroke={activeColor}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Data Circles */}
            {points.map((p, idx) => {
              const isSelected = selectedPoint && selectedPoint.date === p.date;
              return (
                <Circle
                  key={`pt-${idx}`}
                  cx={p.x}
                  cy={p.y}
                  r={isSelected ? 5 : points.length > 20 ? 2.5 : 3.5}
                  fill={isSelected ? (isDark ? '#FFFFFF' : '#000000') : activeColor}
                  stroke={colors.surface}
                  strokeWidth={isSelected ? 2 : 1}
                />
              );
            })}

            {/* X-Axis Date Labels (First and Last) */}
            {points.length > 0 && (
              <>
                <SvgText
                  x={points[0].x}
                  y={chartHeight - 8}
                  fill={colors.textMuted}
                  fontSize="9"
                  textAnchor="start"
                >
                  {points[0].label}
                </SvgText>
                {points.length > 1 && (
                  <SvgText
                    x={points[points.length - 1].x}
                    y={chartHeight - 8}
                    fill={colors.textMuted}
                    fontSize="9"
                    textAnchor="end"
                  >
                    {points[points.length - 1].label}
                  </SvgText>
                )}
              </>
            )}
          </Svg>
        </View>
      )}

      {/* View Details Action Footer */}
      <View style={[styles.footerRow, { borderTopColor: colors.borderSubtle }]}>
        <Caption style={{ color: colors.textMuted, fontSize: 11 }}>
          {points.length} verified data points in this window
        </Caption>

        <TouchableOpacity
          onPress={onOpenDetailsModal}
          disabled={!hasData}
          style={[
            styles.viewDetailsBtn,
            {
              backgroundColor: isDark ? 'rgba(0,229,255,0.1)' : `${colors.primary}12`,
              borderRadius: borderRadius.xs,
              opacity: hasData ? 1 : 0.5,
            },
          ]}
          activeOpacity={0.7}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: isDark ? colors.cyan : colors.primary,
            }}
          >
            View Details →
          </Text>
        </TouchableOpacity>
      </View>

      {/* Exercise Picker Selector Modal */}
      {exerciseModalVisible && (
        <ScrollView
          style={[
            styles.exerciseDropdown,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: borderRadius.md,
            },
          ]}
        >
          <TouchableOpacity
            onPress={() => {
              onSelectExercise('ALL');
              setExerciseModalVisible(false);
            }}
            style={[styles.dropdownItem, { borderBottomColor: colors.borderSubtle }]}
          >
            <Text style={{ fontWeight: '700', color: colors.textPrimary }}>All Exercises</Text>
          </TouchableOpacity>
          {exercises.map((ex) => (
            <TouchableOpacity
              key={ex.id}
              onPress={() => {
                onSelectExercise(ex.id);
                setExerciseModalVisible(false);
              }}
              style={[styles.dropdownItem, { borderBottomColor: colors.borderSubtle }]}
            >
              <Text style={{ color: colors.textPrimary, fontSize: 13 }}>{ex.name}</Text>
              <Caption style={{ color: colors.textMuted }}>{ex.primaryMuscle}</Caption>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      </Card>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  metricPillsScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 12,
  },
  metricPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  exercisePickerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
  },
  rangePillBox: {
    flexDirection: 'row',
    padding: 2,
  },
  rangeBtn: {
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  metricHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  viewDetailsBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  exerciseDropdown: {
    position: 'absolute',
    top: 90,
    left: 16,
    right: 16,
    maxHeight: 250,
    borderWidth: 1,
    zIndex: 999,
    elevation: 8,
    paddingHorizontal: 10,
  },
  dropdownItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
});
