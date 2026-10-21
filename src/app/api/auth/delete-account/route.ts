import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rate-limit';
import { rateLimitResponse, redactSecrets } from '@/lib/server-security';
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
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production' ||
    !!process.env.VERCEL_ENV
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

/** Tables that hold user data and must be purged on account deletion. */
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
  { table: 'user_feedback', idCol: 'user_id' },
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
    const body = await req.json().catch(() => ({}));
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
        try {
          // 1. Look up in Supabase Auth admin
          const { data: usersData } = await adminClient.auth.admin.listUsers();
          const authMatch = usersData?.users?.find(
            (u) => u.email?.trim().toLowerCase() === requestEmail
          );
          if (authMatch) {
            matchedUserId = authMatch.id;
            matchedUserEmail = authMatch.email || requestEmail;
          } else {
            // 2. Fallback check profiles table
            const { data: profile } = await adminClient
              .from('profiles')
              .select('id, email')
              .eq('email', requestEmail)
              .maybeSingle();
            if (profile) {
              matchedUserId = profile.id;
              matchedUserEmail = profile.email || requestEmail;
            } else {
              // 3. Fallback check partial deletion recovery ledger
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
            }
          }
        } catch {
          // Swallow lookup error to prevent timing and enumeration attacks
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

      // In test/dev environment, expose debugToken and delivery status
      if (process.env.NODE_ENV === 'test') {
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
          tablesProcessed: TABLES_TO_DELETE.length,
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
