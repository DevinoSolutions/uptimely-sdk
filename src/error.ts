/**
 * Typed error hierarchy for the Uptimely public API (open-api D3/D9).
 *
 * Every non-2xx /v1 response is an RFC 9457 `application/problem+json` body
 * with the stable `code` extension — `code` is the value integrations branch
 * on (never parse `title`/`detail`). The hierarchy mirrors HTTP status
 * classes; `RateLimitError` additionally distinguishes burst `rate_limited`
 * from period `quota_exhausted` (open-api D4 — retry behavior differs).
 *
 * Types come from `@uptimely/contracts` (bundled at build time) — the SAME
 * zod schemas the server validates with, so there is no drift.
 */
import type { FieldError, Problem, ProblemCode } from "@uptimely/contracts";

/** Base class of every error this SDK throws. */
export class UptimelyError extends Error {}

/** Request never produced an HTTP response (DNS/TLS/socket failure). */
export class APIConnectionError extends UptimelyError {
  constructor(message = "Connection error.", options?: { cause?: unknown }) {
    super(message);
    this.name = "APIConnectionError";
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

/** The per-attempt timeout elapsed before a response arrived. */
export class APIConnectionTimeoutError extends APIConnectionError {
  constructor(message = "Request timed out.") {
    super(message);
    this.name = "APIConnectionTimeoutError";
  }
}

/** The caller's own AbortSignal fired — never retried. */
export class APIUserAbortError extends UptimelyError {
  constructor(message = "Request was aborted by the caller.") {
    super(message);
    this.name = "APIUserAbortError";
  }
}

/**
 * `code` is typed as the frozen registry union, widened with `string & {}`
 * so a NEW server-side code (additive, allowed in v1) degrades to a plain
 * string instead of breaking consumers — forward-compatible by design.
 */
export type ApiProblemCode = ProblemCode | (string & {});

interface ApiErrorFields {
  status: number;
  requestId: string | null;
  headers: Headers;
  problem: Problem | null;
  rawBody: string | null;
}

/** An HTTP error response from the API (problem+json parsed when present). */
export class APIError extends UptimelyError {
  readonly status: number;
  /** `x-request-id` of the failing request — quote it in support requests. */
  readonly requestId: string | null;
  readonly headers: Headers;
  /** The parsed problem document, null when the body was not problem+json. */
  readonly problem: Problem | null;
  /** Raw response body — escape hatch when `problem` is null. */
  readonly rawBody: string | null;

  constructor(message: string, fields: ApiErrorFields) {
    super(message);
    this.name = "APIError";
    this.status = fields.status;
    this.requestId = fields.requestId;
    this.headers = fields.headers;
    this.problem = fields.problem;
    this.rawBody = fields.rawBody;
  }

  /** Stable machine-readable problem code — the value to branch on. */
  get code(): ApiProblemCode | null {
    return this.problem?.code ?? null;
  }

  /** Problem `type` URI — resolves to the docs page for this problem. */
  get problemType(): string | null {
    return this.problem?.type ?? null;
  }

  get detail(): string | null {
    return this.problem?.detail ?? null;
  }

  /** Field-level failures (present on `validation_failed`). */
  get fieldErrors(): FieldError[] {
    return this.problem?.errors ?? [];
  }

  static fromResponse(input: {
    status: number;
    headers: Headers;
    requestId: string | null;
    problem: Problem | null;
    rawBody: string | null;
  }): APIError {
    const { status, headers, requestId, problem, rawBody } = input;
    const summary = problem
      ? `${problem.code}: ${problem.detail ?? problem.title}`
      : (rawBody?.slice(0, 200) ?? "no response body");
    const message = `${status} ${summary}${requestId ? ` (request_id: ${requestId})` : ""}`;
    const fields: ApiErrorFields = {
      status,
      requestId,
      headers,
      problem,
      rawBody,
    };
    if (status === 400) return new BadRequestError(message, fields);
    if (status === 401) return new AuthenticationError(message, fields);
    if (status === 403) return new PermissionDeniedError(message, fields);
    if (status === 404) return new NotFoundError(message, fields);
    if (status === 409) return new ConflictError(message, fields);
    if (status === 422) return new UnprocessableEntityError(message, fields);
    if (status === 429) return new RateLimitError(message, fields);
    if (status >= 500) return new InternalServerError(message, fields);
    return new APIError(message, fields);
  }
}

export class BadRequestError extends APIError {
  constructor(message: string, fields: ApiErrorFields) {
    super(message, fields);
    this.name = "BadRequestError";
  }
}

export class AuthenticationError extends APIError {
  constructor(message: string, fields: ApiErrorFields) {
    super(message, fields);
    this.name = "AuthenticationError";
  }
}

export class PermissionDeniedError extends APIError {
  constructor(message: string, fields: ApiErrorFields) {
    super(message, fields);
    this.name = "PermissionDeniedError";
  }
}

export class NotFoundError extends APIError {
  constructor(message: string, fields: ApiErrorFields) {
    super(message, fields);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends APIError {
  constructor(message: string, fields: ApiErrorFields) {
    super(message, fields);
    this.name = "ConflictError";
  }
}

export class UnprocessableEntityError extends APIError {
  constructor(message: string, fields: ApiErrorFields) {
    super(message, fields);
    this.name = "UnprocessableEntityError";
  }
}

/**
 * 429 — two DISTINCT problem codes share this status (open-api D4):
 * `rate_limited` (per-key burst window; retry after `retryAfterSeconds`) vs
 * `quota_exhausted` (billing-period plan allowance; retrying before the
 * period resets is pointless — upgrade or wait).
 */
export class RateLimitError extends APIError {
  constructor(message: string, fields: ApiErrorFields) {
    super(message, fields);
    this.name = "RateLimitError";
  }

  /** Parsed `Retry-After` (delay-seconds or HTTP-date), null when absent. */
  get retryAfterSeconds(): number | null {
    return parseRetryAfterSeconds(this.headers.get("retry-after"));
  }

  get isQuotaExhausted(): boolean {
    return this.code === "quota_exhausted";
  }
}

export class InternalServerError extends APIError {
  constructor(message: string, fields: ApiErrorFields) {
    super(message, fields);
    this.name = "InternalServerError";
  }
}

/** RFC 9110 Retry-After: delay-seconds or an HTTP-date. */
export function parseRetryAfterSeconds(value: string | null): number | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const dateMs = Date.parse(trimmed);
  if (Number.isNaN(dateMs)) return null;
  return Math.max(0, Math.ceil((dateMs - Date.now()) / 1000));
}
