# @uptimely/sdk

Official TypeScript SDK for the [Uptimely](https://getuptimely.com) public
API — monitors, incidents, alerts, scheduled maintenance, status pages,
on-call, usage, and outbound webhooks.

- **Docs**: https://getuptimely.com/docs/api
- **OpenAPI 3.1 spec**: generated from the exact same schemas that validate
  every request server-side — the SDK can't drift from the API.

> This repository is a **read-only mirror** of `packages/sdk` in the Uptimely
> monorepo. Issues are welcome here; code changes land in the monorepo and
> are mirrored automatically on release.

## Install

```bash
npm install @uptimely/sdk
# or
pnpm add @uptimely/sdk
```

Node.js 20+. ESM and CJS are both shipped. The SDK is server-side: it
refuses to construct in a browser so your API key can't leak into client
bundles.

## Quick start

```ts
import Uptimely from "@uptimely/sdk";

const uptimely = new Uptimely({
  apiKey: process.env.UPTIMELY_API_KEY, // this env var is also the default
});

// List monitors (auto-paginating)
for await (const monitor of uptimely.monitors.list()) {
  console.log(monitor.name, monitor.status.name);
}

// Create a monitor. The SDK sends an Idempotency-Key automatically on
// idempotent-declared POSTs — pass your own to dedupe across processes.
const monitor = await uptimely.monitors.create(
  { name: "Marketing site", monitor_type: "Website", url: "https://example.com" },
  { idempotencyKey: "create-marketing-site-1" },
);

// Declare an incident
await uptimely.incidents.declare({
  title: "Checkout latency elevated",
  monitor_ids: [monitor.id],
});

// Edit or remove a monitor. Omitted fields are left untouched.
await uptimely.monitors.update(monitor.id, { monitoring_interval: "*/1 * * * *" });
await uptimely.monitors.delete(monitor.id);

// Put a monitor on a status page (and take it off again).
const page = await uptimely.statusPages.create({
  name: "Acme Status",
  is_public: true,
});
const resource = await uptimely.statusPages.attachResource(page.id, {
  monitor_id: monitor.id,
  show_uptime_percent: true,
});
await uptimely.statusPages.detachResource(page.id, resource.id);
```

Writes need a Pro plan, a key with the matching `:write` scope
(`monitors:write`, `status-pages:write`, …) and the project's
**programmatic write operations** switch turned on.

## Pagination

Every `list` method returns a `PagePromise`: `await` it for one page, or
`for await` it to iterate every item across pages.

```ts
const page = await uptimely.incidents.list({ limit: 50 });
console.log(page.data.length, page.hasMore);

for await (const incident of uptimely.incidents.list()) {
  // fetches subsequent pages on demand
}
```

## Errors

Failed requests throw a typed subclass of `APIError` carrying the parsed
RFC 9457 problem document:

```ts
import { RateLimitError, APIError } from "@uptimely/sdk";

try {
  await uptimely.monitors.create({ name: "…", monitor_type: "Website", url: "…" });
} catch (err) {
  if (err instanceof RateLimitError) {
    // err.isQuotaExhausted: plan quota (don't retry) vs burst limit (retry later)
    console.log(err.code, err.isQuotaExhausted);
  } else if (err instanceof APIError) {
    console.log(err.status, err.code, err.requestId, err.fieldErrors);
  }
}
```

Retries are built in: safe requests are retried with exponential backoff on
429/5xx (honouring `Retry-After`). A POST without an idempotency key is
**never** retried — a duplicate write is worse than a thrown error.

## Verifying webhooks

Uptimely signs outbound webhooks with the
[Standard Webhooks](https://www.standardwebhooks.com/) scheme. The
`/webhooks` subpath export verifies them (Node `crypto` only — works in any
server framework):

```ts
import { verifyWebhook } from "@uptimely/sdk/webhooks";

// Express example — verify the RAW request body, never a re-serialized parse.
app.post("/uptimely-webhook", express.raw({ type: "*/*" }), (req, res) => {
  const rawBody = req.body.toString("utf8");
  const result = verifyWebhook({
    rawBody,
    headers: req.headers,
    secret: process.env.UPTIMELY_WEBHOOK_SECRET!, // whsec_…
  });
  if (!result.valid) return res.status(401).end();
  const event = JSON.parse(rawBody);
  // handle event.type …
  res.status(204).end();
});
```

During secret rotation, pass both secrets: `secret: [newSecret, oldSecret]`.

## Configuration

```ts
const uptimely = new Uptimely({
  apiKey: "uptimely_…",           // default: process.env.UPTIMELY_API_KEY
  baseUrl: "https://app.getuptimely.com", // default (or UPTIMELY_BASE_URL)
  maxRetries: 2,                   // retry budget after the first attempt
  timeoutMs: 60_000,               // per-attempt timeout
  logger: console,                 // optional; credentials always redacted
});
```

Per-request overrides ride the last argument of every method:
`{ idempotencyKey, timeoutMs, maxRetries, headers, signal }`.

An escape hatch for endpoints the typed surface doesn't cover yet:

```ts
const { data, response } = await uptimely.request({
  method: "GET",
  path: "/v1/usage",
});
```

## License

[MIT](./LICENSE)
