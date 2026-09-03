import nodemailer from "nodemailer";
import type { EmailOptions, EmailProvider } from "./email.types.js";
import { logger } from "../logger.js";
import { getEnv } from "../../env.js";

export class SmtpEmailProvider implements EmailProvider {
  readonly name = "smtp";
  private transporter: nodemailer.Transporter;

  constructor() {
    const env = getEnv();
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth:
        env.SMTP_USER && env.SMTP_PASSWORD
          ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
          : undefined,
    });
  }

  async send(options: EmailOptions): Promise<void> {
    const env = getEnv();
    try {
      await this.transporter.sendMail({
        from: `"${env.MAIL_FROM_NAME}" <${env.MAIL_FROM}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });
      logger.info("email.sent", { to: options.to, subject: options.subject, provider: this.name });
    } catch (err) {
      logger.error("email.failed", { to: options.to, provider: this.name });
      throw err;
    }
  }
}
