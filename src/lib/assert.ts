/**
 * Shared state-machine helpers (state-machines program, Phase 0).
 *
 * `assertNever` — exhaustiveness guard for discriminated-union switches:
 * if a new variant is added and a switch doesn't handle it, the call site
 * stops type-checking. At runtime (unreachable in correct code, reachable
 * via corrupt/legacy persisted data) it throws with the offending value.
 *
 * `invariant` — dev-only assertion: throws in development and tests so a
 * violated state invariant fails loudly at the moment it breaks; in
 * production it logs once per message and lets the app continue (a fitness
 * app mid-workout must not crash on a bookkeeping assertion). "Logs once"
 * is per exact message string, per session.
 */

export function assertNever(value: never, context?: string): never {
  const rendered = (() => {
    try {
      return JSON.stringify(value) ?? String(value);
    } catch {
      return String(value);
    }
  })();
  throw new Error(
    `assertNever: unhandled value ${rendered}${context ? ` (${context})` : ''}`,
  );
}

const loggedInvariantMessages = new Set<string>();

export function invariant(condition: unknown, message: string): asserts condition {
  if (condition) return;
  if (process.env.NODE_ENV !== 'production') {
    throw new Error(`invariant violated: ${message}`);
  }
  if (!loggedInvariantMessages.has(message)) {
    loggedInvariantMessages.add(message);
    console.error(`[invariant] ${message}`);
  }
}

/** Test hook: forget which invariant messages have already been logged. */
export function __resetInvariantLogCache(): void {
  loggedInvariantMessages.clear();
}
