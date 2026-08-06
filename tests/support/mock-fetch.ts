/**
 * Queued mock `fetch` for the SDK unit suite.
 *
 * allow-mock: unit layer BY DESIGN — these tests pin the SDK's wire contract
 * (retry policy, idempotency keys, auth headers, pagination cursors) against
 * in-memory `Response` objects; a unit test making a real network call would
 * be a defect. Every test injects this fetch via `new Uptimely({ fetch })` —
 * the SDK's sanctioned test-injection seam.
 */
import { vi } from "vitest";

import { Uptimely, type UptimelyOptions } from "../../src/client";

export const TEST_API_KEY = "uptimely_test_unit";
export const TEST_BASE_URL = "https://api.uptimely.test";

/** One queued HTTP reply: JSON (`jsonBody`) or raw text (`textBody`). */
export interface QueuedReply {
  status: number;
  headers?: Record<string, string>;
  jsonBody?: unknown;
  textBody?: string;
}

/** One queued connection-level failure (fetch rejects, no HTTP response). */
interface QueuedRejection {
  rejectWith: unknown;
}

export type MockFetchStep = QueuedReply | QueuedRejection;

interface RecordedCall {
  url: string;
  method: string;
  /** Normalized to lower-case names via the `Headers` constructor. */
  headers: Record<string, string>;
  bodyText: string | null;
}

export interface MockFetchHarness {
  fetchFn: typeof globalThis.fetch;
  calls: RecordedCall[];
}

/** No DOM lib in this package's tsconfig — derive HeadersInit structurally. */
type FetchHeadersInit = ConstructorParameters<typeof Headers>[0];

function normalizeHeaders(
  headersInit: FetchHeadersInit | undefined,
): Record<string, string> {
  const normalized: Record<string, string> = {};
  new Headers(headersInit).forEach((value, name) => {
    normalized[name] = value;
  });
  return normalized;
}

function record(
  calls: RecordedCall[],
  input: string | URL | Request,
  init: RequestInit | undefined,
): void {
  calls.push({
    url: input instanceof Request ? input.url : String(input),
    method: init?.method ?? "GET",
    headers: normalizeHeaders(init?.headers as FetchHeadersInit | undefined),
    bodyText: typeof init?.body === "string" ? init.body : null,
  });
}

/**
 * A fetch that consumes one queued step per call, in order, and records
 * every call's url/method/headers/body. Draining past the queue throws so
 * an unexpected extra attempt fails the test loudly.
 */
export function createQueuedFetch(
  steps: readonly MockFetchStep[],
): MockFetchHarness {
  const queue = [...steps];
  const calls: RecordedCall[] = [];
  const fetchFn = vi.fn(
    async (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      record(calls, input, init);
      const step = queue.shift();
      if (step === undefined) {
        throw new Error(
          `mock fetch queue exhausted at call #${calls.length} (${String(input)}) — the SDK attempted more requests than the test queued`,
        );
      }
      if ("rejectWith" in step) {
        throw step.rejectWith;
      }
      const bodyText =
        step.textBody ??
        (step.jsonBody !== undefined ? JSON.stringify(step.jsonBody) : null);
      return new Response(bodyText, {
        status: step.status,
        headers: step.headers,
      });
    },
  ) as unknown as typeof globalThis.fetch;
  return { fetchFn, calls };
}

/**
 * A fetch whose promise NEVER settles on its own — it rejects with an
 * `AbortError` only when the request's `signal` fires. This is how the
 * timeout and user-abort tests stay signal-driven instead of sleep-driven.
 */
export function createHangingAbortableFetch(): MockFetchHarness {
  const calls: RecordedCall[] = [];
  const fetchFn = vi.fn(
    (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      record(calls, input, init);
      return new Promise<Response>((_resolve, reject) => {
        const abort = () =>
          reject(new DOMException("This operation was aborted", "AbortError"));
        if (init?.signal?.aborted) {
          abort();
          return;
        }
        init?.signal?.addEventListener("abort", abort, { once: true });
      });
    },
  ) as unknown as typeof globalThis.fetch;
  return { fetchFn, calls };
}

export interface ProblemReplyOptions {
  detail?: string;
  errors?: { pointer: string; code: string; message: string }[];
  headers?: Record<string, string>;
  requestId?: string;
}

/** RFC 9457 problem+json reply matching the /v1 wire shape. */
export function problemReply(
  status: number,
  code: string,
  options: ProblemReplyOptions = {},
): QueuedReply {
  const requestId = options.requestId ?? `req_${code}_${status}`;
  return {
    status,
    headers: {
      "content-type": "application/problem+json",
      "x-request-id": requestId,
      ...options.headers,
    },
    jsonBody: {
      type: `https://getuptimely.com/docs/api/problems/${code.replaceAll("_", "-")}`,
      title: code,
      status,
      code,
      request_id: requestId,
      ...(options.detail !== undefined && { detail: options.detail }),
      ...(options.errors !== undefined && { errors: options.errors }),
    },
  };
}

/** `{ data, has_more, next_cursor }` list-envelope reply (open-api D2). */
export function listReply(
  items: readonly unknown[],
  nextCursor: string | null,
): QueuedReply {
  return {
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-request-id": "req_list_page",
    },
    jsonBody: {
      data: items,
      has_more: nextCursor !== null,
      next_cursor: nextCursor,
    },
  };
}

/** Client wired to a harness with a pinned key + base URL for assertions. */
export function makeTestClient(
  harness: MockFetchHarness,
  options: Partial<UptimelyOptions> = {},
): Uptimely {
  return new Uptimely({
    apiKey: TEST_API_KEY,
    baseUrl: TEST_BASE_URL,
    fetch: harness.fetchFn,
    ...options,
  });
}
