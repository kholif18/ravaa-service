import type { Context } from "hono";

export class AppError extends Error {
  public details?: Record<string, string[]>;
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "AppError";
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public details?: Record<string, string[]>) {
    super(400, "VALIDATION_ERROR", message, details);
    this.name = "ValidationError";
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Authentication required", details?: Record<string, string[]>) {
    super(401, "AUTHENTICATION_ERROR", message, details);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "Insufficient permissions") {
    super(403, "AUTHORIZATION_ERROR", message);
    this.name = "AuthorizationError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Resource") {
    super(404, "NOT_FOUND", `${resource} not found`);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, "CONFLICT", message);
    this.name = "ConflictError";
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests") {
    super(429, "RATE_LIMIT", message);
    this.name = "RateLimitError";
  }
}

export type ErrorResponse = {
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
};

export function errorResponse(c: Context, error: unknown): Response {
  if (error instanceof AppError) {
    const body: ErrorResponse = {
      error: {
        code: error.code,
        message: error.message,
      },
    };
    if (error.details) {
      body.error.details = error.details;
    }
    return c.json(body, error.statusCode as 400);
  }

  console.error("Unhandled error:", error);
  return c.json(
    {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal server error",
      },
    },
    500,
  );
}
