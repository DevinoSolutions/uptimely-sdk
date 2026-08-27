import type {
  createMonitorRoute,
  deleteMonitorRoute,
  getMonitorRoute,
  listMonitorsRoute,
  monitorStatusHistoryRoute,
  updateMonitorRoute,
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
export type UpdateMonitorBody = RouteBody<typeof updateMonitorRoute>;
export type DeletedMonitor = RouteResult<typeof deleteMonitorRoute>;
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

  /**
   * Change a monitor's editable fields. Omitted fields are left untouched;
   * `description` accepts null to clear it. Requires write access.
   */
  update(
    monitorId: string,
    body: UpdateMonitorBody,
    options?: RequestOptions,
  ): Promise<Monitor> {
    return this._core.request({
      method: "PATCH",
      path: `/v1/monitors/${encodeURIComponent(monitorId)}`,
      body,
      options,
    });
  }

  /**
   * Delete a monitor: probing stops and any alert it auto-raised is resolved.
   * To silence one temporarily without losing its uptime record, mute it.
   * Requires write access.
   */
  delete(monitorId: string, options?: RequestOptions): Promise<DeletedMonitor> {
    return this._core.request({
      method: "DELETE",
      path: `/v1/monitors/${encodeURIComponent(monitorId)}`,
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
