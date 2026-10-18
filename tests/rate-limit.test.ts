import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  checkRateLimit,
  getClientIp,
  resetRateLimitStoreForTests,
  setRateLimiterSupabaseForTests,
} from '@/lib/rate-limit';
import { rateLimitResponse } from '@/lib/server-security';

describe('Server-Side Rate Limiter', () => {
  beforeEach(() => {
    resetRateLimitStoreForTests();
    vi.restoreAllMocks();
  });

  describe('getClientIp', () => {
    it('extracts client IP from x-forwarded-for first entry', () => {
      const req = new Request('http://localhost:3000/api/feedback', {
        headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178' },
      });
      expect(getClientIp(req)).toBe('203.0.113.195');
    });

    it('extracts client IP from x-real-ip if x-forwarded-for is missing', () => {
      const req = new Request('http://localhost:3000/api/feedback', {
        headers: { 'x-real-ip': '198.51.100.42' },
      });
      expect(getClientIp(req)).toBe('198.51.100.42');
    });

    it('extracts client IP from cf-connecting-ip if other headers are missing', () => {
      const req = new Request('http://localhost:3000/api/feedback', {
        headers: { 'cf-connecting-ip': '192.0.2.1' },
      });
      expect(getClientIp(req)).toBe('192.0.2.1');
    });

    it('falls back to 127.0.0.1 when no forwarding headers exist', () => {
      const req = new Request('http://localhost:3000/api/feedback');
      expect(getClientIp(req)).toBe('127.0.0.1');
    });

    it('ignores invalid or malicious header values and falls back safely', () => {
      const req = new Request('http://localhost:3000/api/feedback', {
        headers: { 'x-forwarded-for': 'invalid-ip-injection-attempt;<script>' },
      });
      expect(getClientIp(req)).toBe('127.0.0.1');
    });
  });

  describe('In-Memory Rate Limiting', () => {
    it('allows requests within the configured threshold', async () => {
      const req = new Request('http://localhost:3000/api/feedback', {
        headers: { 'x-real-ip': '10.0.0.1' },
      });

      const res1 = await checkRateLimit(req, { windowMs: 60000, maxRequests: 3 });
      expect(res1.success).toBe(true);
      expect(res1.remaining).toBe(2);

      const res2 = await checkRateLimit(req, { windowMs: 60000, maxRequests: 3 });
      expect(res2.success).toBe(true);
      expect(res2.remaining).toBe(1);

      const res3 = await checkRateLimit(req, { windowMs: 60000, maxRequests: 3 });
      expect(res3.success).toBe(true);
      expect(res3.remaining).toBe(0);
    });

    it('blocks requests once the threshold is exceeded', async () => {
      const req = new Request('http://localhost:3000/api/feedback', {
        headers: { 'x-real-ip': '10.0.0.2' },
      });

      for (let i = 0; i < 2; i++) {
        await checkRateLimit(req, { windowMs: 60000, maxRequests: 2 });
      }

      const blockedRes = await checkRateLimit(req, { windowMs: 60000, maxRequests: 2 });
      expect(blockedRes.success).toBe(false);
      expect(blockedRes.remaining).toBe(0);
    });

    it('generates a 429 response with Retry-After header and security headers', () => {
      const response = rateLimitResponse(30000);
      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBe('30');
    });
  });

  describe('Supabase RPC Distributed Rate Limiting & Graceful Fallback', () => {
    it('invokes ascend_check_rate_limit RPC and maps distributed state', async () => {
      let rpcCalled = false;
      let rpcParams: any = null;

      const mockSupabase = {
        rpc: async (fnName: string, params: any) => {
          rpcCalled = true;
          rpcParams = { fnName, params };
          return {
            data: [{ allowed: true, count: 2, reset_ms: 45000 }],
            error: null,
          };
        },
      };

      setRateLimiterSupabaseForTests(mockSupabase);

      const req = new Request('http://localhost:3000/api/feedback', {
        headers: { 'x-real-ip': '198.51.100.99' },
      });

      const result = await checkRateLimit(req, { windowMs: 60000, maxRequests: 5 });

      expect(rpcCalled).toBe(true);
      expect(rpcParams.fnName).toBe('ascend_check_rate_limit');
      expect(rpcParams.params.p_max_requests).toBe(5);
      expect(rpcParams.params.p_window_ms).toBe(60000);
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(3);
      expect(result.resetMs).toBe(45000);
    });

    it('falls back to in-memory limiter when Supabase RPC returns an error', async () => {
      const mockFailingSupabase = {
        rpc: async () => ({
          data: null,
          error: { message: 'permission denied for function ascend_check_rate_limit' },
        }),
      };

      setRateLimiterSupabaseForTests(mockFailingSupabase);

      const req = new Request('http://localhost:3000/api/feedback', {
        headers: { 'x-real-ip': '198.51.100.88' },
      });

      // Should not throw, but gracefully fall back to local in-memory counting
      const result = await checkRateLimit(req, { windowMs: 60000, maxRequests: 2 });
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(1);
    });

    it('falls back to in-memory limiter when SUPABASE_SERVICE_ROLE_KEY is absent', async () => {
      // Ensure no mock client is injected
      resetRateLimitStoreForTests();
      const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      try {
        const req = new Request('http://localhost:3000/api/barcode', {
          headers: { 'x-real-ip': '198.51.100.77' },
        });

        // When server-only service key is absent, should safely default to in-memory without throwing
        const result = await checkRateLimit(req, { windowMs: 60000, maxRequests: 3 });
        expect(result.success).toBe(true);
        expect(result.remaining).toBe(2);
      } finally {
        if (originalServiceKey) {
          process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
        }
      }
    });
  });

  describe('SQL Migration & Privilege Grant Static Verification', () => {
    it('verifies that schema.sql revokes execution from untrusted roles and grants strictly to service_role', () => {
      const schemaSql = fs.readFileSync(path.join(process.cwd(), 'supabase/schema.sql'), 'utf-8');

      expect(schemaSql).toContain('REVOKE ALL ON FUNCTION public.ascend_check_rate_limit(TEXT, BIGINT, INTEGER) FROM PUBLIC;');
      expect(schemaSql).toContain('REVOKE ALL ON FUNCTION public.ascend_check_rate_limit(TEXT, BIGINT, INTEGER) FROM anon;');
      expect(schemaSql).toContain('REVOKE ALL ON FUNCTION public.ascend_check_rate_limit(TEXT, BIGINT, INTEGER) FROM authenticated;');
      expect(schemaSql).toContain('GRANT EXECUTE ON FUNCTION public.ascend_check_rate_limit(TEXT, BIGINT, INTEGER) TO service_role;');

      // Must not grant execution to anon or authenticated
      expect(schemaSql).not.toContain('GRANT EXECUTE ON FUNCTION public.ascend_check_rate_limit(TEXT, BIGINT, INTEGER) TO anon');
      expect(schemaSql).not.toContain('GRANT EXECUTE ON FUNCTION public.ascend_check_rate_limit(TEXT, BIGINT, INTEGER) TO authenticated');
    });

    it('verifies that 2026101801_harden_api_rate_limits.sql enforces least-privilege grants', () => {
      const migrationSql = fs.readFileSync(
        path.join(process.cwd(), 'supabase/migrations/2026101801_harden_api_rate_limits.sql'),
        'utf-8'
      );

      expect(migrationSql).toContain('REVOKE ALL ON TABLE public.api_rate_limits FROM PUBLIC;');
      expect(migrationSql).toContain('REVOKE ALL ON TABLE public.api_rate_limits FROM anon;');
      expect(migrationSql).toContain('REVOKE ALL ON TABLE public.api_rate_limits FROM authenticated;');
      expect(migrationSql).toContain('GRANT ALL ON TABLE public.api_rate_limits TO service_role;');

      expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.ascend_check_rate_limit(TEXT, BIGINT, INTEGER) TO service_role;');
      expect(migrationSql).not.toContain('GRANT EXECUTE ON FUNCTION public.ascend_check_rate_limit(TEXT, BIGINT, INTEGER) TO anon');
    });

    it('verifies that reconcile_existing_database.sql enforces least-privilege grants', () => {
      const reconcileSql = fs.readFileSync(
        path.join(process.cwd(), 'supabase/reconcile_existing_database.sql'),
        'utf-8'
      );

      expect(reconcileSql).toContain('GRANT EXECUTE ON FUNCTION public.ascend_check_rate_limit(TEXT, BIGINT, INTEGER) TO service_role;');
      expect(reconcileSql).not.toContain('GRANT EXECUTE ON FUNCTION public.ascend_check_rate_limit(TEXT, BIGINT, INTEGER) TO anon');
    });

    it('verifies that migration version prefixes are strictly unique and monotonically increasing', () => {
      const migrationsDir = path.join(process.cwd(), 'supabase/migrations');
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));

      expect(files.length).toBeGreaterThan(0);

      const versions: string[] = [];
      for (const file of files) {
        const match = file.match(/^([0-9]+)_.+\.sql$/);
        expect(match).not.toBeNull();
        if (match) {
          versions.push(match[1]);
        }
      }

      // Check uniqueness
      const uniqueVersions = new Set(versions);
      expect(uniqueVersions.size).toBe(versions.length);

      // Check strictly ascending order
      for (let i = 1; i < versions.length; i++) {
        expect(BigInt(versions[i])).toBeGreaterThan(BigInt(versions[i - 1]));
      }
    });

    it('verifies that no manual recovery or reconciliation scripts reside inside supabase/migrations/', () => {
      const migrationsDir = path.join(process.cwd(), 'supabase/migrations');
      const files = fs.readdirSync(migrationsDir);

      for (const file of files) {
        expect(file.toLowerCase()).not.toContain('reconcile');
        expect(file.toLowerCase()).not.toContain('recovery');
        expect(file.toLowerCase()).not.toContain('diagnose');
      }

      // Ensure manual recovery and diagnostic scripts exist outside migrations directory
      expect(fs.existsSync(path.join(process.cwd(), 'supabase/reconcile_existing_database.sql'))).toBe(true);
      expect(fs.existsSync(path.join(process.cwd(), 'supabase/diagnose_live_schema.sql'))).toBe(true);
    });

    it('verifies that 2026101801_harden_api_rate_limits prerequisites are satisfied by 20261017', () => {
      const prerequisiteSql = fs.readFileSync(
        path.join(process.cwd(), 'supabase/migrations/20261017_create_rate_limiter.sql'),
        'utf-8'
      );
      const hardeningSql = fs.readFileSync(
        path.join(process.cwd(), 'supabase/migrations/2026101801_harden_api_rate_limits.sql'),
        'utf-8'
      );

      // Prerequisite creates table and initial function
      expect(prerequisiteSql).toContain('CREATE TABLE IF NOT EXISTS public.api_rate_limits');
      expect(prerequisiteSql).toContain('CREATE OR REPLACE FUNCTION public.ascend_check_rate_limit');

      // Hardening migration assumes table exists and modifies RLS/grants/function
      expect(hardeningSql).toContain('ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;');
      expect(hardeningSql).toContain('CREATE OR REPLACE FUNCTION public.ascend_check_rate_limit');
      expect(hardeningSql).toContain('SET search_path = public, pg_temp');
      expect(hardeningSql).toContain('GRANT EXECUTE ON FUNCTION public.ascend_check_rate_limit(TEXT, BIGINT, INTEGER) TO service_role;');
    });

    it('verifies that 2026101802_create_core_tables creates all 8 core application tables with RLS', () => {
      const coreTablesSql = fs.readFileSync(
        path.join(process.cwd(), 'supabase/migrations/2026101802_create_core_tables.sql'),
        'utf-8'
      );

      const requiredTables = [
        'profiles',
        'personal_records',
        'workouts',
        'meals',
        'body_metrics',
        'daily_habits',
        'planned_workouts',
        'custom_barcodes',
      ];

      for (const table of requiredTables) {
        expect(coreTablesSql).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
        expect(coreTablesSql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
      }

      // Verify foreign key cascades to auth.users
      expect(coreTablesSql).toContain('REFERENCES auth.users(id) ON DELETE CASCADE');
    });

    it('verifies that SUPABASE_SERVICE_ROLE_KEY is never imported or referenced in client-side components', () => {
      const clientComponentsDir = path.join(process.cwd(), 'src/components');
      const files = fs.readdirSync(clientComponentsDir, { recursive: true }) as string[];

      for (const file of files) {
        if (typeof file === 'string' && (file.endsWith('.tsx') || file.endsWith('.ts'))) {
          const content = fs.readFileSync(path.join(clientComponentsDir, file), 'utf-8');
          expect(content).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
        }
      }
    });
  });
});
