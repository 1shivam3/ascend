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
import { Heading, Text, Caption, MonoText } from '../ui/Typography';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

interface LogWeightModalProps {
  visible: boolean;
  currentWeightKg?: number;
  onClose: () => void;
  onSave: (weightKg: number) => Promise<void>;
}

export const LogWeightModal: React.FC<LogWeightModalProps> = ({
  visible,
  currentWeightKg = 75,
  onClose,
  onSave,
}) => {
  const { colors, borderRadius, isDark } = useTheme();
  const [weightStr, setWeightStr] = useState(String(currentWeightKg || 75));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const val = parseFloat(weightStr);
    if (isNaN(val) || val < 30 || val > 350) {
      setError('Please enter a valid weight between 30 kg and 350 kg.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await onSave(Math.round(val * 10) / 10);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save weight record');
    } finally {
      setSaving(false);
    }
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
              <View
                style={[
                  styles.iconBox,
                  { backgroundColor: `${colors.emerald}20`, borderRadius: borderRadius.sm },
                ]}
              >
                <Ionicons name="speedometer-outline" size={20} color={colors.emerald} />
              </View>
              <Heading level={3} style={{ color: colors.textPrimary }}>
                Log Scale Weight
              </Heading>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <Caption style={{ color: colors.textSecondary, marginTop: 4, marginBottom: 16 }}>
            Track scale trends over time to monitor relative strength and physical adaptation.
          </Caption>

          {/* Weight Input Row */}
          <View
            style={[
              styles.inputContainer,
              {
                borderColor: error ? colors.crimson : colors.border,
                backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC',
                borderRadius: borderRadius.md,
              },
            ]}
          >
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              value={weightStr}
              onChangeText={(t) => {
                setWeightStr(t);
                if (error) setError(null);
              }}
              keyboardType="decimal-pad"
              placeholder="e.g. 75.5"
              placeholderTextColor={colors.textMuted}
              autoFocus
              selectTextOnFocus
            />
            <MonoText style={[styles.unitText, { color: colors.emerald }]}>KG</MonoText>
          </View>

          {/* Quick Increment/Decrement Chips */}
          <View style={styles.chipRow}>
            {[-0.5, -0.1, +0.1, +0.5].map((delta) => (
              <TouchableOpacity
                key={delta}
                onPress={() => {
                  const curr = parseFloat(weightStr) || currentWeightKg;
                  setWeightStr((Math.round((curr + delta) * 10) / 10).toFixed(1));
                  Haptics.selectionAsync();
                }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#EDF2F7',
                    borderRadius: borderRadius.full,
                  },
                ]}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary }}>
                  {delta > 0 ? `+${delta}` : delta} kg
                </Text>
              </TouchableOpacity>
            ))}
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
              title={saving ? 'Saving...' : 'Record Weight'}
              variant="primary"
              size="md"
              disabled={saving}
              onPress={handleSave}
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
  iconBox: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    paddingHorizontal: 16,
    height: 56,
  },
  input: {
    flex: 1,
    fontSize: 24,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  unitText: {
    fontSize: 16,
    fontWeight: '800',
    marginLeft: 8,
  },
  chipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 6,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
});
