import type { listStatusPagesRoute } from "@uptimely/contracts";

import type {
  EnvelopeItem,
  RouteQuery,
  RouteResult,
} from "../core/contract-types";
import type { RequestOptions } from "../core/http";
import { requestPage, type PagePromise } from "../core/pagination";
import { ApiResource } from "./resource";

export type StatusPage = EnvelopeItem<RouteResult<typeof listStatusPagesRoute>>;
export type ListStatusPagesQuery = RouteQuery<typeof listStatusPagesRoute>;

export class StatusPages extends ApiResource {
  list(
    query?: ListStatusPagesQuery,
    options?: RequestOptions,
  ): PagePromise<StatusPage> {
    return requestPage(this._core, {
      method: "GET",
      path: "/v1/status-pages",
      query,
      options,
    });
  }
}
