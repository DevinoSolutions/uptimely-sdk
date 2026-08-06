import type {
  changeAlertStateRoute,
  createAlertRoute,
  listAlertsRoute,
} from "@uptimely/contracts";

import type {
  EnvelopeItem,
  RouteBody,
  RouteQuery,
  RouteResult,
} from "../core/contract-types";
import type { RequestOptions } from "../core/http";
import { requestPage, type PagePromise } from "../core/pagination";
import { ApiResource } from "./resource";

export type Alert = EnvelopeItem<RouteResult<typeof listAlertsRoute>>;
export type ListAlertsQuery = RouteQuery<typeof listAlertsRoute>;
export type CreateAlertBody = RouteBody<typeof createAlertRoute>;
export type CreatedAlert = RouteResult<typeof createAlertRoute>;
export type ChangeAlertStateBody = RouteBody<typeof changeAlertStateRoute>;
export type AlertStateChange = RouteResult<typeof changeAlertStateRoute>;

export class Alerts extends ApiResource {
  list(query?: ListAlertsQuery, options?: RequestOptions): PagePromise<Alert> {
    return requestPage(this._core, {
      method: "GET",
      path: "/v1/alerts",
      query,
      options,
    });
  }

  /** Requires write access (PRO + AI-write-operations enabled). */
  create(
    body: CreateAlertBody,
    options?: RequestOptions,
  ): Promise<CreatedAlert> {
    return this._core.request({
      method: "POST",
      path: "/v1/alerts",
      body,
      idempotent: true,
      options,
    });
  }

  /** Move the alert to another state (ack/resolve/…). Requires write access. */
  changeState(
    alertId: string,
    body: ChangeAlertStateBody,
    options?: RequestOptions,
  ): Promise<AlertStateChange> {
    return this._core.request({
      method: "POST",
      path: `/v1/alerts/${encodeURIComponent(alertId)}/state-changes`,
      body,
      idempotent: true,
      options,
    });
  }
}
