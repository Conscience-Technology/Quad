/**
 * Email transport. Resend HTTP API only — no SMTP, no extra runtime deps.
 * Disabled by default (`EMAIL_PROVIDER=none`); set EMAIL_PROVIDER=resend +
 * EMAIL_PROVIDER_KEY to enable. Every send is fire-and-forget at the call
 * site so we never block ingest / signup on email delivery.
 */
import { env, features } from "./env";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; reason: "disabled" | "http"; detail?: string };

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (!features.email()) {
    return { ok: false, reason: "disabled" };
  }
  const e = env();
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${e.EMAIL_PROVIDER_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: e.EMAIL_FROM,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text ?? stripHtml(input.html),
        reply_to: input.replyTo,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, reason: "http", detail: `${res.status}: ${detail.slice(0, 200)}` };
    }
    const data = (await res.json()) as { id?: string };
    return { ok: true, id: data.id ?? "" };
  } catch (err) {
    return {
      ok: false,
      reason: "http",
      detail: err instanceof Error ? err.message : "unknown",
    };
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ---- templates ------------------------------------------------------------

export function inviteEmail(opts: {
  projectName: string;
  inviteUrl: string;
  invitedBy: string;
}): { subject: string; html: string } {
  return {
    subject: `You're invited to ${opts.projectName} on Quad`,
    html: `
<!doctype html>
<html><body style="font-family:ui-sans-serif,system-ui,sans-serif;line-height:1.55;color:#0f1117;max-width:560px;margin:0 auto;padding:32px 16px">
  <p style="margin:0 0 16px">Hi,</p>
  <p style="margin:0 0 16px"><strong>${escape(opts.invitedBy)}</strong> invited you to the <strong>${escape(opts.projectName)}</strong> project on Quad.</p>
  <p style="margin:24px 0"><a href="${opts.inviteUrl}" style="display:inline-block;background:#8b7cf6;color:#06070c;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">Accept invitation</a></p>
  <p style="margin:0 0 8px;font-size:13px;color:#6b7280">Or paste this link into your browser:</p>
  <p style="margin:0 0 24px;font-size:12px;color:#6b7280;word-break:break-all">${opts.inviteUrl}</p>
  <p style="margin:24px 0 0;font-size:12px;color:#9ca3af">This invitation expires in 14 days. If you weren't expecting it, you can ignore this email.</p>
</body></html>`.trim(),
  };
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
