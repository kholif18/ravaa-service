import type { Context, Next } from "hono";
import { errorResponse } from "../lib/errors.js";

export function errorHandler() {
  return async (c: Context, next: Next) => {
    try {
      await next();
    } catch (error) {
      return errorResponse(c, error);
    }
  };
}
