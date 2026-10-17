import type { ErrorRequestHandler, RequestHandler } from "express";
import { z } from "zod";
import { MulterError } from "multer";
import { logger } from "./logger.js";

/**
 * Response shapes the web app relies on:
 *   success:     2xx with data, or { ok: true, id? } for mutations
 *   validation:  400 { ok: false, fieldErrors }
 *   other:       4xx { ok: false, error }
 */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

export const badRequest = (message: string) => new HttpError(400, message);
export const unauthorized = (message = "Sign in to continue.") => new HttpError(401, message);
export const forbidden = (message: string) => new HttpError(403, message);
export const notFound = (message = "Not found.") => new HttpError(404, message);
export const conflict = (message: string, fieldErrors?: Record<string, string>) => new HttpError(409, message, fieldErrors);

/** 400 with per-field messages (the forms show them next to each input). */
export function invalid(fieldErrors: Record<string, string>) {
  return new HttpError(400, "Please fix the highlighted fields.", fieldErrors);
}

export function firstErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

export const text = (max: number) => z.string().trim().max(max, `Keep it under ${max} characters.`);

export function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

/** A string query parameter (Express 5 parses ?a=1&a=2 into arrays). */
export function queryString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ ok: false, error: "Not found." });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  void _next;
  if (err instanceof HttpError) {
    res.status(err.status).json({ ok: false, error: err.message, ...(err.fieldErrors ? { fieldErrors: err.fieldErrors } : {}) });
    return;
  }
  if (err instanceof MulterError) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    res.status(status).json({ ok: false, error: status === 413 ? "Receipts can be up to 5 MB." : err.message });
    return;
  }
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ ok: false, error: "Malformed JSON." });
    return;
  }
  logger.error({ err, method: req.method, url: req.originalUrl }, "unhandled error");
  res.status(500).json({ ok: false, error: "Something went wrong. Please try again." });
};
