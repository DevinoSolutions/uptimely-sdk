/**
 * @uptimely/sdk — official TypeScript SDK for the Uptimely public API.
 *
 * Browser-safe entry: no `node:` imports. The Standard Webhooks signature
 * verifier for YOUR server lives in the `@uptimely/sdk/webhooks` subpath
 * (node:crypto).
 */
export {
  DEFAULT_BASE_URL,
  DEFAULT_MAX_RETRIES,
  DEFAULT_MAX_RETRY_AFTER_SECONDS,
  DEFAULT_TIMEOUT_MS,
  Uptimely,
  type UptimelyOptions,
} from "./client";
export type { ApiResponse, HttpMethod, RequestOptions } from "./core/http";
export type { SdkLogger } from "./core/logger";
export { Page, PagePromise, type ListEnvelope } from "./core/pagination";
export {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  ConflictError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  UnprocessableEntityError,
  UptimelyError,
  parseRetryAfterSeconds,
  type ApiProblemCode,
} from "./error";
export { VERSION } from "./version";

// Wire types — problem documents come straight from the contracts package
// (the SAME zod schemas the server validates with).
export type { FieldError, Problem, ProblemCode } from "@uptimely/contracts";

// Per-resource request/response types.
export type {
  Alert,
  AlertStateChange,
  ChangeAlertStateBody,
  CreateAlertBody,
  CreatedAlert,
  ListAlertsQuery,
} from "./resources/alerts";
export type {
  ChangeIncidentStateBody,
  DeclareIncidentBody,
  DeclaredIncident,
  Incident,
  IncidentDetail,
  IncidentStateChange,
  ListIncidentsQuery,
  SaveIncidentPostmortemBody,
  SavedIncidentPostmortem,
} from "./resources/incidents";
export type {
  CreateMonitorBody,
  CreatedMonitor,
  ListMonitorsQuery,
  Monitor,
  MonitorStatusHistoryEntry,
  MonitorStatusHistoryQuery,
} from "./resources/monitors";
export type { OnCallCurrent } from "./resources/on-call";
export type {
  ListScheduledMaintenancesQuery,
  ScheduledMaintenance,
} from "./resources/scheduled-maintenances";
export type {
  ListStatusPagesQuery,
  StatusPage,
} from "./resources/status-pages";
export type { Usage } from "./resources/usage";
export type {
  CreateWebhookEndpointBody,
  CreatedWebhookEndpoint,
  DeletedWebhookEndpoint,
  ListWebhookDeliveriesQuery,
  ListWebhookEndpointsQuery,
  RotatedWebhookEndpointSecret,
  WebhookDelivery,
  WebhookEndpoint,
} from "./resources/webhook-endpoints";

export { Uptimely as default } from "./client";
