import { describe, it, expect, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import {
  createDeletionToken,
  verifyDeletionToken,
  consumeDeletionNonce,
  resetConsumedNoncesForTests,
} from '../src/lib/deletion-token';

const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';
const LOCAL_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

function queryDb(sql: string): string {
  try {
    return execSync(
      `docker exec supabase_db_ascend psql -U postgres -d postgres -t -A -c "${sql.replace(/"/g, '\\"')}"`,
      { encoding: 'utf-8' }
    ).trim();
  } catch (err: any) {
    return `ERROR: ${err.stderr || err.stdout || err.message}`;
  }
}

describe('ASCEND Security Integration Gate — Real Local Database Tests', () => {
  beforeEach(() => {
    resetConsumedNoncesForTests();
  });

  // ---------------------------------------------------------------------------
  // 1. Account Deletion Nonce Schema & Consistency Tests
  // ---------------------------------------------------------------------------
  describe('Account Deletion Nonce Consistency & Recovery Lifecycle', () => {
    it('verifies that the actual database table schema has jti as primary key', () => {
      const pkDef = queryDb(
        "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.consumed_deletion_nonces'::regclass AND contype = 'p';"
      );
      expect(pkDef).toBe('PRIMARY KEY (jti)');

      const cols = queryDb(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'consumed_deletion_nonces' ORDER BY ordinal_position;"
      ).split('\n');

      expect(cols).toEqual(['jti', 'user_id', 'email', 'status', 'consumed_at', 'expires_at']);
    });

    it('records a new deletion nonce and rejects replay against real PostgreSQL', async () => {
      const client = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY);
      const testEmail = 'athlete-replay-test@example.com';
      const token = createDeletionToken('user-del-1', testEmail, 15 * 60 * 1000);

      // Verify token is initially valid
      const verifyInitial = await verifyDeletionToken(token, testEmail, client);
      expect(verifyInitial.valid).toBe(true);
      if (!verifyInitial.valid) return;

      // Consume nonce in real database
      await consumeDeletionNonce(verifyInitial.payload.jti, verifyInitial.payload, 'consumed', client);

      // Verify in DB that it is marked consumed
      const dbRow = queryDb(
        `SELECT status, email, user_id FROM public.consumed_deletion_nonces WHERE jti = '${verifyInitial.payload.jti}';`
      );
      expect(dbRow).toBe('consumed||'); // email & user_id anonymized to NULL

      // Clear memory cache to ensure durable ledger blocks replay across instances
      resetConsumedNoncesForTests();

      // Attempt to verify again with clean memory — MUST be rejected via DB
      const verifyReplay = await verifyDeletionToken(token, testEmail, client);
      expect(verifyReplay.valid).toBe(false);
      if (!verifyReplay.valid) {
        expect(verifyReplay.error).toBe('TOKEN_ALREADY_USED');
      }
    });

    it('marks partial deletion, allows retry, and finalizes with anonymized identifiers', async () => {
      const client = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY);
      const testEmail = 'athlete-recovery-test@example.com';
      const testUserId = 'a0000000-0000-4000-8000-000000000001';
      const token = createDeletionToken(testUserId, testEmail, 15 * 60 * 1000);

      const verifyInitial = await verifyDeletionToken(token, testEmail, client);
      expect(verifyInitial.valid).toBe(true);
      if (!verifyInitial.valid) return;

      // Mark partial deletion in real database (e.g. some table failed to delete)
      await consumeDeletionNonce(verifyInitial.payload.jti, verifyInitial.payload, 'partial', client);

      // Verify DB retained identifiers for recovery
      const dbPartial = queryDb(
        `SELECT status, email, user_id FROM public.consumed_deletion_nonces WHERE jti = '${verifyInitial.payload.jti}';`
      );
      expect(dbPartial).toBe(`partial|${testEmail}|${testUserId}`);

      // Clear memory cache — retry must be permitted by the durable ledger
      resetConsumedNoncesForTests();
      const verifyRetry = await verifyDeletionToken(token, testEmail, client);
      expect(verifyRetry.valid).toBe(true);

      // Finalize deletion upon successful completion
      await consumeDeletionNonce(verifyInitial.payload.jti, verifyInitial.payload, 'consumed', client);

      // Verify DB row now has status 'consumed' and anonymized identifiers (NULL)
      const dbFinal = queryDb(
        `SELECT status, email, user_id FROM public.consumed_deletion_nonces WHERE jti = '${verifyInitial.payload.jti}';`
      );
      expect(dbFinal).toBe('consumed||');
    });

    it('handles unexpected or missing columns without claiming deletion succeeded', async () => {
      const client = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY);
      const fakePayload = {
        sub: 'a0000000-0000-4000-8000-000000000002',
        email: 'error-test@example.com',
        exp: Date.now() + 60000,
        jti: 'bad-nonce-test',
        purpose: 'account_deletion' as const,
      };

      // Create a client proxy that simulates missing column / table error
      const brokenClient = {
        from: () => ({
          upsert: async () => ({
            data: null,
            error: { message: 'column "nonexistent_col" does not exist' },
          }),
        }),
      } as any;

      // consumeDeletionNonce MUST throw error on failed durable ledger write
      await expect(
        consumeDeletionNonce('bad-nonce-test', fakePayload, 'consumed', brokenClient)
      ).rejects.toThrow('Durable nonce ledger write failed');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Push Subscription Role Isolation & Server-Only Access Gate
  // ---------------------------------------------------------------------------
  describe('Push Subscriptions Role Isolation & Server-Only Access Gate', () => {
    it('prohibits anon role from SELECT, INSERT, UPDATE, and DELETE on push_subscriptions', () => {
      const endpoint = 'https://test.push/guest-anon-test-' + Date.now();

      // Test SELECT as anon -> MUST fail with permission denied
      const anonSelect = queryDb('SET ROLE anon; SELECT * FROM public.push_subscriptions;');
      expect(anonSelect).toContain('permission denied');

      // Test INSERT as anon -> MUST fail with permission denied
      const anonInsert = queryDb(
        `SET ROLE anon; INSERT INTO public.push_subscriptions (endpoint, p256dh, auth) VALUES ('${endpoint}', 'k', 'a');`
      );
      expect(anonInsert).toContain('permission denied');

      // Test UPDATE as anon -> MUST fail with permission denied
      const anonUpdate = queryDb("SET ROLE anon; UPDATE public.push_subscriptions SET timezone = 'UTC';");
      expect(anonUpdate).toContain('permission denied');

      // Test DELETE as anon -> MUST fail with permission denied
      const anonDelete = queryDb('SET ROLE anon; DELETE FROM public.push_subscriptions;');
      expect(anonDelete).toContain('permission denied');
    });

    it('prohibits authenticated role from SELECT, INSERT, UPDATE, and DELETE on push_subscriptions directly', () => {
      const endpoint = 'https://test.push/guest-auth-test-' + Date.now();

      // Test SELECT as authenticated -> MUST fail with permission denied
      const authSelect = queryDb('SET ROLE authenticated; SELECT * FROM public.push_subscriptions;');
      expect(authSelect).toContain('permission denied');

      // Test INSERT as authenticated -> MUST fail with permission denied
      const authInsert = queryDb(
        `SET ROLE authenticated; INSERT INTO public.push_subscriptions (endpoint, p256dh, auth) VALUES ('${endpoint}', 'k', 'a');`
      );
      expect(authInsert).toContain('permission denied');

      // Test UPDATE as authenticated -> MUST fail with permission denied
      const authUpdate = queryDb("SET ROLE authenticated; UPDATE public.push_subscriptions SET timezone = 'UTC';");
      expect(authUpdate).toContain('permission denied');

      // Test DELETE as authenticated -> MUST fail with permission denied
      const authDelete = queryDb('SET ROLE authenticated; DELETE FROM public.push_subscriptions;');
      expect(authDelete).toContain('permission denied');
    });

    it('allows service_role to manage guest and authenticated subscriptions (full CRUD)', () => {
      const endpoint = 'https://test.push/service-test-' + Date.now();

      // INSERT
      const insertResult = queryDb(
        `SET ROLE service_role; INSERT INTO public.push_subscriptions (endpoint, user_id, p256dh, auth, timezone) VALUES ('${endpoint}', NULL, 'k', 'a', 'UTC'); SELECT count(*) FROM public.push_subscriptions WHERE endpoint = '${endpoint}';`
      );
      expect(insertResult).toContain('1');

      // SELECT
      const selectResult = queryDb(
        `SET ROLE service_role; SELECT timezone FROM public.push_subscriptions WHERE endpoint = '${endpoint}';`
      );
      expect(selectResult).toContain('UTC');

      // UPDATE
      const updateResult = queryDb(
        `SET ROLE service_role; UPDATE public.push_subscriptions SET timezone = 'America/New_York' WHERE endpoint = '${endpoint}'; SELECT timezone FROM public.push_subscriptions WHERE endpoint = '${endpoint}';`
      );
      expect(updateResult).toContain('America/New_York');

      // DELETE
      const deleteResult = queryDb(
        `SET ROLE service_role; DELETE FROM public.push_subscriptions WHERE endpoint = '${endpoint}'; SELECT count(*) FROM public.push_subscriptions WHERE endpoint = '${endpoint}';`
      );
      expect(deleteResult).toContain('0');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Notification Deliveries Role Isolation Gate
  // ---------------------------------------------------------------------------
  describe('Notification Deliveries Role Isolation Gate', () => {
    it('prohibits anon role from SELECT, INSERT, UPDATE, and DELETE on notification_deliveries', () => {
      const anonSelect = queryDb('SET ROLE anon; SELECT * FROM public.notification_deliveries;');
      expect(anonSelect).toContain('permission denied');

      const anonInsert = queryDb(
        "SET ROLE anon; INSERT INTO public.notification_deliveries (idempotency_key, subscription_endpoint, notification_type, status) VALUES ('k', 'e', 't', 'pending');"
      );
      expect(anonInsert).toContain('permission denied');

      const anonUpdate = queryDb("SET ROLE anon; UPDATE public.notification_deliveries SET status = 'sent';");
      expect(anonUpdate).toContain('permission denied');

      const anonDelete = queryDb('SET ROLE anon; DELETE FROM public.notification_deliveries;');
      expect(anonDelete).toContain('permission denied');
    });

    it('prohibits authenticated role from SELECT, INSERT, UPDATE, and DELETE on notification_deliveries directly', () => {
      const authSelect = queryDb('SET ROLE authenticated; SELECT * FROM public.notification_deliveries;');
      expect(authSelect).toContain('permission denied');

      const authInsert = queryDb(
        "SET ROLE authenticated; INSERT INTO public.notification_deliveries (idempotency_key, subscription_endpoint, notification_type, status) VALUES ('k', 'e', 't', 'pending');"
      );
      expect(authInsert).toContain('permission denied');

      const authUpdate = queryDb("SET ROLE authenticated; UPDATE public.notification_deliveries SET status = 'sent';");
      expect(authUpdate).toContain('permission denied');

      const authDelete = queryDb('SET ROLE authenticated; DELETE FROM public.notification_deliveries;');
      expect(authDelete).toContain('permission denied');
    });

    it('allows service_role full CRUD on notification_deliveries for backend operations', () => {
      const endpoint = 'https://test.push/notif-srv-test-' + Date.now();
      const notifKey = 'notif-key-srv-' + Date.now();

      // Create prerequisite subscription
      queryDb(
        `INSERT INTO public.push_subscriptions (endpoint, p256dh, auth) VALUES ('${endpoint}', 'k', 'a');`
      );

      // INSERT
      const insertOk = queryDb(
        `SET ROLE service_role; INSERT INTO public.notification_deliveries (idempotency_key, subscription_endpoint, notification_type, status) VALUES ('${notifKey}', '${endpoint}', 'workout_reminder', 'pending'); SELECT count(*) FROM public.notification_deliveries WHERE idempotency_key = '${notifKey}';`
      );
      expect(insertOk).toContain('1');

      // SELECT
      const selectOk = queryDb(
        `SET ROLE service_role; SELECT status FROM public.notification_deliveries WHERE idempotency_key = '${notifKey}';`
      );
      expect(selectOk).toContain('pending');

      // UPDATE
      const updateOk = queryDb(
        `SET ROLE service_role; UPDATE public.notification_deliveries SET status = 'sent' WHERE idempotency_key = '${notifKey}'; SELECT status FROM public.notification_deliveries WHERE idempotency_key = '${notifKey}';`
      );
      expect(updateOk).toContain('sent');

      // DELETE
      const deleteOk = queryDb(
        `SET ROLE service_role; DELETE FROM public.notification_deliveries WHERE idempotency_key = '${notifKey}'; SELECT count(*) FROM public.notification_deliveries WHERE idempotency_key = '${notifKey}';`
      );
      expect(deleteOk).toContain('0');

      // Clean up subscription
      queryDb(`DELETE FROM public.push_subscriptions WHERE endpoint = '${endpoint}';`);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. SECURITY DEFINER Functions Hardening & Privilege Gate
  // ---------------------------------------------------------------------------
  describe('SECURITY DEFINER Functions Security & Parameter Gate', () => {
    it('verifies all 3 functions have SET search_path = public, pg_temp', () => {
      const configs = queryDb(
        "SELECT proname, proconfig::text FROM pg_proc WHERE proname IN ('ascend_check_rate_limit', 'claim_notification_delivery', 'cleanup_expired_deletion_nonces') ORDER BY proname;"
      ).split('\n');

      expect(configs.length).toBe(3);
      for (const line of configs) {
        expect(line).toContain('search_path=public, pg_temp');
      }
    });

    it('denies EXECUTE to anon and authenticated on all 3 SECURITY DEFINER functions', () => {
      const functions = [
        "public.ascend_check_rate_limit('k', 60000, 10)",
        "public.claim_notification_delivery('k', 'e', NULL, 't')",
        'public.cleanup_expired_deletion_nonces()',
      ];

      for (const fn of functions) {
        const anonExec = queryDb(`SET ROLE anon; SELECT ${fn};`);
        expect(anonExec).toContain('permission denied');

        const authExec = queryDb(`SET ROLE authenticated; SELECT ${fn};`);
        expect(authExec).toContain('permission denied');
      }
    });

    it('allows EXECUTE to service_role with strict parameter validation on all functions', () => {
      // 1. Rate limit valid call
      const rateLimitOk = queryDb(
        "SET ROLE service_role; SELECT allowed FROM public.ascend_check_rate_limit('test-srv-key', 60000, 10);"
      );
      expect(rateLimitOk).toContain('t');

      // 2. Rate limit invalid call (empty key)
      const rateLimitErr = queryDb(
        "SET ROLE service_role; SELECT * FROM public.ascend_check_rate_limit('', 60000, 10);"
      );
      expect(rateLimitErr).toContain('Invalid rate limit key');

      // Rate limit invalid window (< 100ms)
      const rateLimitWindowErr = queryDb(
        "SET ROLE service_role; SELECT * FROM public.ascend_check_rate_limit('test-key', 50, 10);"
      );
      expect(rateLimitWindowErr).toContain('Invalid window_ms');

      // Rate limit invalid max_requests (< 1)
      const rateLimitReqErr = queryDb(
        "SET ROLE service_role; SELECT * FROM public.ascend_check_rate_limit('test-key', 60000, 0);"
      );
      expect(rateLimitReqErr).toContain('Invalid max_requests');

      // 3. Claim delivery invalid call (empty idempotency key)
      const claimErr = queryDb(
        "SET ROLE service_role; SELECT * FROM public.claim_notification_delivery('', 'endpoint', NULL, 'type');"
      );
      expect(claimErr).toContain('Invalid idempotency_key');

      // Claim delivery invalid endpoint (empty)
      const claimEndpointErr = queryDb(
        "SET ROLE service_role; SELECT * FROM public.claim_notification_delivery('valid-key', '', NULL, 'type');"
      );
      expect(claimEndpointErr).toContain('Invalid subscription_endpoint');

      // 4. Cleanup expired nonces call
      const cleanupOk = queryDb(
        'SET ROLE service_role; SELECT public.cleanup_expired_deletion_nonces();'
      );
      expect(cleanupOk).not.toContain('ERROR');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. User Feedback Table Hardening & Ingestion Isolation
  // ---------------------------------------------------------------------------
  describe('User Feedback Table Hardening & Ingestion Gate', () => {
    it('denies direct SELECT, INSERT, UPDATE, and DELETE on user_feedback to anon and authenticated roles', () => {
      const anonInsert = queryDb(
        "SET ROLE anon; INSERT INTO public.user_feedback (category, message) VALUES ('general', 'untrusted anon payload');"
      );
      expect(anonInsert).toContain('permission denied');

      const authInsert = queryDb(
        "SET ROLE authenticated; INSERT INTO public.user_feedback (category, message) VALUES ('general', 'untrusted auth payload');"
      );
      expect(authInsert).toContain('permission denied');

      const anonSelect = queryDb('SET ROLE anon; SELECT * FROM public.user_feedback;');
      expect(anonSelect).toContain('permission denied');

      const authSelect = queryDb('SET ROLE authenticated; SELECT * FROM public.user_feedback;');
      expect(authSelect).toContain('permission denied');
    });

    it('permits service_role to insert, select, and update feedback, but denies DELETE and TRUNCATE', () => {
      // 1. Insert feedback
      const insertOk = queryDb(
        "SET ROLE service_role; INSERT INTO public.user_feedback (category, message, user_name) VALUES ('general', 'verified API feedback', 'Athlete-1') RETURNING id;"
      );
      expect(insertOk).not.toContain('ERROR');
      const idMatch = insertOk.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
      expect(idMatch).toBeTruthy();
      const feedbackId = idMatch![0];

      // 2. Update delivery state (used by /api/feedback after sending email via Resend)
      const updateOk = queryDb(
        `SET ROLE service_role; UPDATE public.user_feedback SET email_delivered = true, email_id = 'resend-123' WHERE id = '${feedbackId}' RETURNING email_delivered;`
      );
      expect(updateOk).toContain('t');

      // 3. Deny DELETE to service_role (feedback must be immutable from the application layer)
      const deleteErr = queryDb(
        `SET ROLE service_role; DELETE FROM public.user_feedback WHERE id = '${feedbackId}';`
      );
      expect(deleteErr).toContain('permission denied');

      // 4. Deny TRUNCATE to service_role
      const truncateErr = queryDb(
        'SET ROLE service_role; TRUNCATE TABLE public.user_feedback;'
      );
      expect(truncateErr).toContain('permission denied');

      // Clean up feedback row using table owner
      queryDb(`DELETE FROM public.user_feedback WHERE id = '${feedbackId}';`);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Zero Residual Privileges Verification
  // ---------------------------------------------------------------------------
  describe('Zero Residual Privileges & Least-Privilege Verification', () => {
    const reviewedTables = [
      'push_subscriptions',
      'notification_deliveries',
      'user_feedback',
      'api_rate_limits',
      'consumed_deletion_nonces',
    ];

    it('verifies neither anon nor authenticated has ANY table privileges on reviewed tables', () => {
      for (const table of reviewedTables) {
        const privs = queryDb(
          `SELECT privilege_type FROM information_schema.table_privileges WHERE table_schema = 'public' AND table_name = '${table}' AND grantee IN ('anon', 'authenticated', 'PUBLIC');`
        );
        expect(privs).toBe('');
      }
    });

    it('verifies service_role has NO TRUNCATE, REFERENCES, or TRIGGER on reviewed tables', () => {
      for (const table of reviewedTables) {
        const adminPrivs = queryDb(
          `SELECT privilege_type FROM information_schema.table_privileges WHERE table_schema = 'public' AND table_name = '${table}' AND grantee = 'service_role' AND privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER');`
        );
        expect(adminPrivs).toBe('');
      }
    });

    it('verifies exact service_role privileges match required matrix', () => {
      const getPrivs = (table: string) =>
        queryDb(
          `SELECT privilege_type FROM information_schema.table_privileges WHERE table_schema = 'public' AND table_name = '${table}' AND grantee = 'service_role' ORDER BY privilege_type;`
        ).split('\n');

      expect(getPrivs('push_subscriptions')).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
      expect(getPrivs('notification_deliveries')).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
      expect(getPrivs('user_feedback')).toEqual(['INSERT', 'SELECT', 'UPDATE']);
      expect(getPrivs('api_rate_limits')).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
      expect(getPrivs('consumed_deletion_nonces')).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Real API Route Integration Verification
  // ---------------------------------------------------------------------------
  describe('Real API Route Integration Verification', () => {
    it('successfully processes user feedback submission through /api/feedback and persists to database', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = LOCAL_SUPABASE_URL;
      process.env.SUPABASE_SERVICE_ROLE_KEY = LOCAL_SERVICE_KEY;

      const { POST: feedbackPost } = await import('../src/app/api/feedback/route');
      const testMsg = 'E2E verified feedback submission ' + Date.now();

      const req = new Request('http://localhost:3000/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'feature',
          rating: 5,
          title: 'Great App',
          message: testMsg,
          userName: 'Tester',
          userEmail: 'tester@example.com',
        }),
      });

      const res = await feedbackPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      // Verify row exists in PostgreSQL
      const dbCheck = queryDb(
        `SELECT category, status FROM public.user_feedback WHERE message = '${testMsg}';`
      );
      expect(dbCheck).toBe('feature|new');

      // Clean up
      queryDb(`DELETE FROM public.user_feedback WHERE message = '${testMsg}';`);
    });

    it('successfully handles guest push subscription registration, update, and removal via /api/notifications/subscribe', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = LOCAL_SUPABASE_URL;
      process.env.SUPABASE_SERVICE_ROLE_KEY = LOCAL_SERVICE_KEY;

      const { POST: subPost, DELETE: subDelete } = await import(
        '../src/app/api/notifications/subscribe/route'
      );
      const testEndpoint = 'https://fcm.googleapis.com/fcm/send/guest-e2e-' + Date.now();

      // 1. Guest Registration (POST)
      const regReq = new Request('http://localhost:3000/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: {
            endpoint: testEndpoint,
            keys: { p256dh: 'test-p256', auth: 'test-auth' },
          },
          userAgent: 'JestTestRunner/1.0',
          timezone: 'America/New_York',
        }),
      });

      const regRes = await subPost(regReq);
      expect(regRes.status).toBe(200);
      const regData = await regRes.json();
      expect(regData.success).toBe(true);
      expect(regData.endpoint).toBe(testEndpoint);

      // Verify row in database: user_id must be NULL for guest
      const guestRow = queryDb(
        `SELECT endpoint, user_id, timezone FROM public.push_subscriptions WHERE endpoint = '${testEndpoint}';`
      );
      expect(guestRow).toBe(`${testEndpoint}||America/New_York`);

      // 2. Endpoint Rotation / Update (POST with changed timezone)
      const updateReq = new Request('http://localhost:3000/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: {
            endpoint: testEndpoint,
            keys: { p256dh: 'test-p256', auth: 'test-auth' },
          },
          userAgent: 'JestTestRunner/1.0',
          timezone: 'Europe/London',
        }),
      });

      const updateRes = await subPost(updateReq);
      expect(updateRes.status).toBe(200);

      const updatedRow = queryDb(
        `SELECT timezone FROM public.push_subscriptions WHERE endpoint = '${testEndpoint}';`
      );
      expect(updatedRow).toBe('Europe/London');

      // 3. Unsubscription (DELETE) — requires the delete token issued at registration
      const delReq = new Request('http://localhost:3000/api/notifications/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: testEndpoint, deleteToken: regData.deleteToken }),
      });

      const delRes = await subDelete(delReq);
      expect(delRes.status).toBe(200);
      const delData = await delRes.json();
      expect(delData.success).toBe(true);

      // Verify row is deleted
      const checkDel = queryDb(
        `SELECT count(*) FROM public.push_subscriptions WHERE endpoint = '${testEndpoint}';`
      );
      expect(checkDel).toBe('0');
    });

    it('successfully handles authenticated push subscription registration via /api/notifications/subscribe', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = LOCAL_SUPABASE_URL;
      process.env.SUPABASE_SERVICE_ROLE_KEY = LOCAL_SERVICE_KEY;

      const adminClient = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY);
      const testEmail = `athlete-e2e-${Date.now()}@example.com`;
      const testPassword = 'Password123!';

      // Create test athlete in Supabase Auth
      const { data: userData, error: createErr } = await adminClient.auth.admin.createUser({
        email: testEmail,
        password: testPassword,
        email_confirm: true,
      });
      expect(createErr).toBeNull();
      const testUserId = userData.user!.id;

      // Sign in as athlete to get real JWT access token
      const anonClient = createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY);
      const { data: sessionData, error: signinErr } = await anonClient.auth.signInWithPassword({
        email: testEmail,
        password: testPassword,
      });
      expect(signinErr).toBeNull();
      const accessToken = sessionData.session!.access_token;

      // Register subscription as authenticated user
      const { POST: subPost, DELETE: subDelete } = await import(
        '../src/app/api/notifications/subscribe/route'
      );
      const testEndpoint = 'https://fcm.googleapis.com/fcm/send/auth-e2e-' + Date.now();

      const req = new Request('http://localhost:3000/api/notifications/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          subscription: {
            endpoint: testEndpoint,
            keys: { p256dh: 'auth-p256', auth: 'auth-auth' },
          },
          timezone: 'UTC',
        }),
      });

      const res = await subPost(req);
      expect(res.status).toBe(200);

      // Verify row in database: user_id MUST equal testUserId
      const authRow = queryDb(
        `SELECT endpoint, user_id FROM public.push_subscriptions WHERE endpoint = '${testEndpoint}';`
      );
      expect(authRow).toBe(`${testEndpoint}|${testUserId}`);

      // Unsubscribe — owner-authenticated DELETE
      const delReq = new Request('http://localhost:3000/api/notifications/subscribe', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ endpoint: testEndpoint }),
      });
      await subDelete(delReq);

      // Clean up test user
      await adminClient.auth.admin.deleteUser(testUserId);
    });
  });
});

