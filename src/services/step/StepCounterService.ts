import { AppState, AppStateStatus } from 'react-native';
import {
  StepCounterAdapterInterface,
  NativeStepCounterAdapter,
} from './StepCounterAdapter';
import {
  StepTrackerState,
  StepDailySummary,
  StepSensorStatus,
} from './types';
import { StepRepository } from '../../database/repositories/StepRepository';
import { ChallengeEngine } from '../challenges/ChallengeEngine';
import { ChallengeEventPayload } from '../../types/challenge.types';

export class StepCounterService {
  private static adapter: StepCounterAdapterInterface = new NativeStepCounterAdapter();
  private static currentState: Map<string, StepTrackerState> = new Map();
  private static stopTrackingMap: Map<string, () => void> = new Map();
  private static appStateSubscription: any = null;
  private static activeUserId: string | null = null;

  /**
   * Sets adapter override for unit testing or custom hardware wrappers.
   */
  static setAdapter(customAdapter: StepCounterAdapterInterface | null) {
    this.adapter = customAdapter || new NativeStepCounterAdapter();
  }

  /**
   * Initializes the step tracking engine for a given user.
   */
  static async initialize(userId: string): Promise<StepTrackerState> {
    this.activeUserId = userId;
    const today = new Date().toISOString().substring(0, 10);

    // 1. Check hardware availability
    const isAvailable = await this.adapter.isSensorAvailable();
    if (!isAvailable) {
      const unavailableState: StepTrackerState = {
        todaySteps: 0,
        stepGoal: 10000,
        lastSensorValue: 0,
        baseline: 0,
        lastUpdatedAt: new Date().toISOString(),
        status: 'UNAVAILABLE',
        date: today,
      };
      this.currentState.set(userId, unavailableState);
      return unavailableState;
    }

    // 2. Check runtime permission
    const hasPerm = await this.adapter.hasPermission();
    if (!hasPerm) {
      const deniedState: StepTrackerState = {
        todaySteps: 0,
        stepGoal: 10000,
        lastSensorValue: 0,
        baseline: 0,
        lastUpdatedAt: new Date().toISOString(),
        status: 'PERMISSION_DENIED',
        date: today,
      };
      this.currentState.set(userId, deniedState);
      return deniedState;
    }

    // 3. Load existing daily summary from SQLite
    let existing = await StepRepository.getDailySummary(userId, today);

    let state: StepTrackerState;
    if (existing) {
      state = {
        todaySteps: existing.todaySteps,
        stepGoal: existing.stepGoal,
        lastSensorValue: existing.lastSensorValue,
        baseline: existing.baseline,
        lastUpdatedAt: existing.lastUpdatedAt,
        status: 'READY',
        date: existing.date,
      };
    } else {
      state = {
        todaySteps: 0,
        stepGoal: 10000,
        lastSensorValue: 0,
        baseline: 0,
        lastUpdatedAt: new Date().toISOString(),
        status: 'READY',
        date: today,
      };
    }

    this.currentState.set(userId, state);

    // 4. Poll current raw sensor reading
    const currentRaw = await this.adapter.getRawSensorValue();
    if (currentRaw !== null) {
      state = await this.processSensorReading(userId, currentRaw);
    }

    // 5. Start live tracking listener if not already running
    this.startTracking(userId);

    // 6. Set up AppState listener to refresh steps when user returns to app
    this.setupAppStateListener();

    return state;
  }

  /**
   * Processes a raw sensor reading from Android TYPE_STEP_COUNTER.
   * Handles first install, daily midnight reset, device reboot, and duplicates.
   */
  static async processSensorReading(
    userId: string,
    rawSensorValue: number
  ): Promise<StepTrackerState> {
    const today = new Date().toISOString().substring(0, 10);
    const prev = this.currentState.get(userId) || {
      todaySteps: 0,
      stepGoal: 10000,
      lastSensorValue: 0,
      baseline: 0,
      lastUpdatedAt: new Date().toISOString(),
      status: 'READY',
      date: today,
    };

    let todaySteps = prev.todaySteps;
    let baseline = prev.baseline;
    let lastSensorValue = prev.lastSensorValue;
    const stepGoal = prev.stepGoal;
    const nowIso = new Date().toISOString();

    // A. Day Boundary / Midnight Rollover Check
    if (prev.date !== today) {
      // Archive / save yesterday's summary
      await StepRepository.saveDailySummary({
        id: `step-${userId}-${prev.date}`,
        userId,
        date: prev.date,
        todaySteps: prev.todaySteps,
        stepGoal: prev.stepGoal,
        lastSensorValue: prev.lastSensorValue,
        baseline: prev.baseline,
        lastUpdatedAt: prev.lastUpdatedAt,
        createdAt: prev.lastUpdatedAt,
      });

      // Reset for new day
      baseline = rawSensorValue;
      todaySteps = 0;
      lastSensorValue = rawSensorValue;
    }
    // B. First Install / Initial Baseline Calibration
    else if (lastSensorValue === 0 && baseline === 0 && todaySteps === 0) {
      baseline = rawSensorValue;
      todaySteps = 0;
      lastSensorValue = rawSensorValue;
    }
    // C. Duplicate reading (no step change)
    else if (rawSensorValue === lastSensorValue) {
      return prev;
    }
    // D. Device Reboot Handling (hardware counter dropped below previous reading)
    else if (rawSensorValue < lastSensorValue) {
      // Retain steps accumulated before reboot today
      const preRebootSteps = todaySteps;
      baseline = 0;
      todaySteps = preRebootSteps + Math.max(0, rawSensorValue);
      lastSensorValue = rawSensorValue;
    }
    // E. Normal Accumulation
    else {
      const delta = rawSensorValue - lastSensorValue;
      todaySteps += delta;
      lastSensorValue = rawSensorValue;
    }

    const updatedState: StepTrackerState = {
      todaySteps,
      stepGoal,
      lastSensorValue,
      baseline,
      lastUpdatedAt: nowIso,
      status: 'READY',
      date: today,
    };

    this.currentState.set(userId, updatedState);

    // Save summary locally to SQLite
    const summary: StepDailySummary = {
      id: `step-${userId}-${today}`,
      userId,
      date: today,
      todaySteps,
      stepGoal,
      lastSensorValue,
      baseline,
      lastUpdatedAt: nowIso,
      createdAt: nowIso,
    };
    await StepRepository.saveDailySummary(summary);

    // Dispatch to Quest/Challenge engine
    await this.dispatchStepEvent(userId, today, todaySteps);

    return updatedState;
  }

  /**
   * Refreshes steps on demand (e.g. app foreground resume, pull to refresh).
   */
  static async refreshSteps(userId: string): Promise<StepTrackerState> {
    const isAvailable = await this.adapter.isSensorAvailable();
    if (!isAvailable) {
      const state = this.currentState.get(userId) || {
        todaySteps: 0,
        stepGoal: 10000,
        lastSensorValue: 0,
        baseline: 0,
        lastUpdatedAt: new Date().toISOString(),
        status: 'UNAVAILABLE' as StepSensorStatus,
        date: new Date().toISOString().substring(0, 10),
      };
      state.status = 'UNAVAILABLE';
      this.currentState.set(userId, state);
      return state;
    }

    const hasPerm = await this.adapter.hasPermission();
    if (!hasPerm) {
      const state = this.currentState.get(userId) || {
        todaySteps: 0,
        stepGoal: 10000,
        lastSensorValue: 0,
        baseline: 0,
        lastUpdatedAt: new Date().toISOString(),
        status: 'PERMISSION_DENIED' as StepSensorStatus,
        date: new Date().toISOString().substring(0, 10),
      };
      state.status = 'PERMISSION_DENIED';
      this.currentState.set(userId, state);
      return state;
    }

    const raw = await this.adapter.getRawSensorValue();
    if (raw !== null) {
      return await this.processSensorReading(userId, raw);
    }

    return (
      this.currentState.get(userId) || {
        todaySteps: 0,
        stepGoal: 10000,
        lastSensorValue: 0,
        baseline: 0,
        lastUpdatedAt: new Date().toISOString(),
        status: 'READY',
        date: new Date().toISOString().substring(0, 10),
      }
    );
  }

  /**
   * Requests Activity Recognition permission.
   */
  static async requestPermission(userId: string): Promise<boolean> {
    const granted = await this.adapter.requestPermission();
    if (granted) {
      await this.refreshSteps(userId);
      this.startTracking(userId);
      return true;
    } else {
      const s = this.currentState.get(userId);
      if (s) {
        s.status = 'PERMISSION_DENIED';
        this.currentState.set(userId, { ...s });
      }
      return false;
    }
  }

  /**
   * Updates user daily step goal.
   */
  static async updateStepGoal(userId: string, goal: number): Promise<void> {
    const today = new Date().toISOString().substring(0, 10);
    const s = this.currentState.get(userId);
    if (s) {
      s.stepGoal = goal;
      this.currentState.set(userId, { ...s });
    }
    await StepRepository.updateStepGoal(userId, today, goal);
  }

  /**
   * Retrieves current in-memory tracker state.
   */
  static getState(userId: string): StepTrackerState | null {
    return this.currentState.get(userId) || null;
  }

  private static startTracking(userId: string) {
    if (this.stopTrackingMap.has(userId)) {
      return;
    }

    const stopFn = this.adapter.startLiveTracking((event) => {
      this.processSensorReading(userId, event.rawSensorValue).catch((err) => {
        console.warn('[StepCounterService] Error in live sensor event:', err);
      });
    });

    this.stopTrackingMap.set(userId, stopFn);
  }

  private static setupAppStateListener() {
    if (this.appStateSubscription) return;

    this.appStateSubscription = AppState.addEventListener(
      'change',
      (nextAppState: AppStateStatus) => {
        if (nextAppState === 'active' && this.activeUserId) {
          this.refreshSteps(this.activeUserId).catch(() => {});
        }
      }
    );
  }

  /**
   * Dispatches step count to ChallengeEngine.
   * STRICT GUARD: Never generates workout sessions or awards gym mastery XP.
   */
  private static async dispatchStepEvent(
    userId: string,
    date: string,
    totalSteps: number
  ) {
    if (totalSteps <= 0) return;

    try {
      const payload: ChallengeEventPayload = {
        eventId: `device-step-${userId}-${date}`,
        eventType: 'STEPS',
        timestamp: `${date}T23:59:59Z`,
        stepsCount: totalSteps,
      };

      await ChallengeEngine.processEvent(userId, payload);
    } catch (err) {
      console.warn('[StepCounterService] Failed to dispatch challenge event:', err);
    }
  }

  /**
   * Cleanup method for testing or user logout.
   */
  static cleanup() {
    for (const stop of this.stopTrackingMap.values()) {
      try {
        stop();
      } catch (ignored) {}
    }
    this.stopTrackingMap.clear();
    this.currentState.clear();
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    this.activeUserId = null;
  }
}
