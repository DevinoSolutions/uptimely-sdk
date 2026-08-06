import type {
  changeIncidentStateRoute,
  declareIncidentRoute,
  getIncidentRoute,
  listIncidentsRoute,
  saveIncidentPostmortemRoute,
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

export type Incident = EnvelopeItem<RouteResult<typeof listIncidentsRoute>>;
export type IncidentDetail = RouteResult<typeof getIncidentRoute>;
export type ListIncidentsQuery = RouteQuery<typeof listIncidentsRoute>;
export type DeclareIncidentBody = RouteBody<typeof declareIncidentRoute>;
export type DeclaredIncident = RouteResult<typeof declareIncidentRoute>;
export type ChangeIncidentStateBody = RouteBody<
  typeof changeIncidentStateRoute
>;
export type IncidentStateChange = RouteResult<typeof changeIncidentStateRoute>;
export type SaveIncidentPostmortemBody = RouteBody<
  typeof saveIncidentPostmortemRoute
>;
export type SavedIncidentPostmortem = RouteResult<
  typeof saveIncidentPostmortemRoute
>;

export class Incidents extends ApiResource {
  list(
    query?: ListIncidentsQuery,
    options?: RequestOptions,
  ): PagePromise<Incident> {
    return requestPage(this._core, {
      method: "GET",
      path: "/v1/incidents",
      query,
      options,
    });
  }

  retrieve(
    incidentId: string,
    options?: RequestOptions,
  ): Promise<IncidentDetail> {
    return this._core.request({
      method: "GET",
      path: `/v1/incidents/${encodeURIComponent(incidentId)}`,
      options,
    });
  }

  /** Declare an incident. Requires write access. */
  declare(
    body: DeclareIncidentBody,
    options?: RequestOptions,
  ): Promise<DeclaredIncident> {
    return this._core.request({
      method: "POST",
      path: "/v1/incidents",
      body,
      idempotent: true,
      options,
    });
  }

  /** Move the incident to another state (ack/resolve/…). Requires write access. */
  changeState(
    incidentId: string,
    body: ChangeIncidentStateBody,
    options?: RequestOptions,
  ): Promise<IncidentStateChange> {
    return this._core.request({
      method: "POST",
      path: `/v1/incidents/${encodeURIComponent(incidentId)}/state-changes`,
      body,
      idempotent: true,
      options,
    });
  }

  /**
   * Save (or clear, with an empty string) the incident's postmortem. PUT is
   * absolute-set and naturally idempotent — retried without a key.
   */
  savePostmortem(
    incidentId: string,
    body: SaveIncidentPostmortemBody,
    options?: RequestOptions,
  ): Promise<SavedIncidentPostmortem> {
    return this._core.request({
      method: "PUT",
      path: `/v1/incidents/${encodeURIComponent(incidentId)}/postmortem`,
      body,
      options,
    });
  }
}
