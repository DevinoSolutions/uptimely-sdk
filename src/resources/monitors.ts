import type {
  createMonitorRoute,
  getMonitorRoute,
  listMonitorsRoute,
  monitorStatusHistoryRoute,
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

export type Monitor = RouteResult<typeof getMonitorRoute>;
export type ListMonitorsQuery = RouteQuery<typeof listMonitorsRoute>;
export type CreateMonitorBody = RouteBody<typeof createMonitorRoute>;
export type CreatedMonitor = RouteResult<typeof createMonitorRoute>;
export type MonitorStatusHistoryEntry = EnvelopeItem<
  RouteResult<typeof monitorStatusHistoryRoute>
>;
export type MonitorStatusHistoryQuery = RouteQuery<
  typeof monitorStatusHistoryRoute
>;

export class Monitors extends ApiResource {
  list(
    query?: ListMonitorsQuery,
    options?: RequestOptions,
  ): PagePromise<EnvelopeItem<RouteResult<typeof listMonitorsRoute>>> {
    return requestPage(this._core, {
      method: "GET",
      path: "/v1/monitors",
      query,
      options,
    });
  }

  retrieve(monitorId: string, options?: RequestOptions): Promise<Monitor> {
    return this._core.request({
      method: "GET",
      path: `/v1/monitors/${encodeURIComponent(monitorId)}`,
      options,
    });
  }

  /** Requires write access (PRO + AI-write-operations enabled). */
  create(
    body: CreateMonitorBody,
    options?: RequestOptions,
  ): Promise<CreatedMonitor> {
    return this._core.request({
      method: "POST",
      path: "/v1/monitors",
      body,
      idempotent: true,
      options,
    });
  }

  statusHistory(
    monitorId: string,
    query?: MonitorStatusHistoryQuery,
    options?: RequestOptions,
  ): PagePromise<MonitorStatusHistoryEntry> {
    return requestPage(this._core, {
      method: "GET",
      path: `/v1/monitors/${encodeURIComponent(monitorId)}/status-history`,
      query,
      options,
    });
  }
}
