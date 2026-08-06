# @uptimely/sdk

## 0.1.0

### Minor Changes

- 95de6ee: First public release of the official Uptimely TypeScript SDK.

  - Typed resources for the full public API surface: monitors, incidents,
    alerts, scheduled maintenance, status pages, on-call, usage, and webhook
    endpoints (22 operations).
  - Auto-paginating `list` methods (`PagePromise`: awaitable page + async
    iterator across pages).
  - RFC 9457 problem-document errors as a typed hierarchy (`APIError`
    subclasses per status, `RateLimitError.isQuotaExhausted` to tell plan
    quota from burst limits).
  - Built-in retries with `Retry-After` support — idempotent requests only; a
    POST without an idempotency key is never retried.
  - Idempotency-key support on create/state-change operations.
  - `@uptimely/sdk/webhooks`: Standard-Webhooks signature verification for
    Uptimely outbound webhooks (Node crypto only).
  - Credential-redacting pluggable logger; browser execution refused so API
    keys stay server-side.
