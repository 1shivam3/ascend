import React, { useState } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../constants/theme';
import { Heading, Text, Caption } from '../ui/Typography';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

interface CustomDateRangeModalProps {
  visible: boolean;
  initialStartDate?: string;
  initialEndDate?: string;
  onClose: () => void;
  onApply: (startDate: string, endDate: string) => void;
}

export const CustomDateRangeModal: React.FC<CustomDateRangeModalProps> = ({
  visible,
  initialStartDate,
  initialEndDate,
  onClose,
  onApply,
}) => {
  const { colors, borderRadius, isDark } = useTheme();

  const defaultEnd = initialEndDate ? initialEndDate.substring(0, 10) : new Date().toISOString().substring(0, 10);
  const defStart = new Date();
  defStart.setDate(defStart.getDate() - 45);
  const defaultStart = initialStartDate ? initialStartDate.substring(0, 10) : defStart.toISOString().substring(0, 10);

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [error, setError] = useState<string | null>(null);

  const applyPreset = (daysBack: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - daysBack);
    setStartDate(start.toISOString().substring(0, 10));
    setEndDate(end.toISOString().substring(0, 10));
    setError(null);
    Haptics.selectionAsync();
  };

  const applyYearToDate = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    setStartDate(start.toISOString().substring(0, 10));
    setEndDate(now.toISOString().substring(0, 10));
    setError(null);
    Haptics.selectionAsync();
  };

  const handleApply = () => {
    const startValid = /^\d{4}-\d{2}-\d{2}$/.test(startDate);
    const endValid = /^\d{4}-\d{2}-\d{2}$/.test(endDate);

    if (!startValid || !endValid) {
      setError('Please enter dates in YYYY-MM-DD format (e.g. 2026-01-15).');
      return;
    }

    if (new Date(startDate).getTime() > new Date(endDate).getTime()) {
      setError('Start date must be before or equal to end date.');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onApply(new Date(startDate).toISOString(), new Date(endDate).toISOString());
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <Card variant="elevated" style={[styles.modalCard, { backgroundColor: colors.surface }]}>
          <View style={styles.headerRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="calendar-outline" size={20} color={isDark ? colors.cyan : colors.primary} />
              <Heading level={3} style={{ color: colors.textPrimary }}>
                Custom Time Range
              </Heading>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <Caption style={{ color: colors.textSecondary, marginTop: 4, marginBottom: 14 }}>
            Filter chart metrics and progression trends to a specific training window.
          </Caption>

          {/* Quick Presets */}
          <View style={styles.presetRow}>
            <TouchableOpacity
              onPress={() => applyPreset(14)}
              style={[styles.presetBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#EDF2F7', borderRadius: borderRadius.sm }]}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary }}>14 Days</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => applyPreset(60)}
              style={[styles.presetBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#EDF2F7', borderRadius: borderRadius.sm }]}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary }}>60 Days</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => applyPreset(180)}
              style={[styles.presetBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#EDF2F7', borderRadius: borderRadius.sm }]}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary }}>180 Days</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={applyYearToDate}
              style={[styles.presetBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#EDF2F7', borderRadius: borderRadius.sm }]}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary }}>YTD</Text>
            </TouchableOpacity>
          </View>

          {/* Date Inputs */}
          <View style={styles.inputSection}>
            <View style={{ flex: 1 }}>
              <Caption style={{ color: colors.textMuted, marginBottom: 4, fontWeight: '700' }}>START DATE</Caption>
              <TextInput
                style={[
                  styles.dateInput,
                  {
                    color: colors.textPrimary,
                    borderColor: colors.border,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC',
                    borderRadius: borderRadius.md,
                  },
                ]}
                value={startDate}
                onChangeText={(t) => {
                  setStartDate(t);
                  if (error) setError(null);
                }}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Caption style={{ color: colors.textMuted, marginBottom: 4, fontWeight: '700' }}>END DATE</Caption>
              <TextInput
                style={[
                  styles.dateInput,
                  {
                    color: colors.textPrimary,
                    borderColor: colors.border,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC',
                    borderRadius: borderRadius.md,
                  },
                ]}
                value={endDate}
                onChangeText={(t) => {
                  setEndDate(t);
                  if (error) setError(null);
                }}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          {error && (
            <Caption style={{ color: colors.crimson, marginTop: 10, textAlign: 'center' }}>
              {error}
            </Caption>
          )}

          <View style={styles.actionRow}>
            <Button
              title="Cancel"
              variant="outline"
              size="md"
              onPress={onClose}
              style={{ flex: 1 }}
            />
            <Button
              title="Apply Filter"
              variant="primary"
              size="md"
              onPress={handleApply}
              style={{ flex: 1 }}
            />
          </View>
        </Card>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    padding: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  presetBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
  },
  inputSection: {
    flexDirection: 'row',
    gap: 12,
  },
  dateInput: {
    height: 46,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
  },
});
