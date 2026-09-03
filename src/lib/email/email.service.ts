import { getEmailProvider } from "./email.provider.js";
import { verificationEmail } from "./templates/verification.js";
import { getEnv } from "../../env.js";
import { logger } from "../logger.js";
import type { VerificationEmailData } from "./email.types.js";

export function buildVerificationUrl(rawToken: string): string {
  const env = getEnv();
  return `${env.ACCOUNT_WEB_URL.replace(/\/$/, "")}/verify-email?token=${encodeURIComponent(rawToken)}`;
}

export async function sendVerificationEmail(data: VerificationEmailData): Promise<void> {
  const env = getEnv();
  if (!env.EMAIL_ENABLED) {
    logger.info("email.delivery.disabled", { to: data.to });
    return;
  }
  if (env.EMAIL_DEV_MODE && env.NODE_ENV === "production") {
    logger.warn("email.dev_mode_in_production", { to: data.to });
    return;
  }
  const tpl = verificationEmail(data);
  try {
    await getEmailProvider().send({
      to: data.to,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    });
    logger.info("email.verification.sent", { to: data.to });
  } catch (err) {
    logger.error("email.verification.failed", { to: data.to });
    throw err;
  }
}

export function initEmailProvider(): void {
  const env = getEnv();
  if (!env.EMAIL_ENABLED) {
    // Use fake provider so sendVerificationEmail early-returns
    // Do not import here to avoid circular deps
    return;
  }
  // Lazy import to avoid loading nodemailer in tests when disabled
  // Actual provider is set in src/index.ts
}
