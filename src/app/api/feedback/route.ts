import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { rateLimitResponse, redactSecrets } from '@/lib/server-security';

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

export async function POST(req: Request) {
  // 1. Rate limiting: 10 feedback requests per 10 minutes per IP
  const rateLimit = checkRateLimit(req, {
    windowMs: 10 * 60 * 1000,
    maxRequests: 10,
    keyPrefix: 'user-feedback',
  });

  if (!rateLimit.success) {
    return rateLimitResponse(rateLimit.resetMs);
  }

  try {
    const body: FeedbackRequestBody = await req.json();

    const category = body.category && ['bug', 'feature', 'review', 'general'].includes(body.category)
      ? body.category
      : 'general';

    const message = (body.message || '').trim().slice(0, 3000);
    if (!message) {
      return NextResponse.json(
        { error: 'MISSING_MESSAGE', message: 'Please provide feedback or bug details.' },
        { status: 400 }
      );
    }

    const title = (body.title || '').trim().slice(0, 200);
    const userEmail = (body.userEmail || '').trim().slice(0, 150);
    const userName = (body.userName || '').trim().slice(0, 100);
    const rating = typeof body.rating === 'number' && body.rating >= 1 && body.rating <= 5
      ? Math.round(body.rating)
      : undefined;

    const diag = body.diagnostics || {};

    const resendApiKey = process.env.RESEND_API_KEY?.trim();
    const recipientEmail = process.env.FEEDBACK_RECIPIENT_EMAIL?.trim() || '1shivamkrsingh3@gmail.com';

    // Format badge and rating text
    const categoryBadge = {
      bug: '🐛 BUG REPORT',
      feature: '💡 FEATURE REQUEST',
      review: '⭐ USER REVIEW',
      general: '💬 FEEDBACK',
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

    // Send email via Resend
    let emailSent = false;
    let emailId = null;

    if (resendApiKey) {
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
        } else {
          const errData = await resendRes.json().catch(() => ({}));
          console.warn('Resend feedback delivery note:', redactSecrets(JSON.stringify(errData)));
        }
      } catch (err: any) {
        console.warn('Resend email fetch error:', redactSecrets(err?.message || ''));
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Thank you for helping improve ASCEND! Your feedback has been safely submitted.',
      emailDelivered: emailSent,
      referenceId: emailId || `fb_${Date.now()}`,
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
