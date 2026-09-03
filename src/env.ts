import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters (use: openssl rand -hex 32)"),
  // Deprecated: not used (refresh token is random 48B, not JWT). Kept for backward compat, will be removed.
  JWT_REFRESH_SECRET: z.string().optional().or(z.literal("")).default(""),
  EMAIL_ENABLED: z.coerce.boolean().default(false),
  EMAIL_DEV_MODE: z.coerce.boolean().default(false),
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().default(""),
  SMTP_PASSWORD: z.string().default(""),
  SMTP_SECURE: z.coerce.boolean().default(false),
  MAIL_FROM: z.string().default("no-reply@ravaa.my.id"),
  MAIL_FROM_NAME: z.string().default("Ravaa Account"),
  ACCOUNT_WEB_URL: z.string().url().default("http://localhost:5173"),
  EMAIL_VERIFICATION_EXPIRES_HOURS: z.coerce.number().default(24),
  INITIAL_ADMIN_EMAIL: z.string().email().optional().or(z.literal("")).default(""),
  INITIAL_ADMIN_PASSWORD: z.string().optional().or(z.literal("")).default(""),
  INITIAL_ADMIN_USERNAME: z.string().optional().or(z.literal("")).default(""),
  SEED_DEMO_USER: z.coerce.boolean().default(true),
  SEED_SAMPLE_APPS: z.coerce.boolean().default(true),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("❌ Invalid environment variables:", parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  cached = parsed.data;
  return cached;
}
