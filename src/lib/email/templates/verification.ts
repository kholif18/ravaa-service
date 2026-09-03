import type { VerificationEmailData } from "../email.types.js";

export function verificationEmail(data: VerificationEmailData): { subject: string; html: string; text: string } {
  const subject = "Verify your Ravaa Account";

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,Helvetica,Arial,sans-serif;color:#0f172a;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
<tr><td style="background:#0f172a;padding:24px 32px;">
<span style="font-size:20px;font-weight:700;color:#ffffff;">Ravaa</span>
<span style="font-size:20px;font-weight:400;color:#94a3b8;"> Account</span>
</td></tr>
<tr><td style="padding:32px;">
<p style="margin:0 0 8px;font-size:16px;font-weight:600;">Hi ${escapeHtml(data.displayName ?? "there")},</p>
<p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6;">Thanks for creating your Ravaa Account. Please verify your email address to activate your account.</p>
<table cellpadding="0" cellspacing="0" style="margin:0 auto 20px;">
<tr><td align="center" style="background:#3b82f6;border-radius:8px;">
<a href="${escapeAttr(data.verificationUrl)}" style="display:inline-block;padding:12px 32px;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;">Verify Email</a>
</td></tr>
</table>
<p style="margin:0 0 6px;font-size:13px;color:#64748b;">Or copy this link into your browser:</p>
<p style="margin:0 0 20px;word-break:break-all;font-size:13px;"><a href="${escapeAttr(data.verificationUrl)}" style="color:#3b82f6;">${escapeHtml(data.verificationUrl)}</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#64748b;">This link expires in <strong>${data.expiresHours} hours</strong>.</p>
<p style="margin:0;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;">If you didn't create this account, you can safely ignore this email.<br>Do not forward this email — the link grants access to your account.</p>
</td></tr>
</table>
<p style="margin:16px 0 0;font-size:11px;color:#94a3b8;">&copy; ${new Date().getFullYear()} Ravaa. All rights reserved.</p>
</td></tr>
</table>
</body>
</html>`;

  const text = `Hi ${data.displayName ?? "there"},

Thanks for creating your Ravaa Account.

Please verify your email by visiting:
${data.verificationUrl}

This link expires in ${data.expiresHours} hours.

If you didn't create this account, you can safely ignore this email.
`;

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
