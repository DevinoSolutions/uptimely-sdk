/**
 * Pins the typed error hierarchy (open-api D3/D9): status → class mapping,
 * problem+json field access, and graceful degradation on non-problem bodies.
 */
import { describe, expect, it } from "vitest";

import {
  APIError,
  AuthenticationError,
  BadRequestError,
  ConflictError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  UnprocessableEntityError,
} from "../src/error";
import {
  createQueuedFetch,
  makeTestClient,
  problemReply,
} from "./support/mock-fetch";

describe("status → error-class mapping", () => {
  it.each([
    [400, "validation_failed", BadRequestError],
    [401, "invalid_api_key", AuthenticationError],
    [403, "insufficient_scope", PermissionDeniedError],
    [404, "not_found", NotFoundError],
    [409, "idempotency_in_progress", ConflictError],
    [422, "idempotency_key_reused", UnprocessableEntityError],
    [429, "quota_exhausted", RateLimitError],
    [500, "internal_error", InternalServerError],
  ] as const)(
    "maps a %s %s response to %o",
    async (status, code, errorClass) => {
      const harness = createQueuedFetch([problemReply(status, code)]);
      const client = makeTestClient(harness, { maxRetries: 0 });
      const error = await client.monitors
        .retrieve("m-err")
        .catch((e) => e as unknown);
      expect(error).toBeInstanceOf(errorClass);
      expect((error as APIError).status).toBe(status);
      expect((error as APIError).code).toBe(code);
    },
  );
});

describe("problem document access", () => {
  it("exposes code, problemType, detail, fieldErrors and requestId from a validation_failed problem", async () => {
    const harness = createQueuedFetch([
      problemReply(400, "validation_failed", {
        detail: "name is required.",
        errors: [
          { pointer: "/name", code: "required", message: "name is required." },
        ],
        requestId: "req_validation_1",
      }),
    ]);
    const client = makeTestClient(harness, { maxRetries: 0 });
    const error = (await client.monitors
      .retrieve("m-err")
      .catch((e) => e as unknown)) as APIError;
    expect(error.code).toBe("validation_failed");
    expect(error.problemType).toBe(
      "https://getuptimely.com/docs/api/problems/validation-failed",
    );
    expect(error.detail).toBe("name is required.");
    expect(error.fieldErrors).toEqual([
      { pointer: "/name", code: "required", message: "name is required." },
    ]);
    expect(error.requestId).toBe("req_validation_1");
    expect(error.message).toContain("validation_failed");
    expect(error.message).toContain("req_validation_1");
  });

  it("degrades gracefully on a non-problem error body: problem null, rawBody preserved, code null", async () => {
    const harness = createQueuedFetch([
      {
        status: 502,
        textBody: "<html>Bad gateway</html>",
        headers: { "content-type": "text/html" },
      },
    ]);
    const client = makeTestClient(harness, { maxRetries: 0 });
    const error = (await client.monitors
      .retrieve("m-err")
      .catch((e) => e as unknown)) as APIError;
    expect(error).toBeInstanceOf(InternalServerError);
    expect(error.problem).toBeNull();
    expect(error.code).toBeNull();
    expect(error.rawBody).toBe("<html>Bad gateway</html>");
  });
});
