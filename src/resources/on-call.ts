import type { getOnCallCurrentRoute } from "@uptimely/contracts";

import type { RouteResult } from "../core/contract-types";
import type { RequestOptions } from "../core/http";
import { ApiResource } from "./resource";

export type OnCallCurrent = RouteResult<typeof getOnCallCurrentRoute>;

export class OnCall extends ApiResource {
  /** Who is on call right now, per schedule. */
  current(options?: RequestOptions): Promise<OnCallCurrent> {
    return this._core.request({
      method: "GET",
      path: "/v1/on-call/current",
      options,
    });
  }
}
