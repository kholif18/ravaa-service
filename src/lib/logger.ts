type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordhash",
  "password_hash",
  "jwt",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "refreshtokenhash",
  "refresh_token_hash",
  "clientsecret",
  "client_secret",
  "clientsecrethash",
  "client_secret_hash",
  "token",
  "tokenhash",
  "token_hash",
]);

function sanitize(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sanitize);

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = sanitize(value);
    }
  }
  return result;
}

function formatMessage(level: LogLevel, message: string, data?: unknown): string {
  const timestamp = new Date().toISOString();
  const base = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  if (data !== undefined) {
    return `${base} ${JSON.stringify(sanitize(data))}`;
  }
  return base;
}

function shouldLog(level: LogLevel): boolean {
  const envLevel = process.env.LOG_LEVEL ?? "info";
  const configured = LEVEL_ORDER[envLevel as LogLevel] ?? LEVEL_ORDER.info;
  return LEVEL_ORDER[level] >= configured;
}

export const logger = {
  debug(message: string, data?: unknown) {
    if (shouldLog("debug")) console.debug(formatMessage("debug", message, data));
  },
  info(message: string, data?: unknown) {
    if (shouldLog("info")) console.info(formatMessage("info", message, data));
  },
  warn(message: string, data?: unknown) {
    if (shouldLog("warn")) console.warn(formatMessage("warn", message, data));
  },
  error(message: string, data?: unknown) {
    if (shouldLog("error")) console.error(formatMessage("error", message, data));
  },
};
