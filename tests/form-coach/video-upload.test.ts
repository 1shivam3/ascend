import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const root = process.cwd();
const readSrc = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('Form Coach — Streamlined Video Upload Architecture & Isolation', () => {
  const useFormCoachSrc = readSrc('src/features/form-coach/hooks/useFormCoach.ts');
  const modalSrc = readSrc('src/features/form-coach/components/FormCoachModal.tsx');
  const homeSrc = readSrc('src/components/HomePage.tsx');

  it('useFormCoach provides focused video analysis state machine without camera streams', () => {
    // 5 simple states (D4 added the terminal 'no-tracking' state)
    // D6: the union gained 'not-squat' — a tracked movement that is
    // positively a different pattern (hip hinge) ends there, unsaved.
    expect(useFormCoachSrc).toContain("export type FormCoachState = 'select' | 'analyzing' | 'report' | 'no-tracking' | 'not-squat' | 'error';");

    // Video analysis actions
    expect(useFormCoachSrc).toContain('const analyzeVideo = useCallback');
    expect(useFormCoachSrc).toContain('const completeAnalysis = useCallback');
    expect(useFormCoachSrc).toContain('const reset = useCallback');
    expect(useFormCoachSrc).toContain('setProgressPercent(');
    expect(useFormCoachSrc).toContain('URL.createObjectURL(file)');
    expect(useFormCoachSrc).toContain('URL.revokeObjectURL(');

    // Guaranteed ZERO live camera controllers or getUserMedia
    expect(useFormCoachSrc).not.toContain('navigator.mediaDevices.getUserMedia');
    expect(useFormCoachSrc).not.toContain('CameraController');
    expect(useFormCoachSrc).not.toContain('switchCamera');
  });

  it('useFormCoach manages video playback events and transitions automatically to report', () => {
    expect(useFormCoachSrc).toContain("video.addEventListener('ended', handleEnded)");
    expect(useFormCoachSrc).toContain("video.addEventListener('timeupdate', handleTimeUpdate)");
    expect(useFormCoachSrc).toContain("setState('report')");
    expect(useFormCoachSrc).toContain('FormSessionRepository.saveSession(sessionSummary)');
  });

  it('FormCoachModal renders uncomplicated drag-and-drop video upload and report flow', () => {
    // Select state upload zone
    expect(modalSrc).toContain('onDrop={handleDrop}');
    expect(modalSrc).toContain('onDragOver={handleDragOver}');
    expect(modalSrc).toContain('type="file"');
    expect(modalSrc).toContain('accept="video/mp4,video/quicktime,video/webm,video/*"');
    expect(modalSrc).toContain('Upload Workout Video');

    // Analyzing state
    expect(modalSrc).toContain("state === 'analyzing'");
    expect(modalSrc).toContain('Analyzing Squat Mechanics');
    expect(modalSrc).toContain('View Report Now');

    // Report state
    expect(modalSrc).toContain("state === 'report'");
    expect(modalSrc).toContain('<FormSessionSummaryModal');

    // 100% on-device privacy
    expect(modalSrc).toContain('100% On-Device & Private');
    expect(modalSrc).not.toContain('CameraSetupGuide');
    expect(modalSrc).not.toContain('LiveAnalysisHUD');
  });

  it('HomePage surfaces Form Check in Quick Actions and wires lazy FormCoachModal', () => {
    expect(homeSrc).toContain("t('home.formCheck')");
    expect(homeSrc).toContain('setIsFormCoachOpen(true)');
    expect(homeSrc).toContain('const [isFormCoachOpen, setIsFormCoachOpen] = useState(false);');
    expect(homeSrc).toContain('const FormCoachModal = dynamic');
    expect(homeSrc).toContain('<FormCoachModal');
  });
});
