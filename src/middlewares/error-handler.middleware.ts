import type { ErrorHandler } from "hono";
import { errorResponse } from "../lib/errors.js";

export const errorHandler: ErrorHandler = (err, c) => {
  return errorResponse(c, err);
};
