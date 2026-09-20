import React, { useState } from 'react';
import { View, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { THEME } from '../../constants/theme';
import { Heading, Text, Caption, MonoText } from '../ui/Typography';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { AuthService } from '../../services/auth/AuthService';
import { useAuthStore } from '../../store/useAuthStore';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AuthModal({ visible, onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<'SIGN_UP' | 'SIGN_IN'>('SIGN_UP');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { profile, linkAuthenticatedAccount } = useAuthStore();

  const handleAuth = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!email || !email.includes('@')) {
      setErrorMessage('Please enter a valid operative email address.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Access code / password must be at least 6 characters.');
      return;
    }

    setIsLoading(true);

    try {
      if (mode === 'SIGN_UP') {
        const res = await AuthService.signUp(email, password, profile?.displayName || profile?.username);
        if (!res.success) {
          setErrorMessage(res.error || 'Registration failed.');
          return;
        }

        if (res.userId) {
          // Migrate local guest progress to newly created account
          await linkAuthenticatedAccount(res.userId, res.email || email);
          setSuccessMessage('Account created! Local guest records migrated.');
          setTimeout(() => {
            onClose();
            onSuccess?.();
          }, 1200);
        }
      } else {
        const res = await AuthService.signIn(email, password);
        if (!res.success) {
          setErrorMessage(res.error || 'Authentication failed. Check credentials.');
          return;
        }

        if (res.userId) {
          // Link / migrate local records into signed in account
          await linkAuthenticatedAccount(res.userId, res.email || email);
          setSuccessMessage('Synchronized! Identity verified.');
          setTimeout(() => {
            onClose();
            onSuccess?.();
          }, 1200);
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Authentication service failure';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const res = await AuthService.signInWithGoogle();
      if (res.error) {
        setErrorMessage(res.error);
      } else {
        setSuccessMessage('Google OAuth gateway initialized.');
      }
    } catch (e: unknown) {
      setErrorMessage(e instanceof Error ? e.message : 'Google OAuth failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal visible={visible} onClose={onClose} title="OPERATIVE IDENTITY">
      <View style={styles.container}>
        {/* Toggle Mode */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            onPress={() => { setMode('SIGN_UP'); setErrorMessage(null); }}
            style={[styles.tabBtn, mode === 'SIGN_UP' && styles.tabBtnActive]}
          >
            <MonoText color={mode === 'SIGN_UP' ? '#000000' : THEME.colors.textMuted} style={styles.tabText}>
              LINK NEW ACCOUNT
            </MonoText>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setMode('SIGN_IN'); setErrorMessage(null); }}
            style={[styles.tabBtn, mode === 'SIGN_IN' && styles.tabBtnActive]}
          >
            <MonoText color={mode === 'SIGN_IN' ? '#000000' : THEME.colors.textMuted} style={styles.tabText}>
              SIGN IN
            </MonoText>
          </TouchableOpacity>
        </View>

        <Caption style={styles.notice}>
          {mode === 'SIGN_UP'
            ? 'All local guest workouts, personal records, and character mastery will seamlessly migrate into your cloud account.'
            : 'Sign into your existing ASCEND profile. Local offline workouts will synchronize.'}
        </Caption>

        {/* Inputs */}
        <View style={styles.inputGroup}>
          <Caption upper style={styles.inputLabel}>OPERATIVE EMAIL</Caption>
          <TextInput
            placeholder="operative@domain.com"
            placeholderTextColor={THEME.colors.textMuted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
        </View>

        <View style={styles.inputGroup}>
          <Caption upper style={styles.inputLabel}>ACCESS CODE / PASSWORD</Caption>
          <TextInput
            placeholder="Minimum 6 characters"
            placeholderTextColor={THEME.colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            style={styles.input}
          />
        </View>

        {/* Feedback Messages */}
        {errorMessage && (
          <View style={styles.feedbackBox}>
            <Badge label={errorMessage} variant="crimson" size="sm" />
          </View>
        )}

        {successMessage && (
          <View style={styles.feedbackBox}>
            <Badge label={successMessage} variant="emerald" size="sm" dot />
          </View>
        )}

        {/* Primary Action Button */}
        <Button
          title={mode === 'SIGN_UP' ? 'LINK & MIGRATE DATA →' : 'AUTHENTICATE SESSION →'}
          variant="primary"
          size="md"
          loading={isLoading}
          onPress={handleAuth}
          style={{ marginTop: 12 }}
        />

        {/* Google OAuth Option */}
        <Button
          title="G CONTINUE WITH GOOGLE"
          variant="outline"
          size="sm"
          onPress={handleGoogleAuth}
          disabled={isLoading}
          style={{ marginTop: 8 }}
        />

        <Button
          title="CANCEL"
          variant="ghost"
          size="sm"
          onPress={onClose}
          disabled={isLoading}
          style={{ marginTop: 4 }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    overflow: 'hidden',
    marginBottom: 6,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBtnActive: {
    backgroundColor: THEME.colors.cyan,
  },
  tabText: {
    fontSize: 11,
    fontWeight: '800',
  },
  notice: {
    lineHeight: 17,
    marginBottom: 6,
  },
  inputGroup: {
    gap: 4,
  },
  inputLabel: {
    letterSpacing: 1.5,
  },
  input: {
    height: 44,
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    paddingHorizontal: 12,
    color: THEME.colors.textPrimary,
    fontFamily: THEME.typography.fonts.mono,
    fontSize: 13,
  },
  feedbackBox: {
    alignItems: 'center',
    marginVertical: 4,
  },
});
