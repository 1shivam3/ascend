import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../constants/theme';
import { Heading, Text, Caption, MonoText } from '../ui/Typography';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import {
  AvatarConfig,
  FramePresentation,
  ArmorStyle,
  ChassisTint,
  AccentGlow,
  HeadStyle,
  OptionalMeasurements,
} from '../../types/avatar.types';
import { AvatarMorphEngine } from '../../services/avatar/AvatarMorphEngine';
import { Character2D } from './Character2D';

export interface AvatarCustomizationModalProps {
  visible: boolean;
  onClose: () => void;
  initialConfig?: AvatarConfig | null;
  heightCm?: number;
  weightKg?: number;
  experience?: string;
  goal?: string;
  onSave: (config: AvatarConfig) => Promise<void>;
  preferredUnit?: 'kg' | 'lbs';
}

const FRAME_OPTIONS: { id: FramePresentation; name: string; desc: string; icon: string }[] = [
  {
    id: 'MASCULINE_VANGUARD',
    name: 'VANGUARD',
    desc: 'Heroic broad-shoulder V-taper athletic frame',
    icon: 'body-outline',
  },
  {
    id: 'FEMININE_STRIKER',
    name: 'STRIKER',
    desc: 'Sleek, aerodynamic athletic taper with balanced silhouette',
    icon: 'flash-outline',
  },
  {
    id: 'HEAVY_TITAN',
    name: 'TITAN',
    desc: 'Maximum mass powerlifter frame with heavy armor plating',
    icon: 'shield-outline',
  },
  {
    id: 'CYBER_CHASSIS',
    name: 'CYBERNETIC',
    desc: 'Angular biomechanical exo-frame with reinforced kinetic joints',
    icon: 'hardware-chip-outline',
  },
];

const ARMOR_OPTIONS: { id: ArmorStyle; name: string; desc: string }[] = [
  { id: 'TACTICAL_NANOWEAVE', name: 'Nanoweave Combat', desc: 'Flexible ballistic nanoweave' },
  { id: 'HEAVY_EXO_PLATING', name: 'Titanium Exo-Plates', desc: 'High-density kinetic armor' },
  { id: 'STEALTH_SUIT', name: 'Stealth Shadow', desc: 'Lightweight low-signature chassis' },
  { id: 'CYBER_SAMURAI', name: 'Vanguard Samurai', desc: 'Layered tactical lamellar plates' },
];

const CHASSIS_TINT_OPTIONS: { id: ChassisTint; name: string; hex: string }[] = [
  { id: 'STEALTH_MATTE', name: 'Charcoal Matte', hex: '#1E2638' },
  { id: 'CYBER_CYAN', name: 'Cyber Cyan', hex: '#132B3B' },
  { id: 'TITANIUM_FROST', name: 'Titanium Frost', hex: '#4A5568' },
  { id: 'VANGUARD_CRIMSON', name: 'Vanguard Red', hex: '#450A0A' },
  { id: 'OBSIDIAN_GOLD', name: 'Obsidian Gold', hex: '#3B2D11' },
  { id: 'EMERALD_TECH', name: 'Emerald Tech', hex: '#064E3B' },
];

const GLOW_OPTIONS: { id: AccentGlow; name: string; hex: string }[] = [
  { id: 'CYAN_PULSE', name: 'Cyan Pulse', hex: '#00E5FF' },
  { id: 'EMERALD_OVERDRIVE', name: 'Emerald', hex: '#10B981' },
  { id: 'AMBER_CORE', name: 'Amber Core', hex: '#F59E0B' },
  { id: 'CRIMSON_THREAT', name: 'Crimson', hex: '#EF4444' },
  { id: 'AMETHYST_PSIONIC', name: 'Amethyst', hex: '#A855F7' },
  { id: 'PURE_WHITE', name: 'Pure White', hex: '#F8FAFC' },
];

const HEAD_OPTIONS: { id: HeadStyle; name: string; desc: string }[] = [
  { id: 'TACTICAL_VISOR', name: 'HUD Visor', desc: 'Augmented optic visor' },
  { id: 'CYBER_HELMET', name: 'Full Cyber Helmet', desc: 'Sealed kinetic helmet' },
  { id: 'CRESTED_GUARD', name: 'Crested Guard', desc: 'Aero battle crest' },
  { id: 'SLEEK_HOOD', name: 'Shadow Cowl', desc: 'Sleek low-profile tactical cowl' },
];

type CustomizerTab = 'FRAME' | 'ARMOR' | 'GLOW' | 'MEASUREMENTS';

export const AvatarCustomizationModal: React.FC<AvatarCustomizationModalProps> = ({
  visible,
  onClose,
  initialConfig,
  heightCm = 175,
  weightKg = 75,
  experience = 'INTERMEDIATE',
  goal = 'GET_STRONGER',
  onSave,
  preferredUnit = 'kg',
}) => {
  const { colors, borderRadius, isDark } = useTheme();

  const [activeTab, setActiveTab] = useState<CustomizerTab>('FRAME');
  const [isSaving, setIsSaving] = useState(false);

  // Local draft configuration
  const [draftConfig, setDraftConfig] = useState<AvatarConfig>(() => {
    return (
      initialConfig ||
      AvatarMorphEngine.getDefaultAvatarConfig({
        viewModePreference: '3D',
      })
    );
  });

  // Optional measurements text state (cm)
  const [measurements, setMeasurements] = useState<OptionalMeasurements>(
    draftConfig.measurements || {}
  );

  useEffect(() => {
    if (visible && initialConfig) {
      setDraftConfig(initialConfig);
      setMeasurements(initialConfig.measurements || {});
    }
  }, [visible, initialConfig]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const finalConfig: AvatarConfig = {
        ...draftConfig,
        measurements: Object.keys(measurements).length > 0 ? measurements : undefined,
        updatedAt: new Date().toISOString(),
      };
      await onSave(finalConfig);
      onClose();
    } catch (err) {
      console.error('Failed to save avatar config:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    const defaultConfig = AvatarMorphEngine.getDefaultAvatarConfig({
      viewModePreference: draftConfig.viewModePreference,
    });
    setDraftConfig(defaultConfig);
    setMeasurements({});
  };

  const palette = AvatarMorphEngine.getColorPalette(
    draftConfig.chassisTint,
    draftConfig.accentGlow,
    isDark
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={[styles.modalContainer, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header Bar */}
        <View style={[styles.headerBar, { borderBottomColor: colors.borderSubtle }]}>
          <View>
            <Heading level={2} style={styles.title}>
              AVATAR CALIBRATION
            </Heading>
            <Caption style={{ color: colors.textSecondary }}>
              Tactical chassis customization & proportions
            </Caption>
          </View>

          <TouchableOpacity
            onPress={onClose}
            style={[
              styles.closeBtn,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
            ]}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={18} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Real-time 3D Preview Card */}
          <Card variant="surface" style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <Badge label="INTERACTIVE 2D CHARACTER" variant="cyan" size="sm" />
              <Caption style={{ color: colors.textMuted, fontSize: 11 }}>
                Tap Front / Back or swipe
              </Caption>
            </View>

            <View style={styles.avatarViewportBox}>
              <Character2D
                height={230}
                onSelectRegion={() => {}}
                selectedRegion={null}
                globalLevel={15}
                rankTier="A"
              />
            </View>
          </Card>

          {/* Explicit Medical / Accuracy Disclaimer */}
          <View
            style={[
              styles.disclaimerBanner,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0,0,0,0.02)',
                borderColor: colors.borderSubtle,
                borderRadius: borderRadius.md,
              },
            ]}
          >
            <Ionicons
              name="shield-checkmark-outline"
              size={16}
              color={palette.glow}
              style={{ marginRight: 8, marginTop: 2 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.disclaimerTitle, { color: colors.textPrimary }]}>
                Stylized Cybernetic Representation
              </Text>
              <Caption style={[styles.disclaimerBody, { color: colors.textSecondary }]}>
                This avatar is a game-style character estimated dynamically from your training
                parameters and preferences. ASCEND will never ask you to upload a photo and does
                not claim this is an exact medical body scan.
              </Caption>
            </View>
          </View>

          {/* Navigation Category Tabs */}
          <View style={styles.categoryTabsRow}>
            {(['FRAME', 'ARMOR', 'GLOW', 'MEASUREMENTS'] as CustomizerTab[]).map((tab) => {
              const isActive = activeTab === tab;
              return (
                <TouchableOpacity
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  style={[
                    styles.categoryTabBtn,
                    {
                      backgroundColor: isActive
                        ? isDark
                          ? 'rgba(0, 229, 255, 0.15)'
                          : `${colors.primary}15`
                        : colors.surfaceElevated,
                      borderColor: isActive ? palette.glow : colors.borderSubtle,
                      borderRadius: borderRadius.sm,
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <MonoText
                    style={[
                      styles.categoryTabText,
                      { color: isActive ? palette.glow : colors.textSecondary },
                    ]}
                  >
                    {tab}
                  </MonoText>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* TAB 1: FRAME & ARCHETYPE */}
          {activeTab === 'FRAME' && (
            <View style={styles.tabSection}>
              <Caption upper style={styles.sectionHeader}>
                CHOOSE FRAME PRESENTATION
              </Caption>
              <View style={styles.frameGrid}>
                {FRAME_OPTIONS.map((f) => {
                  const isSelected = draftConfig.frame === f.id;
                  return (
                    <TouchableOpacity
                      key={f.id}
                      onPress={() => setDraftConfig((prev) => ({ ...prev, frame: f.id }))}
                      style={[
                        styles.frameCard,
                        {
                          backgroundColor: isSelected
                            ? isDark
                              ? 'rgba(0, 229, 255, 0.12)'
                              : `${colors.primary}12`
                            : colors.surfaceElevated,
                          borderColor: isSelected ? palette.glow : colors.border,
                          borderRadius: borderRadius.md,
                        },
                      ]}
                      activeOpacity={0.7}
                    >
                      <View style={styles.frameCardTop}>
                        <Ionicons
                          name={f.icon as any}
                          size={20}
                          color={isSelected ? palette.glow : colors.textSecondary}
                        />
                        {isSelected && (
                          <Ionicons name="checkmark-circle" size={16} color={palette.glow} />
                        )}
                      </View>
                      <Text style={[styles.frameName, { color: colors.textPrimary }]}>
                        {f.name}
                      </Text>
                      <Caption style={[styles.frameDesc, { color: colors.textMuted }]}>
                        {f.desc}
                      </Caption>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Head / Visor Style */}
              <Caption upper style={[styles.sectionHeader, { marginTop: 18 }]}>
                HEAD & VISOR STYLE
              </Caption>
              <View style={styles.headGrid}>
                {HEAD_OPTIONS.map((h) => {
                  const isSelected = draftConfig.headStyle === h.id;
                  return (
                    <TouchableOpacity
                      key={h.id}
                      onPress={() => setDraftConfig((prev) => ({ ...prev, headStyle: h.id }))}
                      style={[
                        styles.headPill,
                        {
                          backgroundColor: isSelected
                            ? `${palette.glow}20`
                            : colors.surfaceElevated,
                          borderColor: isSelected ? palette.glow : colors.border,
                          borderRadius: borderRadius.sm,
                        },
                      ]}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.headName,
                          { color: isSelected ? palette.glow : colors.textPrimary },
                        ]}
                      >
                        {h.name}
                      </Text>
                      <Caption style={{ color: colors.textMuted, fontSize: 10 }}>
                        {h.desc}
                      </Caption>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* TAB 2: ARMOR STYLE & CHASSIS TINT */}
          {activeTab === 'ARMOR' && (
            <View style={styles.tabSection}>
              <Caption upper style={styles.sectionHeader}>
                ARMOR SUIT CLASS
              </Caption>
              <View style={styles.armorList}>
                {ARMOR_OPTIONS.map((a) => {
                  const isSelected = draftConfig.armorStyle === a.id;
                  return (
                    <TouchableOpacity
                      key={a.id}
                      onPress={() =>
                        setDraftConfig((prev) => ({ ...prev, armorStyle: a.id }))
                      }
                      style={[
                        styles.armorRow,
                        {
                          backgroundColor: isSelected
                            ? `${palette.glow}15`
                            : colors.surfaceElevated,
                          borderColor: isSelected ? palette.glow : colors.border,
                          borderRadius: borderRadius.md,
                        },
                      ]}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.armorName, { color: colors.textPrimary }]}>
                          {a.name}
                        </Text>
                        <Caption style={{ color: colors.textMuted }}>{a.desc}</Caption>
                      </View>
                      {isSelected && (
                        <Ionicons name="shield-checkmark" size={18} color={palette.glow} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Caption upper style={[styles.sectionHeader, { marginTop: 18 }]}>
                CHASSIS COATING & ALLOY TINT
              </Caption>
              <View style={styles.tintGrid}>
                {CHASSIS_TINT_OPTIONS.map((t) => {
                  const isSelected = draftConfig.chassisTint === t.id;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      onPress={() =>
                        setDraftConfig((prev) => ({ ...prev, chassisTint: t.id }))
                      }
                      style={[
                        styles.tintBtn,
                        {
                          backgroundColor: colors.surfaceElevated,
                          borderColor: isSelected ? palette.glow : colors.border,
                          borderRadius: borderRadius.md,
                        },
                      ]}
                      activeOpacity={0.7}
                    >
                      <View
                        style={[
                          styles.colorCircle,
                          { backgroundColor: t.hex, borderColor: colors.border },
                        ]}
                      />
                      <Text
                        style={[
                          styles.tintName,
                          { color: isSelected ? palette.glow : colors.textPrimary },
                        ]}
                      >
                        {t.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* TAB 3: NEON GLOW & LIGHTING */}
          {activeTab === 'GLOW' && (
            <View style={styles.tabSection}>
              <Caption upper style={styles.sectionHeader}>
                KINETIC GLOW & VISOR OPTIC HUE
              </Caption>
              <View style={styles.glowGrid}>
                {GLOW_OPTIONS.map((g) => {
                  const isSelected = draftConfig.accentGlow === g.id;
                  return (
                    <TouchableOpacity
                      key={g.id}
                      onPress={() =>
                        setDraftConfig((prev) => ({ ...prev, accentGlow: g.id }))
                      }
                      style={[
                        styles.glowCard,
                        {
                          backgroundColor: isSelected ? `${g.hex}20` : colors.surfaceElevated,
                          borderColor: isSelected ? g.hex : colors.border,
                          borderRadius: borderRadius.md,
                        },
                      ]}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.glowOrb, { backgroundColor: g.hex }]} />
                      <Text
                        style={[
                          styles.glowName,
                          { color: isSelected ? g.hex : colors.textPrimary },
                        ]}
                      >
                        {g.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Caption upper style={[styles.sectionHeader, { marginTop: 22 }]}>
                DEFAULT VIEWPORT MODE
              </Caption>
              <View style={styles.viewModeRow}>
                <TouchableOpacity
                  onPress={() =>
                    setDraftConfig((prev) => ({ ...prev, viewModePreference: '3D' }))
                  }
                  style={[
                    styles.viewModeOption,
                    {
                      backgroundColor:
                        draftConfig.viewModePreference === '3D'
                          ? `${palette.glow}20`
                          : colors.surfaceElevated,
                      borderColor:
                        draftConfig.viewModePreference === '3D'
                          ? palette.glow
                          : colors.border,
                      borderRadius: borderRadius.md,
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="cube"
                    size={20}
                    color={
                      draftConfig.viewModePreference === '3D'
                        ? palette.glow
                        : colors.textSecondary
                    }
                  />
                  <Text style={[styles.viewModeTitle, { color: colors.textPrimary }]}>
                    3D Holographic
                  </Text>
                  <Caption style={{ color: colors.textMuted, textAlign: 'center' }}>
                    360° perspective rotation with dynamic normal lighting
                  </Caption>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() =>
                    setDraftConfig((prev) => ({ ...prev, viewModePreference: '2D' }))
                  }
                  style={[
                    styles.viewModeOption,
                    {
                      backgroundColor:
                        draftConfig.viewModePreference === '2D'
                          ? `${palette.glow}20`
                          : colors.surfaceElevated,
                      borderColor:
                        draftConfig.viewModePreference === '2D'
                          ? palette.glow
                          : colors.border,
                      borderRadius: borderRadius.md,
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="analytics"
                    size={20}
                    color={
                      draftConfig.viewModePreference === '2D'
                        ? palette.glow
                        : colors.textSecondary
                    }
                  />
                  <Text style={[styles.viewModeTitle, { color: colors.textPrimary }]}>
                    2D Schematic
                  </Text>
                  <Caption style={{ color: colors.textMuted, textAlign: 'center' }}>
                    Ultra-lightweight anatomical map with minimal power usage
                  </Caption>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* TAB 4: OPTIONAL BODY MEASUREMENTS */}
          {activeTab === 'MEASUREMENTS' && (
            <View style={styles.tabSection}>
              <Caption upper style={styles.sectionHeader}>
                OPTIONAL PRECISION MEASUREMENTS
              </Caption>
              <Caption style={{ color: colors.textSecondary, marginBottom: 12 }}>
                Enter optional circumference metrics in centimeters to refine your avatar's
                proportions. Leave blank to use automated biometric estimates.
              </Caption>

              <View style={styles.measurementsGrid}>
                {/* Chest */}
                <View style={styles.inputGroup}>
                  <Caption upper style={styles.inputLabel}>
                    CHEST (CM)
                  </Caption>
                  <TextInput
                    style={[
                      styles.textInput,
                      {
                        backgroundColor: colors.surfaceElevated,
                        borderColor: colors.border,
                        color: colors.textPrimary,
                        borderRadius: borderRadius.sm,
                      },
                    ]}
                    placeholder="e.g. 102"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                    value={measurements.chestCm ? String(measurements.chestCm) : ''}
                    onChangeText={(val) => {
                      const num = parseFloat(val);
                      setMeasurements((prev) => ({
                        ...prev,
                        chestCm: isNaN(num) ? undefined : num,
                      }));
                    }}
                  />
                </View>

                {/* Waist */}
                <View style={styles.inputGroup}>
                  <Caption upper style={styles.inputLabel}>
                    WAIST (CM)
                  </Caption>
                  <TextInput
                    style={[
                      styles.textInput,
                      {
                        backgroundColor: colors.surfaceElevated,
                        borderColor: colors.border,
                        color: colors.textPrimary,
                        borderRadius: borderRadius.sm,
                      },
                    ]}
                    placeholder="e.g. 82"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                    value={measurements.waistCm ? String(measurements.waistCm) : ''}
                    onChangeText={(val) => {
                      const num = parseFloat(val);
                      setMeasurements((prev) => ({
                        ...prev,
                        waistCm: isNaN(num) ? undefined : num,
                      }));
                    }}
                  />
                </View>

                {/* Hips */}
                <View style={styles.inputGroup}>
                  <Caption upper style={styles.inputLabel}>
                    HIPS (CM)
                  </Caption>
                  <TextInput
                    style={[
                      styles.textInput,
                      {
                        backgroundColor: colors.surfaceElevated,
                        borderColor: colors.border,
                        color: colors.textPrimary,
                        borderRadius: borderRadius.sm,
                      },
                    ]}
                    placeholder="e.g. 96"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                    value={measurements.hipsCm ? String(measurements.hipsCm) : ''}
                    onChangeText={(val) => {
                      const num = parseFloat(val);
                      setMeasurements((prev) => ({
                        ...prev,
                        hipsCm: isNaN(num) ? undefined : num,
                      }));
                    }}
                  />
                </View>

                {/* Arms */}
                <View style={styles.inputGroup}>
                  <Caption upper style={styles.inputLabel}>
                    ARMS (CM)
                  </Caption>
                  <TextInput
                    style={[
                      styles.textInput,
                      {
                        backgroundColor: colors.surfaceElevated,
                        borderColor: colors.border,
                        color: colors.textPrimary,
                        borderRadius: borderRadius.sm,
                      },
                    ]}
                    placeholder="e.g. 38"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                    value={measurements.armsCm ? String(measurements.armsCm) : ''}
                    onChangeText={(val) => {
                      const num = parseFloat(val);
                      setMeasurements((prev) => ({
                        ...prev,
                        armsCm: isNaN(num) ? undefined : num,
                      }));
                    }}
                  />
                </View>

                {/* Thighs */}
                <View style={styles.inputGroup}>
                  <Caption upper style={styles.inputLabel}>
                    THIGHS (CM)
                  </Caption>
                  <TextInput
                    style={[
                      styles.textInput,
                      {
                        backgroundColor: colors.surfaceElevated,
                        borderColor: colors.border,
                        color: colors.textPrimary,
                        borderRadius: borderRadius.sm,
                      },
                    ]}
                    placeholder="e.g. 58"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                    value={measurements.thighsCm ? String(measurements.thighsCm) : ''}
                    onChangeText={(val) => {
                      const num = parseFloat(val);
                      setMeasurements((prev) => ({
                        ...prev,
                        thighsCm: isNaN(num) ? undefined : num,
                      }));
                    }}
                  />
                </View>
              </View>
            </View>
          )}

          {/* Action Buttons Row */}
          <View style={styles.actionsRow}>
            <Button
              title="RESET BASELINE"
              variant="ghost"
              onPress={handleReset}
              style={{ flex: 1 }}
            />
            <Button
              title={isSaving ? 'CALIBRATING...' : 'SAVE AVATAR →'}
              variant="primary"
              onPress={handleSave}
              disabled={isSaving}
              style={{ flex: 1.6 }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  title: {
    letterSpacing: 1.2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 36,
  },
  previewCard: {
    padding: 8,
    marginBottom: 12,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  avatarViewportBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  disclaimerBanner: {
    flexDirection: 'row',
    padding: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  disclaimerTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  disclaimerBody: {
    fontSize: 11,
    lineHeight: 15,
  },
  categoryTabsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  categoryTabBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  categoryTabText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  tabSection: {
    marginBottom: 16,
  },
  sectionHeader: {
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  frameGrid: {
    gap: 8,
  },
  frameCard: {
    padding: 12,
    borderWidth: 1,
  },
  frameCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  frameName: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  frameDesc: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  headGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  headPill: {
    flex: 1,
    minWidth: '47%',
    padding: 10,
    borderWidth: 1,
  },
  headName: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  armorList: {
    gap: 8,
  },
  armorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
  },
  armorName: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  tintGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '48%',
    padding: 10,
    borderWidth: 1,
    gap: 8,
  },
  colorCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
  },
  tintName: {
    fontSize: 11,
    fontWeight: '700',
  },
  glowGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  glowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '48%',
    padding: 10,
    borderWidth: 1,
    gap: 8,
  },
  glowOrb: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  glowName: {
    fontSize: 11,
    fontWeight: '700',
  },
  viewModeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  viewModeOption: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    gap: 4,
  },
  viewModeTitle: {
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  measurementsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  inputGroup: {
    width: '48%',
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 4,
  },
  textInput: {
    height: 42,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
});
