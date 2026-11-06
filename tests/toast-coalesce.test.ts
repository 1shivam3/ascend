import { describe, it, expect } from 'vitest';
import { upsertToast, type ToastMessage } from '../src/components/ui/Toast';

/**
 * Phone-polish (2026-11-06): two rapid hydration taps produced two
 * identical "Hydration Updated / +500 ml logged" toasts visible at
 * the same time. upsertToast is the provider's merge step: a plain
 * toast identical in type + title + message replaces the visible one
 * instead of stacking; anything distinct — and anything carrying an
 * action — always appends.
 */

const plain = (id: string, over: Partial<ToastMessage> = {}): ToastMessage => ({
  id,
  type: 'success',
  title: 'Hydration Updated',
  message: '+500 ml logged',
  ...over,
});

describe('upsertToast coalescing', () => {
  it('an identical plain toast replaces the visible one instead of stacking', () => {
    const first = plain('t1');
    const second = plain('t2');
    const merged = upsertToast([first], second);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('t2'); // fresh id: lifetime + fade restart
    expect(merged[0]).toBe(second);
  });

  it('keeps the stack position of the toast it replaces', () => {
    const other = plain('t0', { title: 'Workout Saved', message: 'Logged workout with 1 exercise!' });
    const merged = upsertToast([other, plain('t1')], plain('t2'));
    expect(merged.map((t) => t.id)).toEqual(['t0', 't2']);
  });

  it('a third identical tap still leaves exactly one toast', () => {
    let toasts: ToastMessage[] = [];
    toasts = upsertToast(toasts, plain('t1'));
    toasts = upsertToast(toasts, plain('t2'));
    toasts = upsertToast(toasts, plain('t3'));
    expect(toasts).toHaveLength(1);
    expect(toasts[0].id).toBe('t3');
  });

  it('distinct notifications still stack: different message', () => {
    const merged = upsertToast([plain('t1')], plain('t2', { message: '+250 ml logged' }));
    expect(merged).toHaveLength(2);
  });

  it('distinct notifications still stack: different title', () => {
    const merged = upsertToast([plain('t1')], plain('t2', { title: 'Meal Logged' }));
    expect(merged).toHaveLength(2);
  });

  it('distinct notifications still stack: different type', () => {
    const merged = upsertToast([plain('t1')], plain('t2', { type: 'info' }));
    expect(merged).toHaveLength(2);
  });

  it('toasts with no title coalesce on type + message alone', () => {
    const a: ToastMessage = { id: 't1', type: 'info', message: 'Synced' };
    const b: ToastMessage = { id: 't2', type: 'info', message: 'Synced' };
    const merged = upsertToast([a], b);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('t2');
  });

  it('a new ACTION toast never coalesces into an identical plain one', () => {
    const withAction = plain('t2', { action: { label: 'Undo', onAction: () => {} } });
    const merged = upsertToast([plain('t1')], withAction);
    expect(merged).toHaveLength(2);
    expect(merged[1].action?.label).toBe('Undo');
  });

  it('a plain duplicate never replaces a visible ACTION toast (its Undo must survive)', () => {
    const actionToast = plain('t1', { action: { label: 'Undo', onAction: () => {} } });
    const merged = upsertToast([actionToast], plain('t2'));
    expect(merged).toHaveLength(2);
    expect(merged[0].id).toBe('t1');
    expect(merged[0].action?.label).toBe('Undo');
  });
});
