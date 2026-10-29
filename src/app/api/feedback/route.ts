import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rate-limit';
import { rateLimitResponse, redactSecrets, readTextBodyWithLimit, RequestBodyTooLargeError } from '@/lib/server-security';
import { sanitizeFeedbackSubmission } from '@/lib/feedback-sanitize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface FeedbackRequestBody {
  category?: 'bug' | 'feature' | 'review' | 'general';
  rating?: number;
  title?: string;
  message?: string;
  userEmail?: string;
  userName?: string;
  diagnostics?: {
    os?: string;
    browser?: string;
    screen?: string;
    deviceType?: string;
    appVersion?: string;
    url?: string;
    timestamp?: string;
  };
}

// NOTE (2026-10-26 security review, P2-2 deliberate exception): unlike
// delete-account and subscribe, this route KEEPS the anon fallback on
// purpose. Feedback is a best-effort channel whose primary delivery is
// the Resend email below; the DB insert is secondary (and the schema
// grants INSERT on user_feedback to service_role only, so under anon
// the insert fails soft — logged, email still sent — rather than
// corrupting anything). Failing closed with 503 here would drop user
// feedback entirely on a misconfigured deploy, which is worse than
// email-only delivery. Do not "fix" this fallback without changing
// the delivery contract first.
function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * QA4-033 (remainder): hard cap on the feedback request body. Fields
 * are individually truncated after parsing, but the parse itself was
 * unbounded — an oversized body would be fully buffered and
 * JSON-parsed first. 32 KB is far above any legitimate payload
 * (title ≤200 chars, message ≤3000 chars, plus small diagnostics).
 */
const MAX_FEEDBACK_BODY_BYTES = 32 * 1024;

export async function POST(req: Request) {
  // 0. Body-size cap (before rate limiting and parsing)
  const tooLarge = () =>
    NextResponse.json(
      { success: false, error: 'PAYLOAD_TOO_LARGE', message: 'Feedback payload is too large.' },
      { status: 413 }
    );
  const declaredLength = Number(req.headers.get('content-length') || 0);
  if (declaredLength > MAX_FEEDBACK_BODY_BYTES) {
    return tooLarge();
  }
  // Gauntlet SEC-11: stream with the cap instead of req.text() +
  // measure-after-read, so chunked oversized bodies abort early.
  let rawBody: string;
  try {
    rawBody = await readTextBodyWithLimit(req, MAX_FEEDBACK_BODY_BYTES);
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) return tooLarge();
    rawBody = '';
  }

  // 1. Rate limiting: 10 feedback requests per 10 minutes per IP
  const rateLimit = await checkRateLimit(req, {
    windowMs: 10 * 60 * 1000,
    maxRequests: 10,
    keyPrefix: 'user-feedback',
  });

  if (!rateLimit.success) {
    return rateLimitResponse(rateLimit.resetMs);
  }

  try {
    const body: FeedbackRequestBody = JSON.parse(rawBody);

    // Gauntlet R5 / SEC-13: resolve an OPTIONAL verified session.
    // A valid Bearer token anchors identity (email forced from the
    // session); an absent or invalid token means guest — feedback
    // stays available to guests, only identity handling changes
    // (guest rows are anonymous, diagnostics allowlist-filtered).
    // This deliberately does NOT 401 guests: the route's delivery
    // contract is best-effort feedback, and the sanitizer below is
    // what closes the PII/diagnostics hole.
    const supabase = getSupabaseServerClient();
    let sessionUser: { email?: string | null; name?: string | null } | null = null;
    const authHeader = req.headers.get('authorization');
    if (supabase && authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      const token = authHeader.substring(7).trim();
      if (token) {
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser(token);
          if (user) {
            const meta = (user.user_metadata || {}) as Record<string, unknown>;
            sessionUser = {
              email: user.email ?? null,
              name:
                (typeof meta.full_name === 'string' ? meta.full_name : null) ||
                (typeof meta.name === 'string' ? meta.name : null),
            };
          }
        } catch {
          sessionUser = null;
        }
      }
    }

    const sanitized = sanitizeFeedbackSubmission(body, sessionUser);
    if (!sanitized) {
      return NextResponse.json(
        { error: 'INVALID_MESSAGE', message: 'Please provide feedback or bug details (minimum 3 characters).' },
        { status: 400 }
      );
    }
    const { category, message, title, userEmail, userName, rating } = sanitized;
    const diag = sanitized.diagnostics;

    // 2. Step 1: Durable Database Persistence in Supabase (if configured)
    let dbRecordId: string | null = null;

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('user_feedback')
          .insert({
            category,
            rating: rating || null,
            title: title || null,
            message,
            user_name: userName || null,
            user_email: userEmail || null,
            diagnostics: diag,
            status: 'new',
            email_delivered: false,
          })
          .select('id')
          .single();

        if (!error && data?.id) {
          dbRecordId = data.id;
        } else if (error) {
          console.warn('Database feedback insert notice:', redactSecrets(error.message));
        }
      } catch (dbErr: any) {
        console.warn('Database feedback insert error:', redactSecrets(dbErr?.message || ''));
      }
    }

    // 3. Step 2: Email Forwarding via Resend (only if explicitly configured)
    const resendApiKey = process.env.RESEND_API_KEY?.trim();
    const recipientEmail = process.env.FEEDBACK_RECIPIENT_EMAIL?.trim();

    let emailSent = false;
    let emailId = null;

    if (resendApiKey && recipientEmail) {
      const categoryBadge = {
        bug: 'BUG REPORT',
        feature: 'FEATURE REQUEST',
        review: 'USER REVIEW',
        general: 'FEEDBACK',
      }[category];

      const starsDisplay = rating ? '⭐'.repeat(rating) : 'No rating given';
      const emailSubject = `[ASCEND] ${categoryBadge} ${rating ? `(${rating}/5)` : ''}: ${title || message.slice(0, 50)}`;

      const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0a0a0a; color: #f5f5f5; margin: 0; padding: 24px; }
    .card { background-color: #141414; border: 1px solid #262626; border-radius: 12px; padding: 24px; max-width: 600px; margin: 0 auto; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: bold; font-family: monospace; letter-spacing: 0.5px; background-color: #e5c07b22; color: #e5c07b; border: 1px solid #e5c07b44; }
    .title { font-size: 18px; font-weight: bold; margin-top: 14px; margin-bottom: 6px; color: #ffffff; }
    .meta { font-size: 12px; color: #888888; margin-bottom: 16px; }
    .content { background-color: #1a1a1a; border-left: 3px solid #e5c07b; padding: 14px; border-radius: 6px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; color: #e0e0e0; }
    .diag-table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 11px; font-family: monospace; color: #aaaaaa; }
    .diag-table td { padding: 6px 8px; border-bottom: 1px solid #222222; }
    .diag-table td.label { font-weight: bold; color: #777777; width: 35%; }
    .footer { margin-top: 24px; text-align: center; font-size: 11px; color: #555555; }
  </style>
</head>
<body>
  <div class="card">
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <span class="badge">${categoryBadge}</span>
      <span style="font-size: 14px; color: #e5c07b;">${starsDisplay}</span>
    </div>

    ${title ? `<div class="title">${escapeHtml(title)}</div>` : ''}

    <div class="meta">
      From: <strong>${escapeHtml(userName || 'Anonymous Athlete')}</strong>
      ${userEmail ? `&bull; Email: <a href="mailto:${escapeHtml(userEmail)}" style="color: #e5c07b;">${escapeHtml(userEmail)}</a>` : ''}
      ${dbRecordId ? `&bull; Record ID: <code>${escapeHtml(dbRecordId)}</code>` : ''}
    </div>

    <div class="content">${escapeHtml(message)}</div>

    <div style="margin-top: 20px;">
      <span style="font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #666666; font-weight: bold;">System Diagnostics</span>
      <table class="diag-table">
        <tr><td class="label">OS / Platform</td><td>${escapeHtml(diag.os || 'Unknown')}</td></tr>
        <tr><td class="label">Browser</td><td>${escapeHtml(diag.browser || 'Unknown')}</td></tr>
        <tr><td class="label">Screen</td><td>${escapeHtml(diag.screen || 'Unknown')}</td></tr>
        <tr><td class="label">Device Type</td><td>${escapeHtml(diag.deviceType || 'Unknown')}</td></tr>
        <tr><td class="label">App Version</td><td>${escapeHtml(diag.appVersion || 'v2.0.0')}</td></tr>
        <tr><td class="label">Page URL</td><td>${escapeHtml(diag.url || '/')}</td></tr>
        <tr><td class="label">Timestamp</td><td>${new Date().toISOString()}</td></tr>
      </table>
    </div>

    <div class="footer">
      ASCEND Athlete Operating System &bull; Live Telemetry Feedback
    </div>
  </div>
</body>
</html>
      `.trim();

      try {
        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'ASCEND Feedback <onboarding@resend.dev>',
            to: [recipientEmail],
            reply_to: userEmail && userEmail.includes('@') ? userEmail : undefined,
            subject: emailSubject,
            html: htmlBody,
          }),
        });

        if (resendRes.ok) {
          const resData = await resendRes.json();
          emailSent = true;
          emailId = resData.id;

          // If db record was created, update email delivery state
          if (supabase && dbRecordId) {
            try {
              await supabase
                .from('user_feedback')
                .update({ email_delivered: true, email_id: emailId })
                .eq('id', dbRecordId);
            } catch {
              // Non-blocking update failure
            }
          }
        } else {
          const errData = await resendRes.json().catch(() => ({}));
          console.warn('Resend feedback delivery notice:', redactSecrets(JSON.stringify(errData)));
        }
      } catch (err: any) {
        console.warn('Resend email fetch error:', redactSecrets(err?.message || ''));
      }
    }

    // 4. Verification Guard: Prevent Silent Feedback Loss
    // If neither database persistence was accomplished nor email was sent, report failure honestly
    if (!dbRecordId && !emailSent) {
      return NextResponse.json(
        {
          error: 'PERSISTENCE_UNAVAILABLE',
          message:
            'Feedback submission service is currently offline or unconfigured. Please try again later or configure database storage.',
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Thank you for helping improve ASCEND! Your feedback has been safely submitted.',
      persisted: Boolean(dbRecordId),
      emailDelivered: emailSent,
      referenceId: dbRecordId || emailId || `fb_${Date.now()}`,
    });
  } catch (error: any) {
    console.error('Feedback API error:', redactSecrets(error?.message || ''));
    return NextResponse.json(
      {
        error: 'FEEDBACK_FAILED',
        message: 'Could not submit feedback at this moment. Please try again later.',
      },
      { status: 500 }
    );
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
