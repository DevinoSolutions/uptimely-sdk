/**
 * Pins the client's construction contract: key resolution, browser guard,
 * base-URL normalization, auth-header immutability and the raw-request
 * escape hatch.
 */
import { afterEach, describe, expect, it } from "vitest";

import { Uptimely } from "../src/client";
import { UptimelyError } from "../src/error";
import { VERSION } from "../src/version";
import {
  TEST_API_KEY,
  TEST_BASE_URL,
  createQueuedFetch,
  makeTestClient,
} from "./support/mock-fetch";

const g = globalThis as { window?: unknown; document?: unknown };

afterEach(() => {
  delete g.window;
  delete g.document;
  delete process.env.UPTIMELY_API_KEY;
  delete process.env.UPTIMELY_BASE_URL;
});

describe("API-key resolution", () => {
  it("throws UptimelyError naming UPTIMELY_API_KEY when constructed with no key anywhere", () => {
    expect(() => new Uptimely({})).toThrowError(/UPTIMELY_API_KEY/);
    expect(() => new Uptimely({})).toThrowError(UptimelyError);
  });

  it("falls back to the UPTIMELY_API_KEY environment variable when no apiKey option is passed", async () => {
    process.env.UPTIMELY_API_KEY = "uptimely_test_from_env";
    const harness = createQueuedFetch([
      { status: 200, jsonBody: { id: "m-env" } },
    ]);
    const client = new Uptimely({
      baseUrl: TEST_BASE_URL,
      fetch: harness.fetchFn,
    });
    await client.monitors.retrieve("m-env");
    expect(harness.calls[0]?.headers["authorization"]).toBe(
      "Bearer uptimely_test_from_env",
    );
  });
});

describe("browser environment guard", () => {
  it("throws when window+document exist and dangerouslyAllowBrowser is not set", () => {
    g.window = {};
    g.document = {};
    expect(() => new Uptimely({ apiKey: TEST_API_KEY })).toThrowError(
      /dangerouslyAllowBrowser/,
    );
  });

  it("constructs in a browser-like environment when dangerouslyAllowBrowser is true", () => {
    g.window = {};
    g.document = {};
    expect(
      () =>
        new Uptimely({ apiKey: TEST_API_KEY, dangerouslyAllowBrowser: true }),
    ).not.toThrow();
  });
});

describe("base URL handling", () => {
  it("strips trailing slashes from a custom baseUrl so paths join cleanly", async () => {
    const harness = createQueuedFetch([
      { status: 200, jsonBody: { id: "m-1" } },
    ]);
    const client = new Uptimely({
      apiKey: TEST_API_KEY,
      baseUrl: `${TEST_BASE_URL}///`,
      fetch: harness.fetchFn,
    });
    await client.monitors.retrieve("m-1");
    expect(harness.calls[0]?.url).toBe(`${TEST_BASE_URL}/v1/monitors/m-1`);
  });

  it("reads UPTIMELY_BASE_URL from the environment when no baseUrl option is passed", async () => {
    process.env.UPTIMELY_BASE_URL = "https://self-hosted.uptimely.test";
    const harness = createQueuedFetch([
      { status: 200, jsonBody: { id: "m-1" } },
    ]);
    const client = new Uptimely({
      apiKey: TEST_API_KEY,
      fetch: harness.fetchFn,
    });
    await client.monitors.retrieve("m-1");
    expect(harness.calls[0]?.url).toBe(
      "https://self-hosted.uptimely.test/v1/monitors/m-1",
    );
  });
});

describe("request headers", () => {
  it("sends Bearer auth, a versioned user-agent, and accept: application/json on every request", async () => {
    const harness = createQueuedFetch([
      { status: 200, jsonBody: { id: "m-1" } },
    ]);
    const client = makeTestClient(harness);
    await client.monitors.retrieve("m-1");
    const headers = harness.calls[0]?.headers ?? {};
    expect(headers["authorization"]).toBe(`Bearer ${TEST_API_KEY}`);
    expect(headers["user-agent"]).toBe(`uptimely-sdk/${VERSION}`);
    expect(headers["accept"]).toBe("application/json");
  });

  it("never lets defaultHeaders or per-request headers override the authorization header", async () => {
    const harness = createQueuedFetch([
      { status: 200, jsonBody: { id: "m-1" } },
    ]);
    const client = makeTestClient(harness, {
      defaultHeaders: { authorization: "Bearer stale-default" },
    });
    await client.monitors.retrieve("m-1", {
      headers: { authorization: "Bearer stale-per-request" },
    });
    expect(harness.calls[0]?.headers["authorization"]).toBe(
      `Bearer ${TEST_API_KEY}`,
    );
  });

  it("merges custom defaultHeaders into requests without dropping the standard ones", async () => {
    const harness = createQueuedFetch([
      { status: 200, jsonBody: { id: "m-1" } },
    ]);
    const client = makeTestClient(harness, {
      defaultHeaders: { "x-customer-tag": "integration-7" },
    });
    await client.monitors.retrieve("m-1");
    const headers = harness.calls[0]?.headers ?? {};
    expect(headers["x-customer-tag"]).toBe("integration-7");
    expect(headers["accept"]).toBe("application/json");
  });
});

describe("raw request escape hatch", () => {
  it("returns data, the raw Response and the x-request-id for an arbitrary /v1 call", async () => {
    const harness = createQueuedFetch([
      {
        status: 200,
        jsonBody: { anything: true },
        headers: { "x-request-id": "req_raw_1" },
      },
    ]);
    const client = makeTestClient(harness);
    const { data, response, requestId } = await client.request<{
      anything: boolean;
    }>({ method: "GET", path: "/v1/usage" });
    expect(data.anything).toBe(true);
    expect(response.status).toBe(200);
    expect(requestId).toBe("req_raw_1");
  });

  it("resolves undefined data on a 204 response with no body", async () => {
    const harness = createQueuedFetch([{ status: 204 }]);
    const client = makeTestClient(harness);
    const { data, response } = await client.request({
      method: "DELETE",
      path: "/v1/webhook-endpoints/we-1",
    });
    expect(data).toBeUndefined();
    expect(response.status).toBe(204);
  });
});
