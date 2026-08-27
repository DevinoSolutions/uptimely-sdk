import type {
  attachStatusPageResourceRoute,
  createStatusPageRoute,
  deleteStatusPageRoute,
  detachStatusPageResourceRoute,
  listStatusPageResourcesRoute,
  listStatusPagesRoute,
  updateStatusPageRoute,
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

export type StatusPage = EnvelopeItem<RouteResult<typeof listStatusPagesRoute>>;
export type ListStatusPagesQuery = RouteQuery<typeof listStatusPagesRoute>;
export type CreateStatusPageBody = RouteBody<typeof createStatusPageRoute>;
export type UpdateStatusPageBody = RouteBody<typeof updateStatusPageRoute>;
export type DeletedStatusPage = RouteResult<typeof deleteStatusPageRoute>;
export type StatusPageResource = EnvelopeItem<
  RouteResult<typeof listStatusPageResourcesRoute>
>;
export type ListStatusPageResourcesQuery = RouteQuery<
  typeof listStatusPageResourcesRoute
>;
export type AttachStatusPageResourceBody = RouteBody<
  typeof attachStatusPageResourceRoute
>;
export type DetachedStatusPageResource = RouteResult<
  typeof detachStatusPageResourceRoute
>;

/** Creating, editing and deleting pages requires write access. */
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

  /**
   * Create a status page. The `slug` is the public /status/<slug> address and
   * is unique across all of Uptimely — omit it and one is derived from the
   * name; a taken one comes back as a `validation_failed` problem.
   */
  create(
    body: CreateStatusPageBody,
    options?: RequestOptions,
  ): Promise<StatusPage> {
    return this._core.request({
      method: "POST",
      path: "/v1/status-pages",
      body,
      idempotent: true,
      options,
    });
  }

  /** Change name, description or visibility. The slug is not editable. */
  update(
    statusPageId: string,
    body: UpdateStatusPageBody,
    options?: RequestOptions,
  ): Promise<StatusPage> {
    return this._core.request({
      method: "PATCH",
      path: `/v1/status-pages/${encodeURIComponent(statusPageId)}`,
      body,
      options,
    });
  }

  /** Delete the page and disconnect the custom domains pointing at it. */
  delete(
    statusPageId: string,
    options?: RequestOptions,
  ): Promise<DeletedStatusPage> {
    return this._core.request({
      method: "DELETE",
      path: `/v1/status-pages/${encodeURIComponent(statusPageId)}`,
      options,
    });
  }

  /** The monitors the page shows, in display order, with their resource ids. */
  listResources(
    statusPageId: string,
    query?: ListStatusPageResourcesQuery,
    options?: RequestOptions,
  ): PagePromise<StatusPageResource> {
    return requestPage(this._core, {
      method: "GET",
      path: `/v1/status-pages/${encodeURIComponent(statusPageId)}/resources`,
      query,
      options,
    });
  }

  /** Add a monitor to the end of the page's list. */
  attachResource(
    statusPageId: string,
    body: AttachStatusPageResourceBody,
    options?: RequestOptions,
  ): Promise<StatusPageResource> {
    return this._core.request({
      method: "POST",
      path: `/v1/status-pages/${encodeURIComponent(statusPageId)}/resources`,
      body,
      idempotent: true,
      options,
    });
  }

  /** Take a monitor off the page. The monitor itself is untouched. */
  detachResource(
    statusPageId: string,
    resourceId: string,
    options?: RequestOptions,
  ): Promise<DetachedStatusPageResource> {
    return this._core.request({
      method: "DELETE",
      path: `/v1/status-pages/${encodeURIComponent(statusPageId)}/resources/${encodeURIComponent(resourceId)}`,
      options,
    });
  }
}
