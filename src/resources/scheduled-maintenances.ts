import type { listScheduledMaintenancesRoute } from "@uptimely/contracts";

import type {
  EnvelopeItem,
  RouteQuery,
  RouteResult,
} from "../core/contract-types";
import type { RequestOptions } from "../core/http";
import { requestPage, type PagePromise } from "../core/pagination";
import { ApiResource } from "./resource";

export type ScheduledMaintenance = EnvelopeItem<
  RouteResult<typeof listScheduledMaintenancesRoute>
>;
export type ListScheduledMaintenancesQuery = RouteQuery<
  typeof listScheduledMaintenancesRoute
>;

export class ScheduledMaintenances extends ApiResource {
  list(
    query?: ListScheduledMaintenancesQuery,
    options?: RequestOptions,
  ): PagePromise<ScheduledMaintenance> {
    return requestPage(this._core, {
      method: "GET",
      path: "/v1/scheduled-maintenances",
      query,
      options,
    });
  }
}
