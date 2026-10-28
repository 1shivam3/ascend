import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rate-limit';
import { rateLimitResponse, readJsonBodyWithLimit, RequestBodyTooLargeError, redactSecrets } from '@/lib/server-security';
import {
  createDeletionToken,
  verifyDeletionToken,
  consumeDeletionNonce,
  DeletionTokenPayload,
} from '@/lib/deletion-token';
import {
  sendDeletionVerificationEmail,
  isEmailDeliveryConfigured,
  SendDeletionEmailResult,
} from '@/lib/deletion-mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer',
};

/**
 * Determines whether the request is coming from a Production environment.
 * Used to gate whether missing Supabase config is treated as an error
 * (Production) vs. an offline dev mode (non-Production).
 */
function isProductionEnv(): boolean {
  // F-13 (audit): the old `!!process.env.VERCEL_ENV` clause treated ANY
  // Vercel env — including preview deploys — as production, so preview
  // builds took the production 503 branch when config was missing.
  // Only an explicit production marker counts now.
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production'
  );
}

function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const key = serviceKey || anonKey;

  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Tables that hold user data and must be purged on account deletion.
 * NOTE: user_feedback is deliberately NOT here — it has no user_id
 * column (P1-3: the old loop "deleted" by a nonexistent column and
 * reported success while feedback PII survived). It is purged
 * separately below, by the server-validated auth email.
 * coach_blocks / weekly_reviews (P2-5) exist live with a user_id
 * column (verified via OpenAPI 2026-10-26) even though no repo SQL
 * defines them — they hold user data and must be purged too. */
const TABLES_TO_DELETE: Array<{ table: string; idCol: string }> = [
  { table: 'personal_records', idCol: 'user_id' },
  { table: 'workouts', idCol: 'user_id' },
  { table: 'meals', idCol: 'user_id' },
  { table: 'body_metrics', idCol: 'user_id' },
  { table: 'daily_habits', idCol: 'user_id' },
  { table: 'planned_workouts', idCol: 'user_id' },
  { table: 'custom_barcodes', idCol: 'user_id' },
  { table: 'notification_deliveries', idCol: 'user_id' },
  { table: 'push_subscriptions', idCol: 'user_id' },
  { table: 'notification_preferences', idCol: 'user_id' },
  { table: 'coach_blocks', idCol: 'user_id' },
  { table: 'weekly_reviews', idCol: 'user_id' },
  { table: 'profiles', idCol: 'id' },
];

export async function POST(req: Request) {
  // 1. Rate limiting: 5 requests per 15 minutes per IP
  const rateLimit = await checkRateLimit(req, {
    windowMs: 15 * 60 * 1000,
    maxRequests: 5,
    keyPrefix: 'account-deletion',
  });

  if (!rateLimit.success) {
    const res = rateLimitResponse(rateLimit.resetMs);
    Object.entries(SECURITY_HEADERS).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  }

  try {
    // B2 (audit, F-04 extension): capped body read — action/email/token
    // are tiny, so 64 KB is generous; malformed bodies still fall back
    // to {} exactly as the old req.json().catch() did. The 413 keeps
    // this route's SECURITY_HEADERS, matching its other responses.
    let body: any = {};
    try {
      body = await readJsonBodyWithLimit(req, 64 * 1024);
    } catch (err) {
      if (err instanceof RequestBodyTooLargeError) {
        return NextResponse.json(
          { error: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' },
          { status: 413, headers: SECURITY_HEADERS }
        );
      }
      body = {};
    }
    const action = body.action || (body.requestVerification ? 'request_verification' : 'delete');
    const requestEmail =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : null;

    // ------------------------------------------------------------------
    // FLOW A: Request Deletion Verification Token (External / App Uninstalled)
    // ------------------------------------------------------------------
    if (action === 'request_verification' || action === 'request-token') {
      if (!requestEmail) {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: 'Email address is required to request a deletion verification link.',
          },
          { status: 400, headers: SECURITY_HEADERS }
        );
      }

      const adminClient = getSupabaseAdminClient();
      let matchedUserId: string | null = null;
      let matchedUserEmail: string | null = null;

      if (adminClient) {
        // 1. Look up in Supabase Auth admin, paginating through ALL
        // accounts. listUsers() defaults to the first 50 users, so a
        // single unpaginated call silently misses everyone past
        // position 50 (QA4-007). Loop pages until the user is found
        // or a short page shows the list is exhausted. The page cap
        // is a safety bound against a misbehaving API returning full
        // pages forever (100 pages × 100 = 10,000 accounts).
        try {
          const PER_PAGE = 100;
          const MAX_PAGES = 100;
          for (let page = 1; page <= MAX_PAGES && !matchedUserId; page++) {
            const { data: usersData } = await adminClient.auth.admin.listUsers({
              page,
              perPage: PER_PAGE,
            });
            const users = usersData?.users ?? [];
            const authMatch = users.find(
              (u) => u.email?.trim().toLowerCase() === requestEmail
            );
            if (authMatch) {
              matchedUserId = authMatch.id;
              matchedUserEmail = authMatch.email || requestEmail;
              break;
            }
            if (users.length < PER_PAGE) break;
          }
        } catch {
          // Swallow lookup error to prevent timing and enumeration attacks
        }

        if (!matchedUserId) {
          // 2. Fallback check partial deletion recovery ledger — in its
          // own try so an Auth-listing failure above cannot skip the
          // recovery path for an already-purged account.
          // (There is deliberately no profiles-table fallback: the
          // production profiles table has no email column, so such a
          // query could only ever error — QA4A-002.)
          try {
            const { data: partialRow } = await adminClient
              .from('consumed_deletion_nonces')
              .select('user_id, email')
              .eq('email', requestEmail)
              .eq('status', 'partial')
              .maybeSingle();
            if (partialRow) {
              matchedUserId = partialRow.user_id;
              matchedUserEmail = partialRow.email || requestEmail;
            }
          } catch {
            // Swallow lookup error to prevent timing and enumeration attacks
          }
        }
      }

      let generatedToken: string | null = null;
      let emailResult: SendDeletionEmailResult | null = null;

      if (matchedUserId && matchedUserEmail) {
        // Generate single-use, 15-minute time-limited cryptographic token
        generatedToken = createDeletionToken(matchedUserId, matchedUserEmail, 15 * 60 * 1000);

        // Dispatches email using server-side credentials
        emailResult = await sendDeletionVerificationEmail({
          recipientEmail: matchedUserEmail,
          token: generatedToken,
          appOrigin: req.headers.get('origin') || undefined,
        });
      }

      // Requirement 4: Prevent account enumeration — always return 200 with identical copy
      const responsePayload: Record<string, any> = {
        success: true,
        action: 'verification_requested',
        message:
          'If an account is associated with this email address, a single-use verification link has been sent.',
      };

      // In test/dev environment, expose debugToken and delivery status.
      // Gauntlet SEC-04: NODE_ENV alone is not a sufficient gate — a
      // test-env deployment would return a LIVE single-use deletion
      // token to unauthenticated callers. The debug payload additionally
      // requires an explicit opt-in env var, off by default everywhere.
      if (process.env.NODE_ENV === 'test' && process.env.ALLOW_DELETION_DEBUG_TOKEN === 'true') {
        if (generatedToken) {
          responsePayload.debugToken = generatedToken;
        }
        responsePayload.deliveryConfigured = isEmailDeliveryConfigured();
        if (emailResult) {
          responsePayload.emailDelivered = emailResult.success;
          if (emailResult.error) {
            responsePayload.emailError = emailResult.error;
          }
        }
      }

      return NextResponse.json(responsePayload, { status: 200, headers: SECURITY_HEADERS });
    }

    // ------------------------------------------------------------------
    // FLOW B: Execute Account Deletion
    // ------------------------------------------------------------------

    // 1a. Validate Supabase configuration
    const supabase = getSupabaseServerClient();
    const adminClient = getSupabaseAdminClient();

    // P2-2: deletion with only the anon key is not a degraded deletion
    // — it is a failed one (RLS blocks the table purges, the auth purge
    // is skipped) reported as partial 207s. In production, refuse
    // outright when the service key is missing instead of running a
    // doomed purge under the anon fallback.
    if (!adminClient && isProductionEnv()) {
      return NextResponse.json(
        {
          error: 'CONFIGURATION_ERROR',
          message:
            'Account deletion cannot be processed: server configuration is incomplete. Please contact support.',
        },
        { status: 503, headers: SECURITY_HEADERS }
      );
    }

    if (!supabase) {
      if (isProductionEnv()) {
        return NextResponse.json(
          {
            error: 'CONFIGURATION_ERROR',
            message:
              'Account deletion cannot be processed: server configuration is incomplete. Please contact support.',
          },
          { status: 503, headers: SECURITY_HEADERS }
        );
      }

      // Non-Production: offline mode
      return NextResponse.json(
        {
          cloudDeleted: false,
          message:
            'Cloud deletion skipped: Supabase is not configured in this environment. ' +
            'Local device data will be purged by the client.',
          timestamp: new Date().toISOString(),
        },
        { status: 200, headers: SECURITY_HEADERS }
      );
    }

    // 1b. Authenticate the request via:
    // Option 1: Supabase Bearer access token (signed-in user)
    // Option 2: Single-use cryptographic verification token (external / recovery)
    let authUser: { id: string; email?: string } | null = null;
    let authMethod: 'bearer_token' | 'verification_token' | null = null;
    let validatedTokenPayload: DeletionTokenPayload | null = null;

    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      const token = authHeader.substring(7).trim();
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (!error && user) {
        authUser = { id: user.id, email: user.email };
        authMethod = 'bearer_token';
      }
    }

    // If no valid Bearer token, check for verification token in body or header
    const candidateVerificationToken =
      typeof body.token === 'string'
        ? body.token.trim()
        : typeof body.verificationToken === 'string'
          ? body.verificationToken.trim()
          : req.headers.get('x-deletion-token')?.trim();

    if (!authUser && candidateVerificationToken) {
      const verificationResult = await verifyDeletionToken(
        candidateVerificationToken,
        requestEmail,
        adminClient || supabase
      );

      if (!verificationResult.valid) {
        if (verificationResult.error === 'EMAIL_MISMATCH') {
          return NextResponse.json(
            {
              error: 'FORBIDDEN',
              message: verificationResult.message,
            },
            { status: 403, headers: SECURITY_HEADERS }
          );
        }

        return NextResponse.json(
          {
            error: verificationResult.error,
            message: verificationResult.message,
          },
          { status: 401, headers: SECURITY_HEADERS }
        );
      }

      // Token verified successfully
      authUser = {
        id: verificationResult.payload.sub,
        email: verificationResult.payload.email,
      };
      authMethod = 'verification_token';
      validatedTokenPayload = verificationResult.payload;
    }

    // Requirement 1 & 4: Never allow an email alone to authorize account deletion
    if (!authUser) {
      return NextResponse.json(
        {
          error: 'UNAUTHORIZED',
          message:
            'A valid authentication token or single-use verification token is required to delete an account.',
        },
        { status: 401, headers: SECURITY_HEADERS }
      );
    }

    // Defense in depth: if an email was provided in the body, it must match the authenticated identity
    if (requestEmail && authUser.email) {
      const normalizedAuthEmail = authUser.email.trim().toLowerCase();
      if (requestEmail !== normalizedAuthEmail) {
        return NextResponse.json(
          {
            error: 'FORBIDDEN',
            message: 'The provided email does not match the authenticated user.',
          },
          { status: 403, headers: SECURITY_HEADERS }
        );
      }
    }

    const userId = authUser.id;

    // ------------------------------------------------------------------
    // 2. Cascade delete records from all user-linked tables
    // ------------------------------------------------------------------
    const deleteResults: Record<string, { deleted: boolean; error: string | null }> = {};
    let allTablesDeleted = true;

    for (const { table, idCol } of TABLES_TO_DELETE) {
      try {
        const { error } = await supabase.from(table).delete().eq(idCol, userId);
        if (error) {
          deleteResults[table] = { deleted: false, error: error.message };
          allTablesDeleted = false;
        } else {
          deleteResults[table] = { deleted: true, error: null };
        }
      } catch (err: any) {
        deleteResults[table] = { deleted: false, error: err?.message || 'skipped' };
        allTablesDeleted = false;
      }
    }

    // P1-3: feedback purge, by the SERVER-VALIDATED email only.
    // authUser.email comes from Supabase getUser or the signed
    // verification-token payload — never from the request body (the
    // body email is already forced to match it above when provided).
    // The column is user_email, not user_id. Without a validated email
    // this is reported as failed, not silently "deleted".
    const validatedEmail = authUser.email?.trim().toLowerCase() || null;
    if (validatedEmail) {
      try {
        const { error } = await supabase
          .from('user_feedback')
          .delete()
          .eq('user_email', validatedEmail);
        if (error) {
          deleteResults['user_feedback'] = { deleted: false, error: error.message };
          allTablesDeleted = false;
        } else {
          deleteResults['user_feedback'] = { deleted: true, error: null };
        }
      } catch (err: any) {
        deleteResults['user_feedback'] = { deleted: false, error: err?.message || 'skipped' };
        allTablesDeleted = false;
      }
    } else {
      deleteResults['user_feedback'] = {
        deleted: false,
        error: 'no validated email; feedback retained',
      };
      allTablesDeleted = false;
    }

    // ------------------------------------------------------------------
    // 3. Purge user from Supabase Auth (requires service-role key)
    // ------------------------------------------------------------------
    let authUserDeleted = false;
    let authPurgeError: string | null = null;

    if (adminClient) {
      try {
        const { error: deleteUserErr } = await adminClient.auth.admin.deleteUser(
          userId
        );
        if (deleteUserErr) {
          // If the auth user was already removed on a previous run (retry scenario), treat as purged
          const errMsg = deleteUserErr.message?.toLowerCase() || '';
          if (errMsg.includes('not found') || (deleteUserErr as any).status === 404) {
            authUserDeleted = true;
          } else {
            authPurgeError = deleteUserErr.message;
          }
        } else {
          authUserDeleted = true;
        }
      } catch (err: any) {
        authPurgeError = err?.message || 'auth purge failed';
      }
    } else {
      authPurgeError = 'Service-role key not configured; auth purge skipped.';
      allTablesDeleted = false;
    }

    // ------------------------------------------------------------------
    // 4. Token Consumption & Partial Deletion Recovery (Requirement 4)
    // ------------------------------------------------------------------
    let fullyDeleted =
      allTablesDeleted && (authPurgeError === null || authUserDeleted);

    if (validatedTokenPayload) {
      if (fullyDeleted) {
        try {
          // Complete erasure: Mark nonce permanently consumed in durable ledger & cache
          await consumeDeletionNonce(
            validatedTokenPayload.jti,
            validatedTokenPayload,
            'consumed',
            adminClient || supabase
          );

          // Clean up any lingering partial recovery records for this email (anonymizing PII)
          if (adminClient || supabase) {
            try {
              await (adminClient || supabase)
                .from('consumed_deletion_nonces')
                .update({ status: 'consumed', email: null, user_id: null })
                .eq('email', validatedTokenPayload.email)
                .eq('status', 'partial');
            } catch {}
          }
        } catch (nonceErr) {
          // If durable ledger write fails (e.g. unexpected/missing DB columns),
          // do NOT claim deletion fully succeeded without durable replay protection!
          fullyDeleted = false;
        }
      } else {
        try {
          // Partial deletion: Mark as partial recovery in durable ledger so retry can resume
          await consumeDeletionNonce(
            validatedTokenPayload.jti,
            validatedTokenPayload,
            'partial',
            adminClient || supabase
          );
        } catch {}
      }
    }

    // ------------------------------------------------------------------
    // 5. Build response with accurate success semantics (Requirement 5)
    // ------------------------------------------------------------------
    return NextResponse.json(
      {
        cloudDeleted: fullyDeleted,
        authPurged: authUserDeleted,
        authPurgeError: authPurgeError ? redactSecrets(authPurgeError) : null,
        tableResults: Object.fromEntries(
          Object.entries(deleteResults).map(([table, result]) => [
            table,
            // QA4-032: per-table DB errors went out RAW while
            // authPurgeError beside them was redacted — redact both.
            result.deleted
              ? 'deleted'
              : `failed: ${redactSecrets(result.error || 'unknown error')}`,
          ])
        ),
        userId,
        audit: {
          method: authMethod === 'bearer_token' ? 'Bearer token validated' : 'Verification token validated',
          emailMatched:
            requestEmail === null ||
            (authUser.email && requestEmail === authUser.email.trim().toLowerCase()),
          tablesProcessed: Object.keys(deleteResults).length,
          tablesSucceeded: Object.values(deleteResults).filter((r) => r.deleted).length,
          authPurged: authUserDeleted,
          timestamp: new Date().toISOString(),
        },
        message: fullyDeleted
          ? 'Your ASCEND account and all associated cloud data have been permanently deleted.'
          : authUserDeleted
            ? 'Some cloud tables could not be fully deleted. Please retry or contact support.'
            : 'Account deletion encountered errors. See details.',
      },
      { status: fullyDeleted ? 200 : 207, headers: SECURITY_HEADERS }
    );
  } catch (err: any) {
    const safeError = redactSecrets(err?.message || 'Internal deletion failure');
    return NextResponse.json(
      {
        cloudDeleted: false,
        error: 'DELETION_FAILED',
        message: safeError,
      },
      { status: 500, headers: SECURITY_HEADERS }
    );
  }
}
