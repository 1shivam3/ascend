import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { THEME } from '../../constants/theme';
import { Heading, Text, Caption, MonoText } from '../../components/ui/Typography';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { useAuthStore } from '../../store/useAuthStore';
import { useAndroidBackHandler } from '../../hooks/useAndroidBackHandler';
import { ScreenContainer } from '../../components/layout/ScreenContainer';
import { OnboardingData, AthleticGoal, TrainingExperience, TrainingLocation, normalizeGoal } from '../../utils/validation/onboardingSchema';

// Step components
import { StepWelcome } from '../../components/onboarding/StepWelcome';
import { StepGoal } from '../../components/onboarding/StepGoal';
import { StepAge } from '../../components/onboarding/StepAge';
import { StepHeight } from '../../components/onboarding/StepHeight';
import { StepWeight } from '../../components/onboarding/StepWeight';
import { StepExperience } from '../../components/onboarding/StepExperience';
import { StepFrequency } from '../../components/onboarding/StepFrequency';
import { StepDuration } from '../../components/onboarding/StepDuration';
import { StepEquipment } from '../../components/onboarding/StepEquipment';
import { StepLocation } from '../../components/onboarding/StepLocation';
import { StepPreferredExercises } from '../../components/onboarding/StepPreferredExercises';
import { StepExcludedExercises } from '../../components/onboarding/StepExcludedExercises';
import { StepLimitations } from '../../components/onboarding/StepLimitations';
import { StepGeneratePlan } from '../../components/onboarding/StepGeneratePlan';
import { StepCharacterInit } from '../../components/onboarding/StepCharacterInit';
import { StepFirstQuest } from '../../components/onboarding/StepFirstQuest';

export default function OnboardingScreen() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { onboardingDraft, updateOnboardingDraft, completeOnboarding } = useAuthStore();

  // Intercept Android hardware back button
  useAndroidBackHandler(() => {
    if (currentStep > 1) {
      setCurrentStep(s => s - 1);
      return true;
    }
    return false;
  }, true);

  const handleNext = () => {
    if (currentStep < 16) {
      setCurrentStep(s => s + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(s => s - 1);
    }
  };

  const handleComplete = async () => {
    setIsSubmitting(true);
    try {
      const normalizedGoal = onboardingDraft.primaryGoal || normalizeGoal(onboardingDraft.goal || 'GET_STRONGER');
      const fullData: OnboardingData = {
        goal: (onboardingDraft.goal as any) || normalizedGoal,
        primaryGoal: normalizedGoal,
        primary_goal: normalizedGoal,
        secondaryGoals: onboardingDraft.secondaryGoals || [],
        secondary_goals: onboardingDraft.secondaryGoals || [],
        customGoalDescription: onboardingDraft.customGoalDescription,
        sportName: onboardingDraft.sportName,
        age: onboardingDraft.age || 25,
        heightCm: onboardingDraft.heightCm || 175,
        weightKg: onboardingDraft.weightKg || 75,
        experience: (onboardingDraft.experience as TrainingExperience) || 'INTERMEDIATE',
        daysPerWeek: onboardingDraft.daysPerWeek || 4,
        sessionDurationMinutes: onboardingDraft.sessionDurationMinutes || 60,
        equipment: onboardingDraft.equipment || ['BARBELL', 'DUMBBELL', 'CABLE', 'MACHINE', 'BODYWEIGHT'],
        trainingLocation: (onboardingDraft.trainingLocation as TrainingLocation) || 'COMMERCIAL_GYM',
        preferredExerciseIds: onboardingDraft.preferredExerciseIds || [],
        excludedExerciseIds: onboardingDraft.excludedExerciseIds || [],
        limitations: onboardingDraft.limitations || [],
        username: onboardingDraft.username || 'Vanguard_Operative',
        avatarUrl: onboardingDraft.avatarUrl || '⚔️',
      };

      await completeOnboarding(fullData);
      router.replace('/(tabs)');
    } catch (e) {
      console.error('Failed to complete onboarding:', e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const progressPercent = Math.round(((currentStep - 1) / 15) * 100);

  return (
    <ScreenContainer scrollable={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardContainer}
      >
        {/* Tactical Onboarding Step Tracker */}
        {currentStep > 1 && (
          <View style={styles.trackerRow}>
            <View style={styles.trackerHeader}>
              <Caption upper color={THEME.colors.cyan} style={styles.stepCounter}>
                PHASE CALIBRATION // STEP {String(currentStep).padStart(2, '0')} OF 16
              </Caption>
              <MonoText style={styles.percentText}>{progressPercent}%</MonoText>
            </View>
            <ProgressBar progressPercent={progressPercent} size="sm" color={THEME.colors.cyan} />
          </View>
        )}

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {currentStep === 1 && (
            <StepWelcome onNext={handleNext} />
          )}

          {currentStep === 2 && (
            <StepGoal
              selectedGoal={onboardingDraft.primaryGoal || (onboardingDraft.goal as string) || 'GET_STRONGER'}
              selectedSecondaryGoals={onboardingDraft.secondaryGoals || []}
              customGoalDescription={onboardingDraft.customGoalDescription}
              sportName={onboardingDraft.sportName}
              onSelect={goal => updateOnboardingDraft({ goal: normalizeGoal(goal), primaryGoal: normalizeGoal(goal), primary_goal: normalizeGoal(goal) })}
              onSelectSecondary={secondaryGoals => updateOnboardingDraft({ secondaryGoals, secondary_goals: secondaryGoals })}
              onUpdateCustomGoal={customGoalDescription => updateOnboardingDraft({ customGoalDescription })}
              onUpdateSportName={sportName => updateOnboardingDraft({ sportName })}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}

          {currentStep === 3 && (
            <StepAge
              initialAge={onboardingDraft.age || 25}
              onUpdate={age => updateOnboardingDraft({ age })}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}

          {currentStep === 4 && (
            <StepHeight
              initialHeightCm={onboardingDraft.heightCm || 175}
              onUpdate={heightCm => updateOnboardingDraft({ heightCm })}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}

          {currentStep === 5 && (
            <StepWeight
              initialWeightKg={onboardingDraft.weightKg || 75}
              onUpdate={weightKg => updateOnboardingDraft({ weightKg })}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}

          {currentStep === 6 && (
            <StepExperience
              selectedExperience={(onboardingDraft.experience as TrainingExperience) || 'INTERMEDIATE'}
              onSelect={experience => updateOnboardingDraft({ experience })}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}

          {currentStep === 7 && (
            <StepFrequency
              selectedDays={onboardingDraft.daysPerWeek || 4}
              onSelect={daysPerWeek => updateOnboardingDraft({ daysPerWeek })}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}

          {currentStep === 8 && (
            <StepDuration
              selectedDuration={onboardingDraft.sessionDurationMinutes || 60}
              onSelect={sessionDurationMinutes => updateOnboardingDraft({ sessionDurationMinutes })}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}

          {currentStep === 9 && (
            <StepEquipment
              selectedEquipment={onboardingDraft.equipment || []}
              onToggle={id => {
                const current = onboardingDraft.equipment || [];
                const updated = current.includes(id)
                  ? current.filter(x => x !== id)
                  : [...current, id];
                updateOnboardingDraft({ equipment: updated });
              }}
              onSetAll={equipment => updateOnboardingDraft({ equipment })}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}

          {currentStep === 10 && (
            <StepLocation
              selectedLocation={(onboardingDraft.trainingLocation as TrainingLocation) || 'COMMERCIAL_GYM'}
              onSelect={trainingLocation => updateOnboardingDraft({ trainingLocation })}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}

          {currentStep === 11 && (
            <StepPreferredExercises
              selectedIds={onboardingDraft.preferredExerciseIds || []}
              onToggle={id => {
                const current = onboardingDraft.preferredExerciseIds || [];
                const updated = current.includes(id)
                  ? current.filter(x => x !== id)
                  : [...current, id];
                updateOnboardingDraft({ preferredExerciseIds: updated });
              }}
              onSetAll={preferredExerciseIds => updateOnboardingDraft({ preferredExerciseIds })}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}

          {currentStep === 12 && (
            <StepExcludedExercises
              excludedIds={onboardingDraft.excludedExerciseIds || []}
              onToggle={id => {
                const current = onboardingDraft.excludedExerciseIds || [];
                const updated = current.includes(id)
                  ? current.filter(x => x !== id)
                  : [...current, id];
                updateOnboardingDraft({ excludedExerciseIds: updated });
              }}
              onClearAll={() => updateOnboardingDraft({ excludedExerciseIds: [] })}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}

          {currentStep === 13 && (
            <StepLimitations
              selectedLimitations={onboardingDraft.limitations || []}
              onToggle={id => {
                const current = (onboardingDraft.limitations || []).filter(x => x !== 'NONE');
                const updated = current.includes(id)
                  ? current.filter(x => x !== id)
                  : [...current, id];
                updateOnboardingDraft({ limitations: updated });
              }}
              onSetNone={() => updateOnboardingDraft({ limitations: ['NONE'] })}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}

          {currentStep === 14 && (
            <StepGeneratePlan
              goal={onboardingDraft.goal || 'BUILD_STRENGTH'}
              experience={onboardingDraft.experience || 'INTERMEDIATE'}
              daysPerWeek={onboardingDraft.daysPerWeek || 4}
              durationMin={onboardingDraft.sessionDurationMinutes || 60}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}

          {currentStep === 15 && (
            <StepCharacterInit
              initialUsername={onboardingDraft.username || ''}
              initialAvatar={onboardingDraft.avatarUrl || '⚔️'}
              goal={onboardingDraft.goal || 'BUILD_STRENGTH'}
              experience={onboardingDraft.experience || 'INTERMEDIATE'}
              daysPerWeek={onboardingDraft.daysPerWeek || 4}
              weightKg={onboardingDraft.weightKg || 75}
              onUpdate={({ username, avatarUrl }) =>
                updateOnboardingDraft({ username, avatarUrl })
              }
              onNext={handleNext}
              onBack={handleBack}
            />
          )}

          {currentStep === 16 && (
            <StepFirstQuest
              username={onboardingDraft.username || 'Vanguard'}
              avatarUrl={onboardingDraft.avatarUrl || '⚔️'}
              isLoading={isSubmitting}
              onComplete={handleComplete}
              onBack={handleBack}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
  },
  trackerRow: {
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 10,
  },
  trackerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  stepCounter: {
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  percentText: {
    fontSize: 11,
    color: THEME.colors.textMuted,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingBottom: THEME.spacing.lg,
  },
});
