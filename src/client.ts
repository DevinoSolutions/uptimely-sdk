/**
 * Uptimely API client (open-api D9) — a thin, hand-owned wrapper over the
 * public /v1 REST surface at https://app.getuptimely.com. Server-oriented:
 * it carries a SECRET API key, so constructing it in a browser throws unless
 * `dangerouslyAllowBrowser` is set.
 */
import {
  HttpCore,
  type ApiResponse,
  type HttpMethod,
  type RequestOptions,
} from "./core/http";
import { noopLogger, type SdkLogger } from "./core/logger";
import { UptimelyError } from "./error";
import { Alerts } from "./resources/alerts";
import { Incidents } from "./resources/incidents";
import { Monitors } from "./resources/monitors";
import { OnCall } from "./resources/on-call";
import { ScheduledMaintenances } from "./resources/scheduled-maintenances";
import { StatusPages } from "./resources/status-pages";
import { UsageResource } from "./resources/usage";
import { WebhookEndpoints } from "./resources/webhook-endpoints";

export const DEFAULT_BASE_URL = "https://app.getuptimely.com";
export const DEFAULT_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_RETRIES = 2;
export const DEFAULT_MAX_RETRY_AFTER_SECONDS = 60;

export interface UptimelyOptions {
  /**
   * Project API key (`uptimely_live_…` / `uptimely_test_…`). Defaults to the
   * `UPTIMELY_API_KEY` environment variable.
   */
  apiKey?: string;
  /** Defaults to `UPTIMELY_BASE_URL`, then https://app.getuptimely.com. */
  baseUrl?: string;
  /** Per-attempt timeout. Default 60s. */
  timeoutMs?: number;
  /** Retry budget after the first attempt. Default 2. */
  maxRetries?: number;
  /** A `Retry-After` above this gives up instead of waiting. Default 60. */
  maxRetryAfterSeconds?: number;
  /** Custom fetch (test injection / proxying). Defaults to global fetch. */
  fetch?: typeof globalThis.fetch;
  /** Headers merged into every request (auth cannot be overridden). */
  defaultHeaders?: Record<string, string>;
  /** Receives redacted request/response/retry events. Bodies never logged. */
  logger?: SdkLogger;
  /**
   * API keys are SECRETS: shipping one in a browser exposes it to every
   * visitor. Only set this in trusted-kiosk-style environments.
   */
  dangerouslyAllowBrowser?: boolean;
}

function readEnv(name: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  // The published SDK reads the CUSTOMER's UPTIMELY_* env vars — the repo's
  // zod-env getEnv() rule governs our services, not their runtime.
  return process.env?.[name];
}

function isBrowserEnvironment(): boolean {
  // No DOM lib in this package's tsconfig — probe via globalThis.
  const g = globalThis as { window?: unknown; document?: unknown };
  return g.window !== undefined && g.document !== undefined;
}

export class Uptimely {
  readonly baseUrl: string;
  readonly monitors: Monitors;
  readonly incidents: Incidents;
  readonly alerts: Alerts;
  readonly scheduledMaintenances: ScheduledMaintenances;
  readonly statusPages: StatusPages;
  readonly onCall: OnCall;
  readonly usage: UsageResource;
  readonly webhookEndpoints: WebhookEndpoints;

  private readonly core: HttpCore;

  constructor(options: UptimelyOptions = {}) {
    if (isBrowserEnvironment() && options.dangerouslyAllowBrowser !== true) {
      throw new UptimelyError(
        "Uptimely SDK was constructed in a browser-like environment. API keys are secrets — " +
          "exposing one in frontend code leaks it to every visitor. Call the API from your " +
          "server instead, or pass `dangerouslyAllowBrowser: true` if you really mean it.",
      );
    }
    const apiKey = options.apiKey ?? readEnv("UPTIMELY_API_KEY");
    if (!apiKey) {
      throw new UptimelyError(
        "Missing API key: pass `apiKey` to new Uptimely({...}) or set the UPTIMELY_API_KEY environment variable. " +
          "Create one in your project's Settings → API keys at https://app.getuptimely.com.",
      );
    }
    this.baseUrl = (
      options.baseUrl ??
      readEnv("UPTIMELY_BASE_URL") ??
      DEFAULT_BASE_URL
    ).replace(/\/+$/, "");
    this.core = new HttpCore({
      apiKey,
      baseUrl: this.baseUrl,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
      maxRetryAfterSeconds:
        options.maxRetryAfterSeconds ?? DEFAULT_MAX_RETRY_AFTER_SECONDS,
      fetchFn: options.fetch ?? globalThis.fetch,
      defaultHeaders: options.defaultHeaders ?? {},
      logger: options.logger ?? noopLogger,
    });
    this.monitors = new Monitors(this.core);
    this.incidents = new Incidents(this.core);
    this.alerts = new Alerts(this.core);
    this.scheduledMaintenances = new ScheduledMaintenances(this.core);
    this.statusPages = new StatusPages(this.core);
    this.onCall = new OnCall(this.core);
    this.usage = new UsageResource(this.core);
    this.webhookEndpoints = new WebhookEndpoints(this.core);
  }

  /**
   * Raw-request escape hatch: arbitrary /v1 call with the client's auth,
   * retry and timeout behavior, returning the untyped data AND the raw
   * `Response` (headers, status).
   */
  request<T = unknown>(params: {
    method: HttpMethod;
    path: string;
    query?: Record<string, unknown>;
    body?: unknown;
    idempotent?: boolean;
    options?: RequestOptions;
  }): Promise<ApiResponse<T>> {
    return this.core.requestWithResponse<T>(params);
  }
}
