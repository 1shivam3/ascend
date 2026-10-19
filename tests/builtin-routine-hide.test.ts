import { describe, it, expect, beforeEach } from 'vitest';
import { useStore, partializeAppState } from '../src/lib/store';

describe('Built-in routine hide/restore (Train tab merge)', () => {
  beforeEach(() => {
    useStore.getState().clearAllData();
  });

  it('hides a built-in routine and restores it', () => {
    const store = useStore.getState();
    expect(store.hiddenBuiltinRoutineIds).toEqual([]);

    store.hideBuiltinRoutine('ref_upper_body');
    expect(useStore.getState().hiddenBuiltinRoutineIds).toEqual(['ref_upper_body']);

    // hiding twice does not duplicate
    store.hideBuiltinRoutine('ref_upper_body');
    expect(useStore.getState().hiddenBuiltinRoutineIds).toEqual(['ref_upper_body']);

    store.unhideBuiltinRoutine('ref_upper_body');
    expect(useStore.getState().hiddenBuiltinRoutineIds).toEqual([]);
  });

  it('persists hidden ids through partialize', () => {
    useStore.getState().hideBuiltinRoutine('ref_lower_body');
    const persisted = partializeAppState(useStore.getState()) as Record<string, unknown>;
    expect(persisted.hiddenBuiltinRoutineIds).toEqual(['ref_lower_body']);
  });

  it('clearAllData resets hidden ids', () => {
    const store = useStore.getState();
    store.hideBuiltinRoutine('ref_upper_body');
    store.clearAllData();
    expect(useStore.getState().hiddenBuiltinRoutineIds).toEqual([]);
  });
});
