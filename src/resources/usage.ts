import type { getUsageRoute } from "@uptimely/contracts";

import type { RouteResult } from "../core/contract-types";
import type { RequestOptions } from "../core/http";
import { ApiResource } from "./resource";

export type Usage = RouteResult<typeof getUsageRoute>;

export class UsageResource extends ApiResource {
  /** Plan, period bounds and metered usage. NEVER charges quota or denies. */
  retrieve(options?: RequestOptions): Promise<Usage> {
    return this._core.request({ method: "GET", path: "/v1/usage", options });
  }
}
