# @uptimely/sdk

## 0.2.0

### Minor Changes

- 88a2d72: Add the monitor and status-page write operations.

  - `monitors.update(id, body)` / `monitors.delete(id)` — change a monitor's
    name, description, target url/host, check interval or request timeout, or
    remove it (deleting also resolves the alerts it auto-raised).
  - `statusPages.create(body)` / `.update(id, body)` / `.delete(id)` — manage
    status pages, including their public/private visibility.
  - `statusPages.listResources(id)` / `.attachResource(id, body)` /
    `.detachResource(id, resourceId)` — choose which monitors a status page
    shows.

  The status-page writes need the new `status-pages:write` scope on the API key;
  the monitor writes use the existing `monitors:write`. All of them are Pro-plan
  operations, like every other write on the API.

### Patch Changes

- 8f62ef7: `@uptimely/sdk/webhooks` now imports `node:crypto` explicitly.

  The published `dist/webhooks.js` and `dist/webhooks.cjs` carried a bare
  `crypto` specifier even though the source imports `node:crypto` — the bundler
  was stripping the prefix. Node resolves both spellings, so nothing was broken
  at runtime under Node, but a bundler targeting a non-Node runtime has no
  `crypto` builtin to map and could fail to resolve the `./webhooks` subpath.
  Both output formats now say `node:crypto` verbatim.

  No API change. The main `@uptimely/sdk` entry is unaffected and still carries
  no node imports at all.

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
