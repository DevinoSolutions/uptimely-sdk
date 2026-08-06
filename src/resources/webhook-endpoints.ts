import type {
  createWebhookEndpointRoute,
  deleteWebhookEndpointRoute,
  getWebhookEndpointRoute,
  listWebhookDeliveriesRoute,
  listWebhookEndpointsRoute,
  rotateWebhookEndpointSecretRoute,
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

export type WebhookEndpoint = RouteResult<typeof getWebhookEndpointRoute>;
export type ListWebhookEndpointsQuery = RouteQuery<
  typeof listWebhookEndpointsRoute
>;
export type CreateWebhookEndpointBody = RouteBody<
  typeof createWebhookEndpointRoute
>;
/** Includes the `whsec_` signing secret — shown ONCE, store it securely. */
export type CreatedWebhookEndpoint = RouteResult<
  typeof createWebhookEndpointRoute
>;
export type DeletedWebhookEndpoint = RouteResult<
  typeof deleteWebhookEndpointRoute
>;
/** Includes the NEW `whsec_` secret — shown ONCE, store it securely. */
export type RotatedWebhookEndpointSecret = RouteResult<
  typeof rotateWebhookEndpointSecretRoute
>;
export type WebhookDelivery = EnvelopeItem<
  RouteResult<typeof listWebhookDeliveriesRoute>
>;
export type ListWebhookDeliveriesQuery = RouteQuery<
  typeof listWebhookDeliveriesRoute
>;

/** Outbound webhooks require write access to create/rotate/delete. */
export class WebhookEndpoints extends ApiResource {
  list(
    query?: ListWebhookEndpointsQuery,
    options?: RequestOptions,
  ): PagePromise<WebhookEndpoint> {
    return requestPage(this._core, {
      method: "GET",
      path: "/v1/webhook-endpoints",
      query,
      options,
    });
  }

  retrieve(
    endpointId: string,
    options?: RequestOptions,
  ): Promise<WebhookEndpoint> {
    return this._core.request({
      method: "GET",
      path: `/v1/webhook-endpoints/${encodeURIComponent(endpointId)}`,
      options,
    });
  }

  create(
    body: CreateWebhookEndpointBody,
    options?: RequestOptions,
  ): Promise<CreatedWebhookEndpoint> {
    return this._core.request({
      method: "POST",
      path: "/v1/webhook-endpoints",
      body,
      idempotent: true,
      options,
    });
  }

  delete(
    endpointId: string,
    options?: RequestOptions,
  ): Promise<DeletedWebhookEndpoint> {
    return this._core.request({
      method: "DELETE",
      path: `/v1/webhook-endpoints/${encodeURIComponent(endpointId)}`,
      options,
    });
  }

  /**
   * Rotate the signing secret. The previous secret keeps signing during the
   * grace window, so mid-rotation deliveries carry two signatures — pass
   * both secrets to the verifier while you roll your handler.
   */
  rotateSecret(
    endpointId: string,
    options?: RequestOptions,
  ): Promise<RotatedWebhookEndpointSecret> {
    return this._core.request({
      method: "POST",
      path: `/v1/webhook-endpoints/${encodeURIComponent(endpointId)}/rotate-secret`,
      idempotent: true,
      options,
    });
  }

  /** Newest-first delivery log for the endpoint (status, attempts, errors). */
  listDeliveries(
    endpointId: string,
    query?: ListWebhookDeliveriesQuery,
    options?: RequestOptions,
  ): PagePromise<WebhookDelivery> {
    return requestPage(this._core, {
      method: "GET",
      path: `/v1/webhook-endpoints/${encodeURIComponent(endpointId)}/deliveries`,
      query,
      options,
    });
  }
}
