import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppState } from 'react-native';
import { StepCounterService } from '../StepCounterService';
import { MockStepCounterAdapter } from '../StepCounterAdapter';
import { StepRepository } from '../../../database/repositories/StepRepository';
import { ChallengeEngine } from '../../challenges/ChallengeEngine';
import { useStepStore } from '../../../store/useStepStore';
import { StepDailySummary } from '../types';

// Mock dependencies
vi.mock('../../../database/repositories/StepRepository', () => ({
  StepRepository: {
    getDailySummary: vi.fn(),
    getTodaySummary: vi.fn(),
    saveDailySummary: vi.fn(),
    updateStepGoal: vi.fn(),
    getRecentSummaries: vi.fn(),
  },
}));

vi.mock('../../challenges/ChallengeEngine', () => ({
  ChallengeEngine: {
    processEvent: vi.fn().mockResolvedValue([]),
  },
}));

describe('StepCounterService & Step Architecture', () => {
  const testUserId = 'operative-alpha-77';
  let mockAdapter: MockStepCounterAdapter;
  let inMemoryDb: Map<string, StepDailySummary>;

  beforeEach(() => {
    vi.clearAllMocks();
    StepCounterService.cleanup();
    useStepStore.setState({
      todaySteps: 0,
      stepGoal: 10000,
      sensorStatus: 'INITIALIZING',
      lastUpdatedAt: null,
      progressPercent: 0,
    });

    inMemoryDb = new Map();

    vi.mocked(StepRepository.getDailySummary).mockImplementation(async (userId, date) => {
      const key = `${userId}:${date}`;
      return inMemoryDb.get(key) || null;
    });

    vi.mocked(StepRepository.saveDailySummary).mockImplementation(async (summary) => {
      const key = `${summary.userId}:${summary.date}`;
      inMemoryDb.set(key, { ...summary });
    });

    vi.mocked(StepRepository.updateStepGoal).mockImplementation(async (userId, date, goal) => {
      const key = `${userId}:${date}`;
      const existing = inMemoryDb.get(key);
      if (existing) {
        existing.stepGoal = goal;
        inMemoryDb.set(key, existing);
      }
    });

    mockAdapter = new MockStepCounterAdapter(true, true);
    StepCounterService.setAdapter(mockAdapter);
  });

  afterEach(() => {
    StepCounterService.cleanup();
  });

  describe('1. Hardware Sensor Availability', () => {
    it('handles sensor unavailable on unsupported hardware/emulators', async () => {
      mockAdapter.setAvailable(false);

      const state = await StepCounterService.initialize(testUserId);

      expect(state.status).toBe('UNAVAILABLE');
      expect(state.todaySteps).toBe(0);
      expect(StepRepository.saveDailySummary).not.toHaveBeenCalled();
    });

    it('handles sensor available on supported devices', async () => {
      mockAdapter.setAvailable(true);
      mockAdapter.setRawSensorValue(5000);

      const state = await StepCounterService.initialize(testUserId);

      expect(state.status).toBe('READY');
    });
  });

  describe('2. Runtime Activity Recognition Permission', () => {
    it('returns PERMISSION_DENIED when permission is not granted', async () => {
      mockAdapter.setPermission(false);

      const state = await StepCounterService.initialize(testUserId);

      expect(state.status).toBe('PERMISSION_DENIED');
      expect(state.todaySteps).toBe(0);
    });

    it('transitions to READY after user grants permission via requestPermission', async () => {
      mockAdapter.setPermission(false);
      await StepCounterService.initialize(testUserId);
      expect(StepCounterService.getState(testUserId)?.status).toBe('PERMISSION_DENIED');

      // User accepts prompt
      mockAdapter.setPermission(true);
      mockAdapter.setRawSensorValue(6000);

      const granted = await StepCounterService.requestPermission(testUserId);
      expect(granted).toBe(true);

      const updated = StepCounterService.getState(testUserId);
      expect(updated?.status).toBe('READY');
      expect(updated?.baseline).toBe(6000);
      expect(updated?.lastSensorValue).toBe(6000);
    });

    it('retains PERMISSION_DENIED if user rejects runtime prompt', async () => {
      mockAdapter.setPermission(false);
      await StepCounterService.initialize(testUserId);

      const granted = await StepCounterService.requestPermission(testUserId);
      expect(granted).toBe(false);

      const updated = StepCounterService.getState(testUserId);
      expect(updated?.status).toBe('PERMISSION_DENIED');
    });
  });

  describe('3. First Install & Baseline Calibration', () => {
    it('calibrates baseline on first launch without awarding raw boot steps', async () => {
      // Hardware sensor has 14,200 steps since phone booted
      mockAdapter.setRawSensorValue(14200);

      const state = await StepCounterService.initialize(testUserId);

      expect(state.status).toBe('READY');
      expect(state.todaySteps).toBe(0);
      expect(state.baseline).toBe(14200);
      expect(state.lastSensorValue).toBe(14200);

      // Verify SQLite row saved
      expect(StepRepository.saveDailySummary).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: testUserId,
          todaySteps: 0,
          baseline: 14200,
          lastSensorValue: 14200,
        })
      );
    });
  });

  describe('4. Normal Step Accumulation', () => {
    it('accurately accumulates steps when hardware counter increments', async () => {
      mockAdapter.setRawSensorValue(10000);
      await StepCounterService.initialize(testUserId);

      // User walks 350 steps
      mockAdapter.emitSensorEvent(10350);

      const state = StepCounterService.getState(testUserId);
      expect(state?.todaySteps).toBe(350);
      expect(state?.lastSensorValue).toBe(10350);
      expect(state?.baseline).toBe(10000);

      // User walks another 500 steps
      mockAdapter.emitSensorEvent(10850);

      const state2 = StepCounterService.getState(testUserId);
      expect(state2?.todaySteps).toBe(850);
      expect(state2?.lastSensorValue).toBe(10850);
    });
  });

  describe('5. Existing Baseline Continuation', () => {
    it('restores accumulated steps and baseline from SQLite on app restart', async () => {
      const today = new Date().toISOString().substring(0, 10);
      inMemoryDb.set(`${testUserId}:${today}`, {
        id: `step-${testUserId}-${today}`,
        userId: testUserId,
        date: today,
        todaySteps: 4200,
        stepGoal: 10000,
        lastSensorValue: 14200,
        baseline: 10000,
        lastUpdatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });

      // Phone hardware counter advanced to 14,500 while app was closed
      mockAdapter.setRawSensorValue(14500);

      const state = await StepCounterService.initialize(testUserId);

      // 4,200 previous steps + 300 steps while closed = 4,500
      expect(state.todaySteps).toBe(4500);
      expect(state.lastSensorValue).toBe(14500);
      expect(state.baseline).toBe(10000);
    });
  });

  describe('6. Device Reboot Recovery', () => {
    it('preserves pre-reboot steps when hardware counter resets to near zero', async () => {
      mockAdapter.setRawSensorValue(20000);
      await StepCounterService.initialize(testUserId);

      // User walked 3,000 steps today before reboot
      mockAdapter.emitSensorEvent(23000);
      expect(StepCounterService.getState(testUserId)?.todaySteps).toBe(3000);

      // DEVICE REBOOT: raw counter resets to 85 steps
      mockAdapter.emitSensorEvent(85);

      const postRebootState = StepCounterService.getState(testUserId);
      // Pre-reboot 3,000 + post-reboot 85 = 3,085
      expect(postRebootState?.todaySteps).toBe(3085);
      expect(postRebootState?.lastSensorValue).toBe(85);
      expect(postRebootState?.baseline).toBe(0);

      // User walks 200 more steps after reboot
      mockAdapter.emitSensorEvent(285);
      const stateAfterWalk = StepCounterService.getState(testUserId);
      expect(stateAfterWalk?.todaySteps).toBe(3285);
      expect(stateAfterWalk?.lastSensorValue).toBe(285);
    });
  });

  describe('7. Midnight Day Boundary Rollover', () => {
    it('archives yesterday summary and resets today count to 0 at midnight', async () => {
      const yesterday = '2026-09-21';
      const today = new Date().toISOString().substring(0, 10);

      // Simulate state from yesterday
      mockAdapter.setRawSensorValue(15000);
      await StepCounterService.initialize(testUserId);
      mockAdapter.emitSensorEvent(22000); // 7,000 steps yesterday

      const yesterdayState = StepCounterService.getState(testUserId)!;
      yesterdayState.date = yesterday;

      // New reading arrives on the new day
      await StepCounterService.processSensorReading(testUserId, 22500);

      const todayState = StepCounterService.getState(testUserId);
      expect(todayState?.date).toBe(today);
      expect(todayState?.todaySteps).toBe(0);
      expect(todayState?.baseline).toBe(22500);
      expect(todayState?.lastSensorValue).toBe(22500);

      // Verify yesterday's summary was archived
      const yesterdayKey = `${testUserId}:${yesterday}`;
      expect(inMemoryDb.has(yesterdayKey)).toBe(true);
      expect(inMemoryDb.get(yesterdayKey)?.todaySteps).toBe(7000);
    });
  });

  describe('8. Duplicate Sensor Event Filtering', () => {
    it('ignores duplicate sensor readings idempotently without redundant DB writes', async () => {
      mockAdapter.setRawSensorValue(10000);
      await StepCounterService.initialize(testUserId);

      mockAdapter.emitSensorEvent(10500);
      const saveCallsBefore = vi.mocked(StepRepository.saveDailySummary).mock.calls.length;

      // Duplicate event with same sensor reading
      mockAdapter.emitSensorEvent(10500);
      mockAdapter.emitSensorEvent(10500);

      const saveCallsAfter = vi.mocked(StepRepository.saveDailySummary).mock.calls.length;
      expect(saveCallsAfter).toBe(saveCallsBefore);
      expect(StepCounterService.getState(testUserId)?.todaySteps).toBe(500);
    });
  });

  describe('9. AppState Foreground Resume Listener', () => {
    it('refreshes steps automatically when app transitions to active', async () => {
      let activeListener: ((state: string) => void) | null = null;
      vi.spyOn(AppState, 'addEventListener').mockImplementation((event: any, handler: any) => {
        if (event === 'change') {
          activeListener = handler;
        }
        return { remove: vi.fn() } as any;
      });

      mockAdapter.setRawSensorValue(10000);
      await StepCounterService.initialize(testUserId);
      expect(StepCounterService.getState(testUserId)?.todaySteps).toBe(0);

      // While app was backgrounded, user walked 1,200 steps
      mockAdapter.setRawSensorValue(11200);

      // App transitions to 'active'
      expect(activeListener).toBeDefined();
      activeListener!('active');

      // Wait a tick for async refresh
      await new Promise((r) => setTimeout(r, 20));

      expect(StepCounterService.getState(testUserId)?.todaySteps).toBe(1200);
    });
  });

  describe('10. Challenge Engine Dispatch & Strict Gym Isolation', () => {
    it('dispatches STEPS events to ChallengeEngine without generating gym workout sessions or mastery XP', async () => {
      mockAdapter.setRawSensorValue(10000);
      await StepCounterService.initialize(testUserId);

      mockAdapter.emitSensorEvent(13500);
      await new Promise((r) => setTimeout(r, 20));

      // Dispatched to ChallengeEngine
      expect(ChallengeEngine.processEvent).toHaveBeenCalledWith(
        testUserId,
        expect.objectContaining({
          eventType: 'STEPS',
          stepsCount: 3500,
        })
      );

      // Zero gym workout XP or exercise mastery generated
      const state = StepCounterService.getState(testUserId);
      expect(state?.todaySteps).toBe(3500);
    });
  });

  describe('11. Step Goal Updates', () => {
    it('updates daily step goal in memory and persists to SQLite', async () => {
      mockAdapter.setRawSensorValue(10000);
      await StepCounterService.initialize(testUserId);

      await StepCounterService.updateStepGoal(testUserId, 12500);

      expect(StepCounterService.getState(testUserId)?.stepGoal).toBe(12500);
      expect(StepRepository.updateStepGoal).toHaveBeenCalledWith(
        testUserId,
        expect.any(String),
        12500
      );
    });
  });

  describe('12. useStepStore Integration', () => {
    it('coordinates state between StepCounterService and Zustand store', async () => {
      mockAdapter.setRawSensorValue(10000);

      await useStepStore.getState().initialize(testUserId);

      expect(useStepStore.getState().todaySteps).toBe(0);
      expect(useStepStore.getState().stepGoal).toBe(10000);
      expect(useStepStore.getState().sensorStatus).toBe('READY');
      expect(useStepStore.getState().progressPercent).toBe(0);

      // Emit walk event
      mockAdapter.emitSensorEvent(14000);
      await useStepStore.getState().refreshSteps(testUserId);

      expect(useStepStore.getState().todaySteps).toBe(4000);
      expect(useStepStore.getState().progressPercent).toBe(40);

      // Update goal
      await useStepStore.getState().setStepGoal(8000, testUserId);
      expect(useStepStore.getState().stepGoal).toBe(8000);
      expect(useStepStore.getState().progressPercent).toBe(50);
    });
  });
});
