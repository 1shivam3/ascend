/**
 * Transactional Email Delivery for ASCEND Account Deletion Verification
 *
 * Dispatches time-limited, single-use verification links to uninstalled
 * or signed-out athletes using Resend transactional email API.
 * Keeps all API credentials strictly server-side.
 */

import { redactSecrets } from './server-security';

export interface SendDeletionEmailOptions {
  recipientEmail: string;
  token: string;
  appOrigin?: string;
}

export interface SendDeletionEmailResult {
  success: boolean;
  deliveryConfigured: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Checks whether an outbound transactional email provider is configured.
 */
export function isEmailDeliveryConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

/**
 * Escapes HTML entities to prevent injection in generated email templates.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sends a single-use deletion verification email.
 */
export async function sendDeletionVerificationEmail(
  options: SendDeletionEmailOptions
): Promise<SendDeletionEmailResult> {
  const { recipientEmail, token, appOrigin } = options;
  const resendApiKey = process.env.RESEND_API_KEY?.trim();

  // If no provider is configured, report incomplete delivery configuration
  if (!resendApiKey) {
    return {
      success: false,
      deliveryConfigured: false,
      error: 'Transactional email provider (RESEND_API_KEY) is not configured on the server.',
    };
  }

  const origin =
    appOrigin ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://ascendtonext.vercel.app');

  // Use URI fragment (#token=...&email=...) so that the secret token is never sent in the HTTP
  // request line across the wire and cannot leak into reverse proxy, CDN, or hosting edge access logs.
  const verificationUrl = `${origin}/delete-account#token=${encodeURIComponent(token)}&email=${encodeURIComponent(recipientEmail)}`;
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim() || 'ASCEND Privacy <onboarding@resend.dev>';
  const subject = '[ASCEND] Confirm Account & Data Deletion Request';

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0a0a0a; color: #f5f5f5; margin: 0; padding: 24px; }
    .card { background-color: #141414; border: 1px solid #262626; border-radius: 12px; padding: 28px; max-width: 540px; margin: 0 auto; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: bold; font-family: monospace; letter-spacing: 0.5px; background-color: #ef444422; color: #ef4444; border: 1px solid #ef444444; }
    .title { font-size: 20px; font-weight: 800; margin-top: 16px; margin-bottom: 8px; color: #ffffff; letter-spacing: -0.5px; }
    .meta { font-size: 13px; color: #a3a3a3; line-height: 1.5; margin-bottom: 20px; }
    .btn-delete { display: inline-block; background-color: #dc2626; color: #ffffff !important; font-weight: bold; font-size: 13px; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0 24px 0; }
    .callout { background-color: #1a1a1a; border-left: 3px solid #e5c07b; padding: 12px; border-radius: 6px; font-size: 12px; color: #cccccc; margin-bottom: 20px; }
    .footer { border-top: 1px solid #262626; padding-top: 16px; font-size: 11px; color: #737373; line-height: 1.4; }
    .break-word { word-break: break-all; color: #e5c07b; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">SECURITY VERIFICATION</div>
    <div class="title">Confirm Account Deletion</div>
    <p class="meta">
      We received a request to permanently delete your ASCEND athlete account and all associated cloud data for: <strong>${escapeHtml(recipientEmail)}</strong>.
    </p>

    <div class="callout">
      <strong>Important:</strong> This verification link is strictly <strong>single-use</strong> and expires in <strong>15 minutes</strong>. Once confirmed, all your personal records, workouts, meals, and account credentials will be permanently eradicated immediately with 0 days retention.
    </div>

    <div>
      <a href="${verificationUrl}" class="btn-delete" target="_blank" rel="noreferrer">
        Permanently Delete My Account
      </a>
    </div>

    <p style="font-size: 12px; color: #888888; margin-bottom: 8px;">
      If the button above does not work, copy and paste this link into your browser:
    </p>
    <p style="font-size: 11px; margin-bottom: 24px;">
      <a href="${verificationUrl}" class="break-word" target="_blank" rel="noreferrer">${verificationUrl}</a>
    </p>

    <div class="footer">
      If you did not request this deletion, you can safely ignore this email. Your ASCEND account remains secure.<br>&bull; ASCEND Athlete Operating System &bull; Privacy Team
    </div>
  </div>
</body>
</html>
  `.trim();

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [recipientEmail],
        subject,
        html: htmlBody,
        text: `Confirm ASCEND Account Deletion\n\nWe received a request to permanently delete your ASCEND account and data for ${recipientEmail}.\n\nThis single-use link expires in 15 minutes:\n${verificationUrl}\n\nIf you did not request this, ignore this email.`,
      }),
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        success: true,
        deliveryConfigured: true,
        messageId: data?.id,
      };
    }

    const errData = await res.json().catch(() => ({}));
    const sanitizedErrMsg = redactSecrets(JSON.stringify(errData));
    console.warn('Resend deletion email delivery failed:', sanitizedErrMsg);

    return {
      success: false,
      deliveryConfigured: true,
      error: sanitizedErrMsg || `Delivery rejected with HTTP ${res.status}`,
    };
  } catch (err: any) {
    const sanitizedErrMsg = redactSecrets(err?.message || 'Network error');
    console.warn('Resend deletion email fetch exception:', sanitizedErrMsg);
    return {
      success: false,
      deliveryConfigured: true,
      error: sanitizedErrMsg,
    };
  }
}
