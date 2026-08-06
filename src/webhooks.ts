/**
 * Standard Webhooks verification for YOUR server (`@uptimely/sdk/webhooks`).
 *
 * SERVER-ONLY subpath (node:crypto): verify the `webhook-id` /
 * `webhook-timestamp` / `webhook-signature` headers Uptimely sends to your
 * endpoint. Always verify the RAW request bytes — parsing and re-serializing
 * the body before verification breaks the signature.
 *
 * The verifier is re-exported from `@uptimely/contracts` — the EXACT code the
 * Uptimely delivery worker signs with (bundled at build time). Secret
 * GENERATION stays server-side in the product and is deliberately not
 * shipped here.
 */
export {
  WEBHOOK_SIGNATURE_TOLERANCE_SECONDS,
  verifyWebhookSignature,
  type VerifyWebhookSignatureInput,
  type VerifyWebhookSignatureResult,
} from "@uptimely/contracts/webhooks/signing";

import {
  verifyWebhookSignature,
  type VerifyWebhookSignatureResult,
  type WebhookSignatureHeaders,
} from "@uptimely/contracts/webhooks/signing";

export interface VerifyWebhookInput {
  /**
   * The inbound request headers — a Fetch `Headers`, or a plain object as
   * Node's `IncomingMessage.headers` provides. Names matched
   * case-insensitively. (`WebhookSignatureHeaders` is in the union because
   * TS interfaces have no implicit index signature — without it, the
   * signer's own output shape would not round-trip into verification.)
   */
  headers:
    | Headers
    | Record<string, string | string[] | undefined>
    | WebhookSignatureHeaders;
  /** EXACT raw body bytes as read off the wire. */
  rawBody: string;
  /** Endpoint signing secret(s) (`whsec_…`) — pass both during rotation. */
  secret: string | readonly string[];
  /** Override the +/-5-minute timestamp tolerance (mostly for tests). */
  toleranceSeconds?: number;
}

function headerValue(
  headers: VerifyWebhookInput["headers"],
  name: string,
): string | null {
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name);
  }
  const record = headers as Record<string, string | string[] | undefined>;
  const match =
    record[name] ??
    Object.entries(record).find(([key]) => key.toLowerCase() === name)?.[1];
  if (match === undefined) return null;
  return Array.isArray(match) ? (match[0] ?? null) : match;
}

/**
 * Convenience wrapper over `verifyWebhookSignature`: pulls the three
 * Standard Webhooks headers out of the request for you.
 */
export function verifyWebhook(
  input: VerifyWebhookInput,
): VerifyWebhookSignatureResult {
  const id = headerValue(input.headers, "webhook-id");
  const timestampHeader = headerValue(input.headers, "webhook-timestamp");
  const signatureHeader = headerValue(input.headers, "webhook-signature");
  if (id === null || timestampHeader === null || signatureHeader === null) {
    return { valid: false, reason: "malformed_signature_header" };
  }
  return verifyWebhookSignature({
    id,
    timestampHeader,
    signatureHeader,
    rawBody: input.rawBody,
    secrets: typeof input.secret === "string" ? [input.secret] : input.secret,
    ...(input.toleranceSeconds !== undefined && {
      toleranceSeconds: input.toleranceSeconds,
    }),
  });
}
