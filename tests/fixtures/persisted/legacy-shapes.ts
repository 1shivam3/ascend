/**
 * Versioned persisted-shape fixtures (state-machines program, Phase 0).
 *
 * Each export is a PersistedFixture: the raw localStorage strings an app
 * version actually wrote. NEVER edit an existing fixture to match a new
 * shape — add a new one. Migration tests seed the OLD fixture and assert
 * the new reader keeps the data.
 */
import type { PersistedFixture } from '../../helpers/persisted-fixtures';
import { fixtureOf, storeEnvelopeFixture } from '../../helpers/persisted-fixtures';

/**
 * Pre-§17-unification workout history: sets carry the legacy `completed`
 * boolean and NO `status` field (and one set carries only reps>0, the
 * third legacy encoding). Readers must keep resolving these correctly.
 */
export const legacySetEncodings: PersistedFixture = storeEnvelopeFixture('ascend_store', {
  workouts: [
    {
      id: 'w-legacy-1',
      date: '2026-11-01T06:00:00.000Z',
      name: 'Legacy Day',
      exercises: [
        {
          name: 'Squat',
          sets: [
            { reps: 5, weight: 100, completed: true },
            { reps: 5, weight: 100, completed: false },
            { reps: 8, weight: 60 },
          ],
        },
      ],
    },
  ],
  profile: null,
});

/**
 * Sync quarantine as written by PR #126 (pre-§7 cleanup): entries persist
 * the RAW server error message and may carry a null stamp.
 */
export const quarantineV1WithRawMessage: PersistedFixture = fixtureOf(
  'sync quarantine v1 (PR #126 shape)',
  {
    ascend_sync_quarantine_v1: JSON.stringify({
      user_1: [
        {
          collection: 'body_metrics',
          rowId: 'bm-1',
          stamp: null,
          code: '23505',
          message: 'duplicate key value violates unique constraint "body_metrics_user_date_unique"',
          quarantinedAt: '2026-11-08T04:30:00.000Z',
        },
      ],
    }),
  },
);

/**
 * Last-pushed-signature adoption baseline BEFORE user scoping (§8):
 * one bare global string, no user id anywhere.
 */
export const unscopedAdoptionSignature: PersistedFixture = fixtureOf(
  'adoption signature, unscoped (pre-Phase-1.2)',
  {
    ascend_last_pushed_signature: 'sig-of-account-a-data',
  },
);

/**
 * Merge-gate resolved marker as persisted today (§4): the signature is
 * built from sorted row IDs only.
 */
export const mergeMarkerIdsOnly: PersistedFixture = fixtureOf(
  'merge-gate resolved marker, ids-only signature (pre-Phase-1.3)',
  {
    ascend_merge_choice_resolved: 'user_1:bm-1|bm-2|w-1',
  },
);
