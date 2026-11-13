/**
 * §34 — the account-deletion page as ONE state machine.
 *
 * Before: the status union lived beside a parallel mini-machine
 * (sessionUser × isCheckingSession — three real states smeared
 * across two variables), 'error' was a sink with no reset
 * transition, and form visibility was a compound condition
 * re-derived at every render site.
 *
 * Now: one state object + one reducer. The session check is an
 * arm of the state (checking | signed-out | signed-in). 'error'
 * has an explicit reset transition (back to the form, message
 * cleared) and is NOT reachable from the terminal states:
 * complete/skipped have no outgoing transitions at all, and
 * partial — whose panel offers a retry-cleanup — returns to
 * partial (with the failure as its details) instead of falling
 * into the form's error state.
 */

export type DeletionStatus =
  | 'idle'
  | 'requesting_token'
  | 'token_requested'
  | 'deleting'
  | 'complete'
  | 'partial'
  | 'skipped'
  | 'error';

export type SessionCheck =
  | { kind: 'checking' }
  | { kind: 'signed-out' }
  | { kind: 'signed-in'; email: string; accessToken: string };

export interface DeletionFlowState {
  status: DeletionStatus;
  session: SessionCheck;
  errorMessage: string | null;
  statusDetails: string | null;
  /** Internal: a delete started from 'partial' (the retry-cleanup
   * edge) returns to 'partial' on failure instead of 'error'. */
  deletingFromPartial: boolean;
}

export type DeletionEvent =
  | { type: 'session-resolved'; user: { email: string; accessToken: string } | null }
  | { type: 'request-token' }
  | { type: 'token-sent'; details: string }
  | { type: 'request-failed'; message: string }
  | { type: 'delete' }
  | { type: 'delete-complete'; details: string }
  | { type: 'delete-partial'; details: string }
  | { type: 'delete-skipped'; details: string }
  | { type: 'delete-failed'; message: string }
  | { type: 'invalid'; message: string }
  | { type: 'reset' };

export function initialDeletionFlow(init?: {
  status?: DeletionStatus;
  errorMessage?: string | null;
  statusDetails?: string | null;
  sessionUser?: { email: string; accessToken: string } | null;
}): DeletionFlowState {
  return {
    status: init?.status ?? 'idle',
    session:
      init?.sessionUser === undefined
        ? { kind: 'checking' }
        : init.sessionUser
          ? {
              kind: 'signed-in',
              email: init.sessionUser.email,
              accessToken: init.sessionUser.accessToken,
            }
          : { kind: 'signed-out' },
    errorMessage: init?.errorMessage ?? null,
    statusDetails: init?.statusDetails ?? null,
    deletingFromPartial: false,
  };
}

/** Terminal for VISIBILITY: the form hides, the outcome panel shows. */
export function isTerminalStatus(status: DeletionStatus): boolean {
  return status === 'complete' || status === 'partial' || status === 'skipped';
}

/** The form's identity mode — replaces the sessionUser×checking reads. */
export function deletionFormMode(
  state: DeletionFlowState,
): 'checking' | 'session' | 'token' {
  if (state.session.kind === 'checking') return 'checking';
  if (state.session.kind === 'signed-in') return 'session';
  return 'token';
}

export function deletionFlowReducer(
  state: DeletionFlowState,
  event: DeletionEvent,
): DeletionFlowState {
  switch (event.type) {
    case 'session-resolved':
      return {
        ...state,
        session: event.user
          ? {
              kind: 'signed-in',
              email: event.user.email,
              accessToken: event.user.accessToken,
            }
          : { kind: 'signed-out' },
      };
    case 'request-token':
      if (
        state.status === 'idle' ||
        state.status === 'token_requested' ||
        state.status === 'error'
      ) {
        return { ...state, status: 'requesting_token', errorMessage: null };
      }
      return state;
    case 'token-sent':
      if (state.status !== 'requesting_token') return state;
      return { ...state, status: 'token_requested', statusDetails: event.details };
    case 'request-failed':
      if (state.status !== 'requesting_token') return state;
      return { ...state, status: 'error', errorMessage: event.message };
    case 'delete':
      if (
        state.status === 'idle' ||
        state.status === 'token_requested' ||
        state.status === 'error' ||
        state.status === 'partial'
      ) {
        return {
          ...state,
          status: 'deleting',
          errorMessage: null,
          deletingFromPartial: state.status === 'partial',
        };
      }
      return state;
    case 'delete-complete':
      if (state.status !== 'deleting') return state;
      return {
        ...state,
        status: 'complete',
        statusDetails: event.details,
        deletingFromPartial: false,
      };
    case 'delete-partial':
      if (state.status !== 'deleting') return state;
      return {
        ...state,
        status: 'partial',
        statusDetails: event.details,
        deletingFromPartial: false,
      };
    case 'delete-skipped':
      if (state.status !== 'deleting') return state;
      return {
        ...state,
        status: 'skipped',
        statusDetails: event.details,
        deletingFromPartial: false,
      };
    case 'delete-failed':
      if (state.status !== 'deleting') return state;
      if (state.deletingFromPartial) {
        // The partial panel keeps showing; the failure becomes
        // its details. 'error' is not reachable from a terminal.
        return {
          ...state,
          status: 'partial',
          statusDetails: event.message,
          deletingFromPartial: false,
        };
      }
      return {
        ...state,
        status: 'error',
        errorMessage: event.message,
        deletingFromPartial: false,
      };
    case 'invalid':
      // Form validation (confirm text, missing token/email). Only
      // the form states can produce it — a terminal outcome can
      // never be dragged back into 'error'.
      if (
        state.status === 'idle' ||
        state.status === 'token_requested' ||
        state.status === 'error'
      ) {
        return { ...state, status: 'error', errorMessage: event.message };
      }
      return state;
    case 'reset':
      // The explicit way out of 'error': back to the form with
      // the message cleared. Everywhere else it is a no-op (a
      // completed deletion cannot be reset back into the form).
      if (state.status === 'error') {
        return { ...state, status: 'idle', errorMessage: null };
      }
      return state;
    default:
      return state;
  }
}
