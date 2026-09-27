import { NativeModules, NativeEventEmitter, Platform, DeviceEventEmitter } from 'react-native';
import { StepSensorEvent } from './types';

export interface StepCounterAdapterInterface {
  isSensorAvailable(): Promise<boolean>;
  hasPermission(): Promise<boolean>;
  requestPermission(): Promise<boolean>;
  getRawSensorValue(): Promise<number | null>;
  startLiveTracking(listener: (event: StepSensorEvent) => void): () => void;
}

const { StepCounterModule } = NativeModules;

/**
 * Native Android Step Counter Adapter interfacing directly with StepCounterModule.kt.
 */
export class NativeStepCounterAdapter implements StepCounterAdapterInterface {
  private eventEmitter: NativeEventEmitter | typeof DeviceEventEmitter | null = null;

  constructor() {
    if (Platform.OS === 'android' && StepCounterModule) {
      this.eventEmitter = new NativeEventEmitter(StepCounterModule);
    }
  }

  async isSensorAvailable(): Promise<boolean> {
    if (Platform.OS !== 'android' || !StepCounterModule?.isSensorAvailable) {
      return false;
    }
    try {
      return await StepCounterModule.isSensorAvailable();
    } catch {
      return false;
    }
  }

  async hasPermission(): Promise<boolean> {
    if (Platform.OS !== 'android' || !StepCounterModule?.hasPermission) {
      return true;
    }
    try {
      return await StepCounterModule.hasPermission();
    } catch {
      return false;
    }
  }

  async requestPermission(): Promise<boolean> {
    if (Platform.OS !== 'android' || !StepCounterModule?.requestPermission) {
      return true;
    }
    try {
      return await StepCounterModule.requestPermission();
    } catch {
      return false;
    }
  }

  async getRawSensorValue(): Promise<number | null> {
    if (Platform.OS !== 'android' || !StepCounterModule?.getRawSensorValue) {
      return null;
    }
    try {
      const val = await StepCounterModule.getRawSensorValue();
      return typeof val === 'number' ? val : null;
    } catch {
      return null;
    }
  }

  startLiveTracking(listener: (event: StepSensorEvent) => void): () => void {
    if (Platform.OS !== 'android' || !StepCounterModule) {
      return () => {};
    }

    try {
      StepCounterModule.startLiveTracking?.();
    } catch (err) {
      console.warn('[NativeStepCounterAdapter] Failed to start live tracking:', err);
    }

    const emitter = this.eventEmitter || DeviceEventEmitter;
    const subscription = emitter.addListener('onStepCounterChanged', (data: any) => {
      if (data && typeof data.rawSensorValue === 'number') {
        listener({
          rawSensorValue: data.rawSensorValue,
          timestamp: data.timestamp || Date.now(),
        });
      }
    });

    return () => {
      subscription.remove();
      try {
        StepCounterModule.stopLiveTracking?.();
      } catch (err) {
        console.warn('[NativeStepCounterAdapter] Failed to stop live tracking:', err);
      }
    };
  }
}

/**
 * Mock Step Counter Adapter for unit tests, web runtime, and sensor simulation.
 */
export class MockStepCounterAdapter implements StepCounterAdapterInterface {
  private available = true;
  private permissionGranted = true;
  private rawValue: number | null = 10000;
  private listeners: ((event: StepSensorEvent) => void)[] = [];

  constructor(available: boolean = true, permissionGranted: boolean = true) {
    this.available = available;
    this.permissionGranted = permissionGranted;
  }

  setAvailable(available: boolean) {
    this.available = available;
  }

  setPermission(granted: boolean) {
    this.permissionGranted = granted;
  }

  setRawSensorValue(value: number | null) {
    this.rawValue = value;
  }

  emitSensorEvent(rawSensorValue: number, timestamp: number = Date.now()) {
    this.rawValue = rawSensorValue;
    this.listeners.forEach((l) => l({ rawSensorValue, timestamp }));
  }

  async isSensorAvailable(): Promise<boolean> {
    return this.available;
  }

  async hasPermission(): Promise<boolean> {
    return this.permissionGranted;
  }

  async requestPermission(): Promise<boolean> {
    return this.permissionGranted;
  }

  async getRawSensorValue(): Promise<number | null> {
    if (!this.available || !this.permissionGranted) return null;
    return this.rawValue;
  }

  startLiveTracking(listener: (event: StepSensorEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
}
