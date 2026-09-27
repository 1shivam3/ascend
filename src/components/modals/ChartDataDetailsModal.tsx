import React from 'react';
import {
  Modal,
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../constants/theme';
import { Heading, Text, Caption, MonoText } from '../ui/Typography';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { ChartDataPoint, ChartQueryResult } from '../../services/progress/ProgressAnalyticsService';

interface ChartDataDetailsModalProps {
  visible: boolean;
  queryResult: ChartQueryResult | null;
  exerciseName?: string;
  onClose: () => void;
}

export const ChartDataDetailsModal: React.FC<ChartDataDetailsModalProps> = ({
  visible,
  queryResult,
  exerciseName,
  onClose,
}) => {
  const { colors, borderRadius, isDark } = useTheme();

  if (!queryResult) return null;

  const points = [...queryResult.data].reverse(); // Chronological: most recent first

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Heading level={3} style={{ color: colors.textPrimary }}>
              Data Points Breakdown
            </Heading>
            <Caption style={{ color: colors.textSecondary, marginTop: 2 }}>
              {queryResult.metric.replace(/_/g, ' ')} • {exerciseName || 'All Data'} ({points.length} entries)
            </Caption>
          </View>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={[styles.closeBtn, { backgroundColor: colors.surface }]}
          >
            <Ionicons name="close" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Metric Summary Bar */}
        <View style={[styles.summaryBar, { backgroundColor: colors.surface }]}>
          <View style={styles.summaryItem}>
            <Caption style={{ color: colors.textMuted, fontSize: 10 }}>CURRENT</Caption>
            <MonoText style={{ fontSize: 16, fontWeight: '800', color: colors.textPrimary }}>
              {queryResult.currentValue} {queryResult.unit}
            </MonoText>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Caption style={{ color: colors.textMuted, fontSize: 10 }}>NET CHANGE</Caption>
            <MonoText
              style={{
                fontSize: 16,
                fontWeight: '800',
                color: queryResult.delta >= 0 ? colors.emerald : colors.crimson,
              }}
            >
              {queryResult.delta > 0 ? `+${queryResult.delta}` : queryResult.delta} {queryResult.unit}
            </MonoText>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Caption style={{ color: colors.textMuted, fontSize: 10 }}>METHOD</Caption>
            <Badge
              label={queryResult.isEstimatedMetric ? 'ESTIMATED' : 'RECORDED'}
              variant={queryResult.isEstimatedMetric ? 'amber' : 'emerald'}
              size="sm"
            />
          </View>
        </View>

        {/* Data Points List */}
        <ScrollView contentContainerStyle={styles.listContent}>
          {points.length === 0 ? (
            <Card variant="surface" style={styles.emptyCard}>
              <Ionicons name="analytics-outline" size={32} color={colors.textMuted} style={{ marginBottom: 8 }} />
              <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>
                No telemetry recorded for this metric in this window.
              </Text>
            </Card>
          ) : (
            points.map((p, idx) => (
              <Card key={`${p.date}-${idx}`} variant="surface" style={styles.itemCard}>
                <View style={styles.itemHeader}>
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>
                      {p.exerciseName || p.workoutTitle || queryResult.metric.replace(/_/g, ' ')}
                    </Text>
                    <Caption style={{ color: colors.textMuted }}>{p.date}</Caption>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <MonoText style={{ fontSize: 17, fontWeight: '800', color: colors.textPrimary }}>
                      {p.value} {queryResult.unit}
                    </MonoText>
                    <Badge
                      label={p.isEstimated ? 'EPLEY FORMULA' : 'RECORDED'}
                      variant={p.isEstimated ? 'amber' : 'emerald'}
                      size="sm"
                    />
                  </View>
                </View>
                {p.details && (
                  <View style={[styles.detailsBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F1F5F9', borderRadius: borderRadius.xs }]}>
                    <Caption style={{ color: colors.textSecondary, fontSize: 12 }}>
                      {p.details}
                    </Caption>
                  </View>
                )}
              </Card>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryBar: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryItem: {
    alignItems: 'center',
    gap: 4,
  },
  summaryDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(150, 150, 150, 0.2)',
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  emptyCard: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemCard: {
    padding: 14,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  detailsBox: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
