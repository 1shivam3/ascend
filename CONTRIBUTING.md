# Contributing to ASCEND

## Adding a state to a machine

ASCEND's state machines are catalogued in `STATE_MACHINES.md` — one
discriminated union plus a pure transition function (reducer) per machine,
owned by a single file. When you add a state to one of them:

1. **Add the variant to the union** in the owner file, with the data it
   carries inside the variant (never a parallel boolean or a second field
   that must agree with it — illegal combinations must stay
   unrepresentable).
2. **Handle it in the transition function.** Reducers switch exhaustively
   and end in `assertNever` (`src/lib/assert.ts`), so an unhandled variant
   is a compile error, not a runtime surprise. A transition that should be
   impossible from a given state is a no-op returning the same state —
   say so in a comment.
3. **Update every selector/reader** that switches on the union (the
   compiler finds them via the exhaustiveness checks).
4. **Persisted shape?** If the state is stored (localStorage, Supabase,
   backups), the change needs a versioned migration, backward-compatible
   reads, and an old-shape fixture test — see the persist-migration tests
   for the pattern. Never let a stored blob lose user data.
5. **Tests:** characterization first for behavior you are changing, then a
   test per new transition. If the machine has a named invariant in
   `tests/state-invariants-phase5.test.ts`, extend that suite.
6. **User-visible strings** need English AND Hindi entries
   (`src/lib/i18n/en.ts` / `hi.ts`).
7. **Update `STATE_MACHINES.md`** — the machine's states, transitions and
   invariants — in the same commit.

Do not add a state-machine library for this; the reducer pattern above has
covered every machine in the app so far.
