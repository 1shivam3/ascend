import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { THEME } from '../../constants/theme';
import { Heading, Text, Caption, MonoText } from '../ui/Typography';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { AttributeRadar } from '../hud/AttributeRadar';
import { usernameSchema, validateField } from '../../utils/validation/onboardingSchema';
import { calculateStartingAttributes } from '../../store/useAuthStore';

interface Props {
  initialUsername: string;
  initialAvatar: string;
  goal: string;
  experience: string;
  daysPerWeek: number;
  weightKg: number;
  onUpdate: (data: { username: string; avatarUrl: string }) => void;
  onNext: () => void;
  onBack: () => void;
}

const AVATARS = ['⚔️', '🛡️', '⚡', '🦅', '🐺', '🔥', '🦾'];

export function StepCharacterInit({
  initialUsername,
  initialAvatar,
  goal,
  experience,
  daysPerWeek,
  weightKg,
  onUpdate,
  onNext,
  onBack,
}: Props) {
  const [username, setUsername] = useState(initialUsername || '');
  const [avatar, setAvatar] = useState(initialAvatar || '⚔️');

  const validation = validateField(usernameSchema, username);

  const attributes = calculateStartingAttributes(goal, experience, daysPerWeek, weightKg);

  const handleUsernameChange = (text: string) => {
    setUsername(text);
    onUpdate({ username: text, avatarUrl: avatar });
  };

  const handleAvatarSelect = (av: string) => {
    setAvatar(av);
    onUpdate({ username, avatarUrl: av });
  };

  return (
    <View style={styles.container}>
      <View>
        <Heading level={2} style={styles.header}>CHARACTER INITIALIZATION</Heading>
        <Caption style={styles.sub}>
          Forge your tactical identity and inspect your baseline calibrated attribute distribution.
        </Caption>

        {/* Identity Input Card */}
        <Card variant="glass" accentBorder={validation.isValid ? THEME.colors.cyan : undefined} style={styles.identityCard}>
          <Caption upper style={styles.inputLabel}>OPERATIVE CALL-SIGN</Caption>
          <View style={styles.inputRow}>
            <MonoText color={THEME.colors.cyan} style={styles.prefix}>@</MonoText>
            <TextInput
              placeholder="e.g. IronVanguard, Titan_01"
              placeholderTextColor={THEME.colors.textMuted}
              value={username}
              onChangeText={handleUsernameChange}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
              style={styles.textInput}
            />
          </View>

          {/* Validation Error Feedback */}
          {!validation.isValid && username.length > 0 && (
            <View style={styles.errorBox}>
              <Badge label={validation.error || 'Invalid call-sign'} variant="crimson" size="sm" />
            </View>
          )}

          {/* Tactical Crest Selector */}
          <Caption upper style={styles.avatarLabel}>CHOOSE TACTICAL CREST</Caption>
          <View style={styles.avatarRow}>
            {AVATARS.map(av => {
              const isSelected = avatar === av;
              return (
                <TouchableOpacity
                  key={av}
                  activeOpacity={0.7}
                  onPress={() => handleAvatarSelect(av)}
                  style={[styles.avatarBtn, isSelected && styles.avatarBtnActive]}
                >
                  <Heading level={2}>{av}</Heading>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>

        {/* Live Calibrated Starting Attributes Radar */}
        <Caption upper style={styles.radarHeader}>CALIBRATED STARTING ATTRIBUTES</Caption>
        <AttributeRadar attributes={attributes} />
      </View>

      <View style={styles.footerRow}>
        <Button title="← BACK" variant="ghost" onPress={onBack} style={{ flex: 1 }} />
        <Button
          title="INITIALIZE OPERATIVE →"
          variant="primary"
          onPress={onNext}
          disabled={!validation.isValid}
          style={{ flex: 2 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: THEME.spacing.sm,
  },
  header: {
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  sub: {
    marginBottom: THEME.spacing.sm,
    lineHeight: 18,
  },
  identityCard: {
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.xs,
  },
  inputLabel: {
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    paddingHorizontal: 12,
  },
  prefix: {
    fontSize: 18,
    fontWeight: '800',
    marginRight: 6,
  },
  textInput: {
    flex: 1,
    height: 44,
    color: THEME.colors.textPrimary,
    fontFamily: THEME.typography.fonts.mono,
    fontSize: 15,
    fontWeight: '700',
  },
  errorBox: {
    marginTop: 8,
  },
  avatarLabel: {
    letterSpacing: 1.5,
    marginTop: 14,
    marginBottom: 8,
  },
  avatarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  avatarBtn: {
    width: 42,
    height: 42,
    borderRadius: THEME.borderRadius.sharp,
    backgroundColor: THEME.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBtnActive: {
    borderColor: THEME.colors.cyan,
    backgroundColor: 'rgba(0, 229, 255, 0.15)',
  },
  radarHeader: {
    letterSpacing: 1.5,
    marginTop: 6,
    marginBottom: 2,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: THEME.spacing.md,
  },
});
