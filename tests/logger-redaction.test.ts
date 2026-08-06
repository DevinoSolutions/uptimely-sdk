/**
 * Pins the logging contract (open-api D9): whatever logger the caller plugs
 * in, the authorization credential NEVER reaches it, and bodies are never
 * logged at all.
 */
import { describe, expect, it } from "vitest";

import type { SdkLogger } from "../src/core/logger";
import { redactHeaders } from "../src/core/logger";
import {
  TEST_API_KEY,
  createQueuedFetch,
  makeTestClient,
  problemReply,
} from "./support/mock-fetch";

function collectingLogger(): {
  logger: SdkLogger;
  entries: { level: string; message: string; data?: Record<string, unknown> }[];
} {
  const entries: {
    level: string;
    message: string;
    data?: Record<string, unknown>;
  }[] = [];
  return {
    entries,
    logger: {
      debug: (message, data) => entries.push({ level: "debug", message, data }),
      warn: (message, data) => entries.push({ level: "warn", message, data }),
      error: (message, data) => entries.push({ level: "error", message, data }),
    },
  };
}

describe("redactHeaders", () => {
  it("replaces the authorization value with [REDACTED] and leaves other headers intact", () => {
    expect(
      redactHeaders({
        authorization: `Bearer ${TEST_API_KEY}`,
        accept: "application/json",
      }),
    ).toEqual({ authorization: "[REDACTED]", accept: "application/json" });
  });

  it("redacts case-insensitively (Authorization with a capital A)", () => {
    expect(redactHeaders({ Authorization: `Bearer ${TEST_API_KEY}` })).toEqual({
      Authorization: "[REDACTED]",
    });
  });
});

describe("logger output over a real request cycle", () => {
  it("never emits the API key in any log entry across request, response and retry events", async () => {
    const { logger, entries } = collectingLogger();
    const harness = createQueuedFetch([
      problemReply(500, "internal_error", { headers: { "retry-after": "0" } }),
      { status: 200, jsonBody: { id: "m-1", name: "Recovered" } },
    ]);
    const client = makeTestClient(harness, { logger });
    await client.monitors.retrieve("m-1");

    expect(entries.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(entries);
    expect(serialized).not.toContain(TEST_API_KEY);
    expect(serialized).toContain("[REDACTED]");
  });

  it("logs a warn entry for the retry naming method, path, status and attempt", async () => {
    const { logger, entries } = collectingLogger();
    const harness = createQueuedFetch([
      problemReply(500, "internal_error", { headers: { "retry-after": "0" } }),
      { status: 200, jsonBody: { id: "m-1" } },
    ]);
    const client = makeTestClient(harness, { logger });
    await client.monitors.retrieve("m-1");

    const warn = entries.find((entry) => entry.level === "warn");
    expect(warn).toBeDefined();
    expect(warn?.data).toMatchObject({
      method: "GET",
      path: "/v1/monitors/m-1",
      status: 500,
      attempt: 1,
    });
  });

  it("never logs request or response bodies", async () => {
    const { logger, entries } = collectingLogger();
    const secretBody = "extremely-private-monitor-name";
    const harness = createQueuedFetch([
      { status: 201, jsonBody: { id: "m-1", name: secretBody } },
    ]);
    const client = makeTestClient(harness, { logger });
    await client.monitors.create({ name: secretBody, monitor_type: "Manual" });
    expect(JSON.stringify(entries)).not.toContain(secretBody);
  });
});
