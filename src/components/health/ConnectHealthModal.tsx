import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { THEME } from '../../constants/theme';
import { Modal } from '../ui/Modal';
import { Heading, Text, Caption, MonoText } from '../ui/Typography';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { HealthPermission } from '../../types/health.types';
import { useHealthStore } from '../../store/useHealthStore';

interface ConnectHealthModalProps {
  visible: boolean;
  userId: string;
  onClose: () => void;
}

interface PermissionItem {
  id: string;
  title: string;
  icon: string;
  permissions: HealthPermission[];
  what: string;
  why: string;
  how: string;
  isOptional?: boolean;
}

const PERMISSION_ITEMS: PermissionItem[] = [
  {
    id: 'steps',
    title: 'Steps & Locomotive Movement',
    icon: '🚶',
    permissions: ['READ_STEPS'],
    what: 'Cumulative daily step counts from wearables and phone sensors.',
    why: 'Advances daily step quests, consistency protocols, and locomotive streaks.',
    how: 'Calculated privately on-device. Never awards gym strength XP.',
  },
  {
    id: 'cardio',
    title: 'Cardio Sessions & Distance',
    icon: '🏃',
    permissions: ['READ_EXERCISE', 'READ_DISTANCE'],
    what: 'Running, cycling, rowing, and endurance sessions with GPS distance.',
    why: 'Conquers distance directives (e.g., CARDIO RUSH) and cardio duration targets.',
    how: 'Evaluates sessions >= 10 mins against active squad and system challenges.',
  },
  {
    id: 'weight',
    title: 'Bodyweight Progression',
    icon: '⚖️',
    permissions: ['READ_WEIGHT'],
    what: 'Smart scale and wearable bodyweight measurements.',
    why: 'Automatically updates physique trends and relative strength calculations.',
    how: 'Strictly quarantined to your personal dashboard. Never visible to friends.',
  },
  {
    id: 'heart_rate',
    title: 'Heart Rate Intensity (Optional)',
    icon: '❤️',
    permissions: ['READ_HEART_RATE'],
    what: 'Average and peak beats-per-minute during qualifying workouts.',
    why: 'Measures cardiovascular conditioning intensity and recovery efficiency.',
    how: 'Private biometric analysis only. Never broadcast to activity feeds.',
    isOptional: true,
  },
];

export const ConnectHealthModal: React.FC<ConnectHealthModalProps> = ({
  visible,
  userId,
  onClose,
}) => {
  const { connect, isConnected, disconnect } = useHealthStore();
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({
    steps: true,
    cardio: true,
    weight: true,
    heart_rate: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleItem = (id: string) => {
    setSelectedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleConnect = async () => {
    setIsSubmitting(true);
    try {
      const permsToRequest: HealthPermission[] = [];
      for (const item of PERMISSION_ITEMS) {
        if (selectedItems[item.id]) {
          permsToRequest.push(...item.permissions);
        }
      }

      if (permsToRequest.length === 0) {
        Alert.alert('No Telemetry Selected', 'Please select at least one health permission to connect.');
        setIsSubmitting(false);
        return;
      }

      const success = await connect(userId, permsToRequest);
      if (success) {
        Alert.alert('Health Connect Activated', 'Peripheral telemetry linked successfully. Directives will advance automatically.');
        onClose();
      } else {
        Alert.alert(
          'Permissions Notice',
          'Health Connect permissions were not granted or the service is unavailable on this device. ASCEND will continue working in standalone offline mode.'
        );
      }
    } catch (err: any) {
      Alert.alert('Connection Error', err.message || 'Failed to connect Health Connect');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisconnect = async () => {
    Alert.alert(
      'Disconnect Health Data',
      'Are you sure you want to unlink Health Connect? ASCEND will stop receiving external wearable telemetry.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            await disconnect(userId);
            Alert.alert('Disconnected', 'Health Connect integration has been unlinked.');
            onClose();
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} onClose={onClose} title="HEALTH CONNECT INTEGRATION">
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Architecture Header */}
        <Card style={styles.headerCard}>
          <View style={styles.statusRow}>
            <Badge
              label={isConnected ? 'CONNECTED' : 'DISCONNECTED'}
              variant={isConnected ? 'emerald' : 'neutral'}
            />
            <Badge label="ANDROID HEALTH CONNECT" variant="cyan" />
          </View>
          <Heading level={3} style={styles.title}>
            Connect Peripheral Health Data
          </Heading>
          <Text style={styles.subtitle}>
            Link Android Health Connect to feed peripheral steps, cardio, and bodyweight into ASCEND directives while preserving your local database sovereignty.
          </Text>
        </Card>

        {/* Permission Rationale Cards */}
        <Heading level={3} style={styles.sectionHeading}>
          SELECT TELEMETRY PERMISSIONS
        </Heading>

        {PERMISSION_ITEMS.map((item) => {
          const isChecked = Boolean(selectedItems[item.id]);

          return (
            <Card key={item.id} style={[styles.permissionCard, isChecked && styles.permissionCardActive]}>
              <View style={styles.cardTopRow}>
                <View style={styles.titleArea}>
                  <Text style={styles.iconGlyph}>{item.icon}</Text>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                </View>
                <Switch
                  value={isChecked}
                  onValueChange={() => toggleItem(item.id)}
                  trackColor={{ false: THEME.colors.border, true: THEME.colors.cyan }}
                  thumbColor={isChecked ? THEME.colors.textPrimary : THEME.colors.textMuted}
                />
              </View>

              <View style={styles.detailGrid}>
                <View style={styles.detailRow}>
                  <Caption style={styles.detailLabel}>WHAT WE READ:</Caption>
                  <Text style={styles.detailText}>{item.what}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Caption style={styles.detailLabel}>WHY WE READ IT:</Caption>
                  <Text style={styles.detailText}>{item.why}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Caption style={styles.detailLabel}>HOW IT IS USED:</Caption>
                  <Text style={styles.detailText}>{item.how}</Text>
                </View>
              </View>
            </Card>
          );
        })}

        {/* Privacy & Anti-Leakage Shield */}
        <Card style={styles.privacyShieldCard}>
          <View style={styles.shieldHeader}>
            <Text style={styles.shieldIcon}>🛡️</Text>
            <Heading level={3} style={styles.shieldTitle}>
              Zero Health Leakage Guarantee
            </Heading>
          </View>
          <Text style={styles.shieldText}>
            Health data is strictly quarantined on your local device. ASCEND will <MonoText style={styles.highlight}>NEVER</MonoText> publish your heart rate, weight, active calories, or detailed wearable timelines to social feeds, friend profiles, or external ad brokers.
          </Text>
        </Card>

        {/* Action Buttons */}
        <View style={styles.actionContainer}>
          {isConnected ? (
            <Button
              title="DISCONNECT HEALTH DATA"
              variant="outline"
              onPress={handleDisconnect}
              style={{ marginBottom: 10 }}
            />
          ) : (
            <Button
              title={isSubmitting ? "CONNECTING..." : "CONNECT HEALTH DATA"}
              variant="primary"
              onPress={handleConnect}
              disabled={isSubmitting}
              style={{ marginBottom: 10 }}
            />
          )}

          <Button
            title="SKIP / USE APP OFFLINE"
            variant="ghost"
            onPress={onClose}
          />
        </View>
      </ScrollView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 24,
  },
  headerCard: {
    padding: 16,
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  title: {
    color: THEME.colors.textPrimary,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    lineHeight: 18,
  },
  sectionHeading: {
    fontSize: 12,
    color: THEME.colors.textMuted,
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 4,
  },
  permissionCard: {
    padding: 14,
    marginBottom: 12,
    borderColor: THEME.colors.border,
  },
  permissionCardActive: {
    borderColor: 'rgba(0, 229, 255, 0.35)',
    backgroundColor: 'rgba(0, 229, 255, 0.03)',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  titleArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  iconGlyph: {
    fontSize: 18,
  },
  itemTitle: {
    fontWeight: '700',
    fontSize: 14,
    color: THEME.colors.textPrimary,
  },
  detailGrid: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    padding: 10,
    borderRadius: 6,
    gap: 6,
  },
  detailRow: {
    marginBottom: 2,
  },
  detailLabel: {
    color: THEME.colors.cyan,
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 2,
  },
  detailText: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    lineHeight: 16,
  },
  privacyShieldCard: {
    padding: 14,
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
    borderColor: 'rgba(16, 185, 129, 0.25)',
    marginBottom: 20,
  },
  shieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  shieldIcon: {
    fontSize: 16,
  },
  shieldTitle: {
    color: THEME.colors.emerald,
    fontSize: 14,
  },
  shieldText: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    lineHeight: 18,
  },
  highlight: {
    color: THEME.colors.textPrimary,
    fontWeight: '700',
  },
  actionContainer: {
    marginTop: 8,
  },
});
