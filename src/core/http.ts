/**
 * The ONE request engine every SDK method rides (open-api D9).
 *
 * Retry contract (pinned by tests/http-retry.test.ts):
 * - Retried failures: network errors, per-attempt timeouts, HTTP 408, 429
 *   (honoring `Retry-After`), 5xx — and 409 ONLY when an Idempotency-Key was
 *   sent (the API's only 409 is `idempotency_in_progress`, which resolves to
 *   a replay once the first execution finishes).
 * - A POST is NEVER retried without an Idempotency-Key (unsafe mutation —
 *   open-api D9); every consequential POST in the /v1 registry is declared
 *   `idempotent`, and for those the SDK AUTO-GENERATES a key, computed ONCE
 *   so every retry of the same logical request replays instead of
 *   re-executing. GET/PUT/DELETE are retry-eligible: /v1 PUTs are
 *   absolute-set (no increments) and DELETE converges.
 * - `Retry-After` above `maxRetryAfterSeconds` (default 60) aborts retrying
 *   — a burst window is worth waiting for, a billing period is not.
 */
import type { Problem } from "@uptimely/contracts";

import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  parseRetryAfterSeconds,
} from "../error";
import { VERSION } from "../version";
import type { SdkLogger } from "./logger";
import { redactHeaders } from "./logger";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Per-request overrides accepted by every resource method. */
export interface RequestOptions {
  /**
   * Explicit Idempotency-Key. On idempotent-declared POSTs the SDK generates
   * one automatically when this is omitted.
   */
  idempotencyKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRetries?: number;
  /** Extra headers merged last (cannot override the auth header). */
  headers?: Record<string, string>;
}

export interface RequestParams {
  method: HttpMethod;
  /** Interpolated path, e.g. `/v1/monitors/8f7…`. */
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
  /**
   * Descriptor-declared consequential POST — opts this call into
   * idempotency-key auto-generation.
   */
  idempotent?: boolean;
  options?: RequestOptions;
}

/** Raw-response escape hatch shape (open-api D9). */
export interface ApiResponse<T> {
  data: T;
  response: Response;
  requestId: string | null;
}

export interface HttpCoreConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  maxRetryAfterSeconds: number;
  fetchFn: typeof globalThis.fetch;
  defaultHeaders: Record<string, string>;
  logger: SdkLogger;
}

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

function isRetryableStatus(status: number, idempotencyKeySent: boolean) {
  if (status === 409) return idempotencyKeySent;
  return RETRYABLE_STATUSES.has(status) || status >= 500;
}

/** min(8s, 0.5s * 2^attempt) with +/-25% jitter. */
function backoffMs(attempt: number): number {
  const base = Math.min(8000, 500 * 2 ** attempt);
  return base * (0.75 + Math.random() * 0.5);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const TIMEOUT_ABORT_REASON = Symbol("uptimely-sdk-timeout");

function buildQueryString(query: Record<string, unknown> | undefined): string {
  if (!query) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const entry of values) {
      if (entry === undefined || entry === null) continue;
      search.append(
        key,
        entry instanceof Date ? entry.toISOString() : String(entry),
      );
    }
  }
  const serialized = search.toString();
  return serialized === "" ? "" : `?${serialized}`;
}

function looksLikeProblem(value: unknown): value is Problem {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { code?: unknown }).code === "string" &&
    typeof (value as { status?: unknown }).status === "number"
  );
}

export class HttpCore {
  constructor(readonly config: HttpCoreConfig) {}

  /** Data-only convenience used by every resource method. */
  async request<T>(params: RequestParams): Promise<T> {
    const { data } = await this.requestWithResponse<T>(params);
    return data;
  }

  /** Full-fidelity variant — the raw `Response` escape hatch. */
  async requestWithResponse<T>(params: RequestParams): Promise<ApiResponse<T>> {
    const options = params.options ?? {};
    const maxRetries = options.maxRetries ?? this.config.maxRetries;
    const timeoutMs = options.timeoutMs ?? this.config.timeoutMs;

    // Computed ONCE, before the attempt loop: a retried request must present
    // the SAME key so the server replays instead of re-executing.
    const idempotencyKey =
      options.idempotencyKey ??
      (params.idempotent ? `uptimely-sdk-${crypto.randomUUID()}` : undefined);

    const url = `${this.config.baseUrl}${params.path}${buildQueryString(params.query)}`;
    const headers = this.buildHeaders(params, options, idempotencyKey);
    const retryEligible =
      params.method !== "POST" || idempotencyKey !== undefined;

    let attempt = 0;
    for (;;) {
      const outcome = await this.performAttempt(
        url,
        params,
        headers,
        timeoutMs,
        options.signal,
      );

      if (outcome.kind === "response") {
        const { response } = outcome;
        const requestId = response.headers.get("x-request-id");
        if (response.ok) {
          const data = await parseSuccessBody<T>(response);
          return { data, response, requestId };
        }
        const rawBody = await response.text();
        const problem = parseProblem(rawBody);
        const error = APIError.fromResponse({
          status: response.status,
          headers: response.headers,
          requestId,
          problem,
          rawBody: rawBody === "" ? null : rawBody,
        });
        const retryAfterSeconds = parseRetryAfterSeconds(
          response.headers.get("retry-after"),
        );
        if (
          retryEligible &&
          attempt < maxRetries &&
          isRetryableStatus(response.status, idempotencyKey !== undefined) &&
          (retryAfterSeconds === null ||
            retryAfterSeconds <= this.config.maxRetryAfterSeconds)
        ) {
          const delayMs =
            retryAfterSeconds !== null
              ? retryAfterSeconds * 1000
              : backoffMs(attempt);
          this.config.logger.warn("uptimely-sdk retrying request", {
            method: params.method,
            path: params.path,
            status: response.status,
            attempt: attempt + 1,
            maxRetries,
            delayMs: Math.round(delayMs),
            requestId,
          });
          attempt += 1;
          await sleep(delayMs);
          continue;
        }
        throw error;
      }

      // Connection-level failure (no HTTP response).
      if (outcome.kind === "user-abort") {
        throw new APIUserAbortError();
      }
      const connectionError =
        outcome.kind === "timeout"
          ? new APIConnectionTimeoutError(
              `Request timed out after ${timeoutMs}ms.`,
            )
          : new APIConnectionError("Connection error.", {
              cause: outcome.cause,
            });
      if (retryEligible && attempt < maxRetries) {
        const delayMs = backoffMs(attempt);
        this.config.logger.warn("uptimely-sdk retrying request", {
          method: params.method,
          path: params.path,
          failure: outcome.kind,
          attempt: attempt + 1,
          maxRetries,
          delayMs: Math.round(delayMs),
        });
        attempt += 1;
        await sleep(delayMs);
        continue;
      }
      throw connectionError;
    }
  }

  private buildHeaders(
    params: RequestParams,
    options: RequestOptions,
    idempotencyKey: string | undefined,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      accept: "application/json",
      "user-agent": `uptimely-sdk/${VERSION}`,
      ...this.config.defaultHeaders,
      ...options.headers,
    };
    // Auth is set LAST — per-request headers cannot override it with a stale
    // credential by accident. `/v1` is Bearer-ONLY (the handler chain reads
    // the Authorization header and nothing else).
    headers["authorization"] = `Bearer ${this.config.apiKey}`;
    if (params.body !== undefined) {
      headers["content-type"] = "application/json";
    }
    if (idempotencyKey !== undefined) {
      headers["idempotency-key"] = idempotencyKey;
    }
    return headers;
  }

  private async performAttempt(
    url: string,
    params: RequestParams,
    headers: Record<string, string>,
    timeoutMs: number,
    userSignal: AbortSignal | undefined,
  ): Promise<
    | { kind: "response"; response: Response }
    | { kind: "timeout" }
    | { kind: "user-abort" }
    | { kind: "network"; cause: unknown }
  > {
    if (userSignal?.aborted) return { kind: "user-abort" };
    const controller = new AbortController();
    const onUserAbort = () => controller.abort(userSignal?.reason);
    userSignal?.addEventListener("abort", onUserAbort, { once: true });
    const timer = setTimeout(
      () => controller.abort(TIMEOUT_ABORT_REASON),
      timeoutMs,
    );
    const fetchFn = this.config.fetchFn;
    const startedAt = Date.now();
    this.config.logger.debug("uptimely-sdk request", {
      method: params.method,
      url,
      headers: redactHeaders(headers),
    });
    try {
      const response = await fetchFn(url, {
        method: params.method,
        headers,
        body:
          params.body === undefined ? undefined : JSON.stringify(params.body),
        signal: controller.signal,
      });
      this.config.logger.debug("uptimely-sdk response", {
        method: params.method,
        url,
        status: response.status,
        durationMs: Date.now() - startedAt,
        requestId: response.headers.get("x-request-id"),
      });
      return { kind: "response", response };
    } catch (cause) {
      if (controller.signal.aborted) {
        return controller.signal.reason === TIMEOUT_ABORT_REASON
          ? { kind: "timeout" }
          : { kind: "user-abort" };
      }
      return { kind: "network", cause };
    } finally {
      clearTimeout(timer);
      userSignal?.removeEventListener("abort", onUserAbort);
    }
  }
}

async function parseSuccessBody<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (text === "") return undefined as T;
  return JSON.parse(text) as T;
}

function parseProblem(rawBody: string): Problem | null {
  if (rawBody === "") return null;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    return looksLikeProblem(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
