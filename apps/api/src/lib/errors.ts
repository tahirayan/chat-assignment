/**
 * Standard error envelope per PRD §7.6.
 *
 *   { "error": { "code": "INVALID_CREDENTIALS", "message": "...", "details": null } }
 *
 * Handlers throw AppError subclasses; the Fastify error handler maps them to
 * HTTP status + this envelope. Never include stack traces, file paths, or
 * internal state in production.
 */

export type AppErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "INVALID_CREDENTIALS"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "EMAIL_TAKEN"
  | "RATE_LIMITED"
  | "INTERNAL"
  | "INVALID_SIGNATURE"
  | "SERVICE_UNAVAILABLE";

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: AppErrorCode;
  readonly details: unknown;

  constructor(
    statusCode: number,
    code: AppErrorCode,
    message: string,
    details: unknown = null
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const errors = {
  badRequest: (message = "Bad request", details: unknown = null) =>
    new AppError(400, "BAD_REQUEST", message, details),
  invalidCredentials: () =>
    new AppError(401, "INVALID_CREDENTIALS", "Email or password incorrect"),
  unauthorized: (message = "Unauthorized") =>
    new AppError(401, "UNAUTHORIZED", message),
  forbidden: (message = "Forbidden") => new AppError(403, "FORBIDDEN", message),
  notFound: (message = "Not found") => new AppError(404, "NOT_FOUND", message),
  emailTaken: () =>
    new AppError(409, "EMAIL_TAKEN", "Email is already registered"),
  rateLimited: (message = "Too many requests") =>
    new AppError(429, "RATE_LIMITED", message),
  internal: (message = "Internal server error") =>
    new AppError(500, "INTERNAL", message),
  serviceUnavailable: (message = "Service unavailable") =>
    new AppError(503, "SERVICE_UNAVAILABLE", message),
  invalidSignature: (message = "Invalid signature") =>
    new AppError(400, "INVALID_SIGNATURE", message),
} as const;
