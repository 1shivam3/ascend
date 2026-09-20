import { Platform } from 'react-native';
import {
  HealthPermission,
  HealthRecordType,
  HealthConnectSdkStatus,
  HealthRecord,
  HealthQueryOptions,
} from '../../types/health.types';

export interface HealthConnectClientInterface {
  checkSdkStatus(): Promise<HealthConnectSdkStatus>;
  getGrantedPermissions(): Promise<HealthPermission[]>;
  requestPermissions(permissions: HealthPermission[]): Promise<HealthPermission[]>;
  revokeAllPermissions(): Promise<void>;
  openHealthConnectSettings(): Promise<void>;
  readRecords(
    recordType: HealthRecordType,
    options: HealthQueryOptions
  ): Promise<HealthRecord[]>;
}

/**
 * Mock Health Connect Adapter for unit testing, web, and Expo Go fallback.
 */
export class MockHealthConnectAdapter implements HealthConnectClientInterface {
  private sdkStatus: HealthConnectSdkStatus = 'AVAILABLE';
  private grantedPermissions: Set<HealthPermission> = new Set();
  private mockRecords: Map<HealthRecordType, HealthRecord[]> = new Map();

  constructor(initialStatus: HealthConnectSdkStatus = 'AVAILABLE') {
    this.sdkStatus = initialStatus;
  }

  setSdkStatus(status: HealthConnectSdkStatus) {
    this.sdkStatus = status;
  }

  setGrantedPermissions(permissions: HealthPermission[]) {
    this.grantedPermissions = new Set(permissions);
  }

  seedRecords(recordType: HealthRecordType, records: HealthRecord[]) {
    this.mockRecords.set(recordType, records);
  }

  setMockRecords(recordType: HealthRecordType, records: HealthRecord[]) {
    this.seedRecords(recordType, records);
  }

  async checkSdkStatus(): Promise<HealthConnectSdkStatus> {
    return this.sdkStatus;
  }

  async getGrantedPermissions(): Promise<HealthPermission[]> {
    return Array.from(this.grantedPermissions);
  }

  async requestPermissions(permissions: HealthPermission[]): Promise<HealthPermission[]> {
    if (this.sdkStatus !== 'AVAILABLE') {
      return [];
    }
    // In mock, grant requested permissions
    for (const p of permissions) {
      this.grantedPermissions.add(p);
    }
    return Array.from(this.grantedPermissions);
  }

  async revokeAllPermissions(): Promise<void> {
    this.grantedPermissions.clear();
  }

  async openHealthConnectSettings(): Promise<void> {
    // No-op in mock
  }

  async readRecords(
    recordType: HealthRecordType,
    options: HealthQueryOptions
  ): Promise<HealthRecord[]> {
    const list = this.mockRecords.get(recordType) || [];
    const startMs = new Date(options.startTime).getTime();
    const endMs = new Date(options.endTime).getTime();

    return list.filter(r => {
      const rStart = new Date(r.startTime).getTime();
      const rEnd = new Date(r.endTime).getTime();
      return rStart >= startMs && rEnd <= endMs;
    });
  }
}

/**
 * Native Android Health Connect Adapter.
 * Dynamically wraps Android Health Connect client APIs when on Android runtime.
 * Falls back gracefully to safe defaults if native module is absent.
 */
export class NativeHealthConnectAdapter implements HealthConnectClientInterface {
  private nativeModule: any = null;

  constructor() {
    if (Platform.OS === 'android') {
      try {
        // Dynamic require to prevent bundling failure in Web / Expo Go
        this.nativeModule = require('react-native-health-connect');
      } catch {
        this.nativeModule = null;
      }
    }
  }

  async checkSdkStatus(): Promise<HealthConnectSdkStatus> {
    if (Platform.OS !== 'android' || !this.nativeModule) {
      return 'UNAVAILABLE';
    }

    try {
      const status = await this.nativeModule.getSdkStatus();
      // SDK_AVAILABLE = 1, SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED = 2, SDK_UNAVAILABLE = 3
      if (status === 1 || status === 'SDK_AVAILABLE') return 'AVAILABLE';
      if (status === 2 || status === 'SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED') {
        return 'PROVIDER_UPDATE_REQUIRED';
      }
      return 'UNAVAILABLE';
    } catch {
      return 'UNAVAILABLE';
    }
  }

  async getGrantedPermissions(): Promise<HealthPermission[]> {
    if (!this.nativeModule) return [];

    try {
      const granted = await this.nativeModule.getGrantedPermissions();
      return this.mapNativePermissionsToDomain(granted);
    } catch {
      return [];
    }
  }

  async requestPermissions(permissions: HealthPermission[]): Promise<HealthPermission[]> {
    if (!this.nativeModule) return [];

    try {
      const nativePerms = this.mapDomainPermissionsToNative(permissions);
      const result = await this.nativeModule.requestPermission(nativePerms);
      return this.mapNativePermissionsToDomain(result);
    } catch {
      return [];
    }
  }

  async revokeAllPermissions(): Promise<void> {
    if (!this.nativeModule) return;
    try {
      await this.nativeModule.revokeAllPermissions();
    } catch {
      // ignore
    }
  }

  async openHealthConnectSettings(): Promise<void> {
    if (!this.nativeModule) return;
    try {
      await this.nativeModule.openHealthConnectSettings();
    } catch {
      // ignore
    }
  }

  async readRecords(
    recordType: HealthRecordType,
    options: HealthQueryOptions
  ): Promise<HealthRecord[]> {
    if (!this.nativeModule) return [];

    try {
      const timeRangeFilter = {
        operator: 'between',
        startTime: options.startTime,
        endTime: options.endTime,
      };

      const nativeRecordType = this.mapRecordTypeToNative(recordType);
      if (!nativeRecordType) return [];

      const result = await this.nativeModule.readRecords(nativeRecordType, {
        timeRangeFilter,
      });

      return (result.records || []).map((r: any) => this.mapNativeRecordToDomain(recordType, r));
    } catch (err) {
      console.warn(`[NativeHealthConnectAdapter] Failed to read ${recordType}:`, err);
      return [];
    }
  }

  private mapRecordTypeToNative(type: HealthRecordType): string | null {
    switch (type) {
      case 'STEPS': return 'Steps';
      case 'EXERCISE_SESSION': return 'ExerciseSession';
      case 'DISTANCE': return 'Distance';
      case 'CALORIES': return 'TotalCaloriesBurned';
      case 'WEIGHT': return 'Weight';
      case 'HEART_RATE': return 'HeartRate';
      default: return null;
    }
  }

  private mapDomainPermissionsToNative(permissions: HealthPermission[]): any[] {
    const map: Record<HealthPermission, any> = {
      READ_STEPS: { accessType: 'read', recordType: 'Steps' },
      READ_EXERCISE: { accessType: 'read', recordType: 'ExerciseSession' },
      READ_DISTANCE: { accessType: 'read', recordType: 'Distance' },
      READ_CALORIES: { accessType: 'read', recordType: 'TotalCaloriesBurned' },
      READ_WEIGHT: { accessType: 'read', recordType: 'Weight' },
      READ_HEART_RATE: { accessType: 'read', recordType: 'HeartRate' },
    };
    return permissions.map(p => map[p]).filter(Boolean);
  }

  private mapNativePermissionsToDomain(nativePerms: any[]): HealthPermission[] {
    const list: HealthPermission[] = [];
    for (const np of nativePerms) {
      const rt = np.recordType || np;
      if (rt === 'Steps') list.push('READ_STEPS');
      if (rt === 'ExerciseSession') list.push('READ_EXERCISE');
      if (rt === 'Distance') list.push('READ_DISTANCE');
      if (rt === 'TotalCaloriesBurned' || rt === 'ActiveCaloriesBurned') list.push('READ_CALORIES');
      if (rt === 'Weight') list.push('READ_WEIGHT');
      if (rt === 'HeartRate') list.push('READ_HEART_RATE');
    }
    return list;
  }

  private mapNativeRecordToDomain(type: HealthRecordType, raw: any): HealthRecord {
    let value = 0;
    let unit: any = 'count';

    if (type === 'STEPS') {
      value = Number(raw.count || 0);
      unit = 'count';
    } else if (type === 'DISTANCE') {
      value = Number(raw.distance?.inMeters || raw.distance || 0);
      unit = 'meters';
    } else if (type === 'CALORIES') {
      value = Number(raw.energy?.inKilocalories || raw.calories || 0);
      unit = 'kcal';
    } else if (type === 'WEIGHT') {
      value = Number(raw.weight?.inKilograms || raw.weight || 0);
      unit = 'kg';
    } else if (type === 'HEART_RATE') {
      const samples = raw.samples || [];
      const avg = samples.length > 0
        ? samples.reduce((acc: number, s: any) => acc + (s.beatsPerMinute || 0), 0) / samples.length
        : 0;
      value = Math.round(avg);
      unit = 'bpm';
    }

    return {
      id: raw.metadata?.id ? `hc-${raw.metadata.id}` : `hc-gen-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      userId: '', // populated during ingestion
      recordType: type,
      sourceClient: raw.metadata?.dataOrigin || raw.metadata?.clientRecordId || 'android.health',
      externalId: raw.metadata?.id || null,
      startTime: raw.startTime || new Date().toISOString(),
      endTime: raw.endTime || raw.startTime || new Date().toISOString(),
      value,
      unit,
      metadata: raw.metadata || {},
      isDeduplicated: false,
    };
  }
}

// Singleton adapter instance
let adapterInstance: HealthConnectClientInterface = new NativeHealthConnectAdapter();

export function setHealthConnectAdapter(adapter: HealthConnectClientInterface) {
  adapterInstance = adapter;
}

export function getHealthConnectAdapter(): HealthConnectClientInterface {
  return adapterInstance;
}
