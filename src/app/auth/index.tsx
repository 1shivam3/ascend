import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Text as RNText,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../constants/theme';
import { useAuthStore } from '../../store/useAuthStore';
import { AuthService } from '../../services/auth/AuthService';
import { Character2D } from '../../components/avatar/Character2D';
import { Heading, Text, Caption, MonoText } from '../../components/ui/Typography';
import { Button, PrimaryButton } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';

export default function AuthScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, borderRadius, isDark } = useTheme();
  const setSessionUser = useAuthStore((s) => s.setSessionUser);

  // Email Auth Modal State
  const [emailModalVisible, setEmailModalVisible] = useState(false);
  const [authMode, setAuthMode] = useState<'LOGIN' | 'SIGNUP'>('LOGIN');

  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Status & Feedback
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Listen for incoming OAuth deep-links while auth screen is open
  useEffect(() => {
    const subscription = Linking.addEventListener('url', async ({ url }) => {
      if (url.includes('auth/callback')) {
        setIsGoogleLoading(true);
        setErrorMessage(null);
        try {
          const res = await AuthService.handleAuthCallback(url);
          if (res.success && res.userId) {
            await setSessionUser(res.userId, res.email);
            // Root layout navigation guard will automatically direct to onboarding or tabs
          } else if (res.error) {
            setErrorMessage(res.error);
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Google OAuth completion error';
          setErrorMessage(AuthService.translateAuthError(msg));
        } finally {
          setIsGoogleLoading(false);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [setSessionUser]);

  // Handle Google OAuth initialization
  const handleContinueWithGoogle = async () => {
    setErrorMessage(null);
    setIsGoogleLoading(true);

    try {
      const res = await AuthService.signInWithGoogle();
      if (res.error) {
        setErrorMessage(res.error);
        setIsGoogleLoading(false);
        return;
      }

      if (res.url) {
        // Open authorization in system browser
        await Linking.openURL(res.url);
      } else {
        setErrorMessage('Failed to obtain Google authentication URL.');
        setIsGoogleLoading(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed';
      setErrorMessage(AuthService.translateAuthError(msg));
      setIsGoogleLoading(false);
    }
  };

  // Handle Email Form Submission (Login / Sign Up)
  const handleEmailSubmit = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim();

    // Client-side validations
    if (!AuthService.validateEmail(cleanEmail)) {
      setErrorMessage(AuthService.translateAuthError('invalid email'));
      return;
    }

    const passCheck = AuthService.validatePassword(password);
    if (!passCheck.isValid) {
      setErrorMessage(passCheck.error || 'Password must be at least 6 characters long.');
      return;
    }

    if (authMode === 'SIGNUP') {
      if (password !== confirmPassword) {
        setErrorMessage(AuthService.translateAuthError('passwords do not match'));
        return;
      }
    }

    setIsSubmitting(true);

    try {
      if (authMode === 'SIGNUP') {
        const res = await AuthService.signUp(cleanEmail, password, confirmPassword);
        if (!res.success) {
          setErrorMessage(res.error || 'Failed to create account.');
          return;
        }

        if (res.userId) {
          setSuccessMessage('Operative identity established!');
          await setSessionUser(res.userId, res.email || cleanEmail);
          setTimeout(() => {
            setEmailModalVisible(false);
          }, 800);
        }
      } else {
        const res = await AuthService.signIn(cleanEmail, password);
        if (!res.success) {
          setErrorMessage(res.error || 'Failed to authenticate session.');
          return;
        }

        if (res.userId) {
          setSuccessMessage('Session verified. Entering system...');
          await setSessionUser(res.userId, res.email || cleanEmail);
          setTimeout(() => {
            setEmailModalVisible(false);
          }, 800);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication service failure';
      setErrorMessage(AuthService.translateAuthError(msg));
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEmailModal = (mode: 'LOGIN' | 'SIGNUP') => {
    setAuthMode(mode);
    setErrorMessage(null);
    setSuccessMessage(null);
    setEmailModalVisible(true);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ASCEND BRANDING HEADER */}
        <View style={styles.brandingHeader}>
          <View
            style={[
              styles.insigniaBox,
              {
                backgroundColor: isDark ? colors.surfaceElevated : '#FFFFFF',
                borderColor: colors.border,
              },
            ]}
          >
            <RNText style={styles.insigniaGlyph}>⚔️</RNText>
          </View>

          <Heading level={1} style={styles.brandTitle}>
            ASCEND
          </Heading>

          <Caption upper style={[styles.brandSubtitle, { color: colors.accent }]}>
            Athletic RPG Protocol
          </Caption>
        </View>

        {/* CHARACTER VISUAL CENTERPIECE */}
        <View style={styles.characterContainer}>
          <Character2D
            height={310}
            globalLevel={1}
            rankTier="E"
            showControls={false}
            interactiveHotspots={false}
          />
        </View>

        {/* PRODUCT STATEMENT */}
        <View style={styles.statementBox}>
          <Heading level={2} style={styles.statementHeading}>
            TRAIN IN REALITY. LEVEL UP IN ASCEND.
          </Heading>
          <Text style={[styles.statementBody, { color: colors.textSecondary }]}>
            Every set logged, every kilogram lifted, and every personal record broken transforms your
            operative in reality and within the system.
          </Text>
        </View>

        {/* ERROR BANNER IF ANY */}
        {errorMessage && !emailModalVisible && (
          <View style={styles.mainErrorBox}>
            <Ionicons name="alert-circle" size={18} color={colors.crimson} style={{ marginRight: 6 }} />
            <Text style={[styles.mainErrorText, { color: colors.crimson }]}>{errorMessage}</Text>
          </View>
        )}

        {/* ACTION BUTTONS */}
        <View style={styles.actionsGroup}>
          {/* PRIMARY CTA: CONTINUE WITH GOOGLE */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleContinueWithGoogle}
            disabled={isGoogleLoading}
            style={[
              styles.googleButton,
              {
                backgroundColor: isDark ? '#FFFFFF' : '#111827',
                borderRadius: borderRadius.md,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
          >
            {isGoogleLoading ? (
              <ActivityIndicator
                size="small"
                color={isDark ? '#0E1015' : '#FFFFFF'}
                style={{ marginRight: 10 }}
              />
            ) : (
              <View style={styles.googleIconCircle}>
                <Ionicons name="logo-google" size={18} color="#EA4335" />
              </View>
            )}
            <RNText
              style={[
                styles.googleButtonText,
                { color: isDark ? '#0E1015' : '#FFFFFF' },
              ]}
            >
              {isGoogleLoading ? 'Connecting to Google...' : 'Continue with Google'}
            </RNText>
          </TouchableOpacity>

          {/* SECONDARY ACTIONS: LOG IN & SIGN UP */}
          <View style={styles.secondaryActionsRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => openEmailModal('LOGIN')}
              style={[
                styles.secondaryBtn,
                {
                  backgroundColor: isDark ? colors.surfaceElevated : colors.surface,
                  borderColor: colors.border,
                  borderRadius: borderRadius.md,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Log In with Email"
            >
              <Ionicons
                name="log-in-outline"
                size={17}
                color={colors.textPrimary}
                style={{ marginRight: 6 }}
              />
              <RNText style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>
                Log In
              </RNText>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => openEmailModal('SIGNUP')}
              style={[
                styles.secondaryBtn,
                {
                  backgroundColor: isDark ? colors.surfaceElevated : colors.surface,
                  borderColor: colors.border,
                  borderRadius: borderRadius.md,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Sign Up with Email"
            >
              <Ionicons
                name="person-add-outline"
                size={17}
                color={colors.accent}
                style={{ marginRight: 6 }}
              />
              <RNText style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>
                Sign Up
              </RNText>
            </TouchableOpacity>
          </View>
        </View>

        {/* SECURITY & PRIVACY CAPTION */}
        <Caption style={[styles.securityCaption, { color: colors.textMuted }]}>
          Secure Authentication • Cloud Synchronized • Zero Exploits
        </Caption>
      </ScrollView>

      {/* EMAIL AUTHENTICATION MODAL */}
      <Modal
        visible={emailModalVisible}
        onClose={() => setEmailModalVisible(false)}
        title={authMode === 'LOGIN' ? 'OPERATIVE LOG IN' : 'OPERATIVE REGISTRATION'}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalContent}
        >
          {/* TOGGLE TABS */}
          <View
            style={[
              styles.modalTabRow,
              {
                backgroundColor: isDark ? colors.surfaceElevated : '#F1F3F5',
                borderColor: colors.border,
              },
            ]}
          >
            <TouchableOpacity
              onPress={() => {
                setAuthMode('LOGIN');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              style={[
                styles.modalTab,
                authMode === 'LOGIN' && {
                  backgroundColor: isDark ? colors.surface : '#FFFFFF',
                },
              ]}
            >
              <RNText
                style={[
                  styles.modalTabText,
                  { color: authMode === 'LOGIN' ? colors.textPrimary : colors.textMuted },
                ]}
              >
                LOG IN
              </RNText>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setAuthMode('SIGNUP');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              style={[
                styles.modalTab,
                authMode === 'SIGNUP' && {
                  backgroundColor: isDark ? colors.surface : '#FFFFFF',
                },
              ]}
            >
              <RNText
                style={[
                  styles.modalTabText,
                  { color: authMode === 'SIGNUP' ? colors.textPrimary : colors.textMuted },
                ]}
              >
                SIGN UP
              </RNText>
            </TouchableOpacity>
          </View>

          {/* EMAIL INPUT */}
          <View style={styles.inputFieldGroup}>
            <Caption upper style={[styles.inputLabel, { color: colors.textSecondary }]}>
              Operative Email
            </Caption>
            <TextInput
              placeholder="operative@domain.com"
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                setErrorMessage(null);
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={[
                styles.textInput,
                {
                  backgroundColor: isDark ? colors.surfaceElevated : '#F8F9FA',
                  borderColor: colors.border,
                  color: colors.textPrimary,
                  borderRadius: borderRadius.sm,
                },
              ]}
            />
          </View>

          {/* PASSWORD INPUT */}
          <View style={styles.inputFieldGroup}>
            <Caption upper style={[styles.inputLabel, { color: colors.textSecondary }]}>
              Access Code / Password
            </Caption>
            <TextInput
              placeholder="Minimum 6 characters"
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                setErrorMessage(null);
              }}
              secureTextEntry
              autoCapitalize="none"
              style={[
                styles.textInput,
                {
                  backgroundColor: isDark ? colors.surfaceElevated : '#F8F9FA',
                  borderColor: colors.border,
                  color: colors.textPrimary,
                  borderRadius: borderRadius.sm,
                },
              ]}
            />
          </View>

          {/* CONFIRM PASSWORD INPUT (SIGN UP ONLY) */}
          {authMode === 'SIGNUP' && (
            <View style={styles.inputFieldGroup}>
              <Caption upper style={[styles.inputLabel, { color: colors.textSecondary }]}>
                Confirm Password
              </Caption>
              <TextInput
                placeholder="Re-enter password"
                placeholderTextColor={colors.textMuted}
                value={confirmPassword}
                onChangeText={(t) => {
                  setConfirmPassword(t);
                  setErrorMessage(null);
                }}
                secureTextEntry
                autoCapitalize="none"
                style={[
                  styles.textInput,
                  {
                    backgroundColor: isDark ? colors.surfaceElevated : '#F8F9FA',
                    borderColor: colors.border,
                    color: colors.textPrimary,
                    borderRadius: borderRadius.sm,
                  },
                ]}
              />
            </View>
          )}

          {/* INLINE ERROR FEEDBACK */}
          {errorMessage && (
            <View
              style={[
                styles.modalAlertBox,
                { backgroundColor: `${colors.crimson}18`, borderColor: colors.crimson },
              ]}
            >
              <Ionicons name="alert-circle" size={16} color={colors.crimson} style={{ marginRight: 6 }} />
              <RNText style={[styles.modalAlertText, { color: colors.crimson }]}>
                {errorMessage}
              </RNText>
            </View>
          )}

          {/* INLINE SUCCESS FEEDBACK */}
          {successMessage && (
            <View
              style={[
                styles.modalAlertBox,
                { backgroundColor: `${colors.emerald}18`, borderColor: colors.emerald },
              ]}
            >
              <Ionicons name="checkmark-circle" size={16} color={colors.emerald} style={{ marginRight: 6 }} />
              <RNText style={[styles.modalAlertText, { color: colors.emerald }]}>
                {successMessage}
              </RNText>
            </View>
          )}

          {/* SUBMIT BUTTON */}
          <Button
            title={authMode === 'LOGIN' ? 'LOG IN →' : 'CREATE OPERATIVE ACCOUNT →'}
            variant="primary"
            size="lg"
            loading={isSubmitting}
            onPress={handleEmailSubmit}
            style={{ marginTop: 8 }}
          />

          <Button
            title="Cancel"
            variant="ghost"
            size="sm"
            onPress={() => setEmailModalVisible(false)}
            disabled={isSubmitting}
            style={{ marginTop: 2 }}
          />
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 36,
    alignItems: 'center',
  },
  brandingHeader: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  insigniaBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  insigniaGlyph: {
    fontSize: 26,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 4,
  },
  brandSubtitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2.5,
    marginTop: 2,
  },
  characterContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  statementBox: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 18,
  },
  statementHeading: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.8,
    textAlign: 'center',
    marginBottom: 6,
  },
  statementBody: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  mainErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEB',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 14,
    width: '100%',
  },
  mainErrorText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  actionsGroup: {
    width: '100%',
    gap: 12,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 20,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  googleIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  googleButtonText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  secondaryActionsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  securityCaption: {
    fontSize: 10,
    textAlign: 'center',
    marginTop: 22,
    letterSpacing: 0.4,
  },
  modalContent: {
    gap: 12,
  },
  modalTabRow: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    padding: 3,
    marginBottom: 4,
  },
  modalTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  modalTabText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  inputFieldGroup: {
    gap: 4,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  textInput: {
    height: 48,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  modalAlertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  modalAlertText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
});
