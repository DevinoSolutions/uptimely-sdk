/**
 * Pins the SDK's retry/idempotency contract (open-api D9) — the header
 * comment in src/core/http.ts documents this exact behavior and names this
 * file as its pinning suite.
 */
import { describe, expect, it } from "vitest";

import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIUserAbortError,
  ConflictError,
  InternalServerError,
  RateLimitError,
  parseRetryAfterSeconds,
} from "../src/error";
import {
  createHangingAbortableFetch,
  createQueuedFetch,
  makeTestClient,
  problemReply,
} from "./support/mock-fetch";

/** 500 with `Retry-After: 0` — retry-eligible with a zero backoff delay. */
const retryableInternalError = () =>
  problemReply(500, "internal_error", { headers: { "retry-after": "0" } });

describe("HTTP 5xx retries on safe requests", () => {
  it("retries a GET that answers 500 once and resolves with the second (200) response body", async () => {
    const harness = createQueuedFetch([
      retryableInternalError(),
      {
        status: 200,
        jsonBody: { id: "m-1", name: "Recovered after retry" },
        headers: { "x-request-id": "req_recovered" },
      },
    ]);
    const client = makeTestClient(harness);
    const monitor = await client.monitors.retrieve("m-1");
    expect(monitor.id).toBe("m-1");
    expect(harness.calls).toHaveLength(2);
    expect(harness.calls[0]?.url).toBe(harness.calls[1]?.url);
    expect(harness.calls.every((call) => call.method === "GET")).toBe(true);
  });

  it("throws InternalServerError after maxRetries+1 total fetch calls when a GET answers 500 on every attempt (default budget 2 retries → 3 calls)", async () => {
    const harness = createQueuedFetch([
      retryableInternalError(),
      retryableInternalError(),
      retryableInternalError(),
    ]);
    const client = makeTestClient(harness);
    await expect(client.monitors.retrieve("m-1")).rejects.toBeInstanceOf(
      InternalServerError,
    );
    expect(harness.calls).toHaveLength(3);
  });

  it("performs exactly one fetch call for a 500 GET when maxRetries is 0", async () => {
    const harness = createQueuedFetch([retryableInternalError()]);
    const client = makeTestClient(harness, { maxRetries: 0 });
    await expect(client.monitors.retrieve("m-1")).rejects.toBeInstanceOf(
      InternalServerError,
    );
    expect(harness.calls).toHaveLength(1);
  });
});

describe("429 rate limiting and the Retry-After ceiling", () => {
  it("retries a 429 rate_limited response whose Retry-After is 0 and succeeds on the second attempt", async () => {
    const harness = createQueuedFetch([
      problemReply(429, "rate_limited", { headers: { "retry-after": "0" } }),
      {
        status: 200,
        jsonBody: { id: "m-2", name: "Made it past the burst window" },
      },
    ]);
    const client = makeTestClient(harness);
    const monitor = await client.monitors.retrieve("m-2");
    expect(monitor.id).toBe("m-2");
    expect(harness.calls).toHaveLength(2);
  });

  it("gives up without retrying when Retry-After exceeds maxRetryAfterSeconds, throwing RateLimitError with retryAfterSeconds 700000 and isQuotaExhausted false", async () => {
    const harness = createQueuedFetch([
      problemReply(429, "rate_limited", {
        headers: { "retry-after": "700000" },
      }),
    ]);
    const client = makeTestClient(harness);
    const error = await client.monitors
      .retrieve("m-3")
      .catch((e) => e as unknown);
    expect(error).toBeInstanceOf(RateLimitError);
    const rateLimitError = error as RateLimitError;
    expect(rateLimitError.retryAfterSeconds).toBe(700_000);
    expect(rateLimitError.isQuotaExhausted).toBe(false);
    expect(harness.calls).toHaveLength(1);
  });

  it("reports isQuotaExhausted true on a RateLimitError carrying the quota_exhausted problem code", async () => {
    const harness = createQueuedFetch([problemReply(429, "quota_exhausted")]);
    const client = makeTestClient(harness, { maxRetries: 0 });
    const error = await client.monitors
      .retrieve("m-4")
      .catch((e) => e as unknown);
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).isQuotaExhausted).toBe(true);
  });
});

describe("connection-level failures", () => {
  it("retries a GET that fails at the network level and then throws APIConnectionError carrying the original cause once the budget is exhausted", async () => {
    const cause = new TypeError("fetch failed: ECONNREFUSED");
    const harness = createQueuedFetch([
      { rejectWith: cause },
      { rejectWith: cause },
    ]);
    const client = makeTestClient(harness, { maxRetries: 1 });
    const error = await client.monitors
      .retrieve("m-5")
      .catch((e) => e as unknown);
    expect(error).toBeInstanceOf(APIConnectionError);
    expect((error as APIConnectionError).cause).toBe(cause);
    expect(harness.calls).toHaveLength(2);
  });
});

describe("POST retry safety and idempotency keys", () => {
  it("never retries a 500 on a POST sent without any idempotency key (a raw non-idempotent POST performs exactly one call)", async () => {
    const harness = createQueuedFetch([retryableInternalError()]);
    const client = makeTestClient(harness);
    await expect(
      client.request({ method: "POST", path: "/v1/not-idempotent" }),
    ).rejects.toBeInstanceOf(InternalServerError);
    expect(harness.calls).toHaveLength(1);
  });

  it("never retries a network failure on a POST sent without any idempotency key", async () => {
    const harness = createQueuedFetch([
      { rejectWith: new TypeError("fetch failed: socket hang up") },
    ]);
    const client = makeTestClient(harness);
    await expect(
      client.request({ method: "POST", path: "/v1/not-idempotent" }),
    ).rejects.toBeInstanceOf(APIConnectionError);
    expect(harness.calls).toHaveLength(1);
  });

  it("auto-generates an uptimely-sdk- prefixed idempotency key for an idempotent-declared POST and replays the SAME key on the retry after a 500", async () => {
    const harness = createQueuedFetch([
      retryableInternalError(),
      {
        status: 201,
        jsonBody: { id: "m-9", name: "Created once", monitor_type: "Manual" },
      },
    ]);
    const client = makeTestClient(harness);
    const monitor = await client.monitors.create({
      name: "Created once",
      monitor_type: "Manual",
    });
    expect(monitor.id).toBe("m-9");
    expect(harness.calls).toHaveLength(2);
    const firstKey = harness.calls[0]?.headers["idempotency-key"];
    expect(firstKey).toMatch(/^uptimely-sdk-/);
    expect(harness.calls[1]?.headers["idempotency-key"]).toBe(firstKey);
  });

  it("sends an explicit options.idempotencyKey verbatim instead of auto-generating one", async () => {
    const harness = createQueuedFetch([
      {
        status: 201,
        jsonBody: { id: "m-10", name: "Explicit key", monitor_type: "Manual" },
      },
    ]);
    const client = makeTestClient(harness);
    await client.monitors.create(
      { name: "Explicit key", monitor_type: "Manual" },
      { idempotencyKey: "order-42-create" },
    );
    expect(harness.calls[0]?.headers["idempotency-key"]).toBe(
      "order-42-create",
    );
  });

  it("sends no idempotency-key header at all on GET requests", async () => {
    const harness = createQueuedFetch([
      { status: 200, jsonBody: { id: "m-11", name: "Read-only" } },
    ]);
    const client = makeTestClient(harness);
    await client.monitors.retrieve("m-11");
    expect(harness.calls[0]?.headers).not.toHaveProperty("idempotency-key");
  });

  it("retries a 409 received while an idempotency key was sent (idempotency_in_progress resolves to a replay)", async () => {
    const harness = createQueuedFetch([
      problemReply(409, "idempotency_in_progress", {
        headers: { "retry-after": "0" },
      }),
      {
        status: 201,
        jsonBody: { id: "m-12", name: "Replayed", monitor_type: "Manual" },
      },
    ]);
    const client = makeTestClient(harness);
    const monitor = await client.monitors.create({
      name: "Replayed",
      monitor_type: "Manual",
    });
    expect(monitor.id).toBe("m-12");
    expect(harness.calls).toHaveLength(2);
  });

  it("does not retry a 409 on a request that carried no idempotency key (PUT) and throws ConflictError after one call", async () => {
    const harness = createQueuedFetch([
      problemReply(409, "idempotency_in_progress", {
        headers: { "retry-after": "0" },
      }),
    ]);
    const client = makeTestClient(harness);
    await expect(
      client.incidents.savePostmortem("i-13", {
        postmortem_note: "Conflicted",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(harness.calls).toHaveLength(1);
  });
});

describe("caller aborts and per-attempt timeouts", () => {
  it("rejects with APIUserAbortError before attempting any fetch when the caller signal is already aborted", async () => {
    const harness = createHangingAbortableFetch();
    const client = makeTestClient(harness);
    const controller = new AbortController();
    controller.abort();
    await expect(
      client.monitors.retrieve("m-14", { signal: controller.signal }),
    ).rejects.toBeInstanceOf(APIUserAbortError);
    expect(harness.calls).toHaveLength(0);
  });

  it("rejects with APIUserAbortError and performs no retry when the caller signal fires mid-flight", async () => {
    const harness = createHangingAbortableFetch();
    const client = makeTestClient(harness);
    const controller = new AbortController();
    // The SDK invokes fetch synchronously on call, so aborting right after
    // starting the request is a genuine mid-flight abort.
    const pending = client.monitors.retrieve("m-15", {
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(APIUserAbortError);
    expect(harness.calls).toHaveLength(1);
  });

  it("rejects with APIConnectionTimeoutError when the per-attempt timeout signal fires on a fetch that never resolves (timeoutMs 5, maxRetries 0)", async () => {
    const harness = createHangingAbortableFetch();
    const client = makeTestClient(harness, { maxRetries: 0 });
    await expect(
      client.monitors.retrieve("m-16", { timeoutMs: 5 }),
    ).rejects.toBeInstanceOf(APIConnectionTimeoutError);
    expect(harness.calls).toHaveLength(1);
  });
});

describe("parseRetryAfterSeconds (RFC 9110 Retry-After forms)", () => {
  it("reads integer delay-seconds digits verbatim", () => {
    expect(parseRetryAfterSeconds("120")).toBe(120);
    expect(parseRetryAfterSeconds("0")).toBe(0);
    expect(parseRetryAfterSeconds(" 45 ")).toBe(45);
  });

  it("converts a future HTTP-date into a non-negative seconds delta and clamps a past HTTP-date to 0", () => {
    const futureSeconds = parseRetryAfterSeconds(
      new Date(Date.now() + 30_000).toUTCString(),
    );
    expect(futureSeconds).not.toBeNull();
    expect(futureSeconds ?? -1).toBeGreaterThanOrEqual(29);
    expect(futureSeconds ?? -1).toBeLessThanOrEqual(31);
    expect(
      parseRetryAfterSeconds(new Date(Date.now() - 60_000).toUTCString()),
    ).toBe(0);
  });

  it("returns null for garbage input and for a null header", () => {
    expect(parseRetryAfterSeconds("soon")).toBeNull();
    expect(parseRetryAfterSeconds("")).toBeNull();
    expect(parseRetryAfterSeconds(null)).toBeNull();
  });
});
