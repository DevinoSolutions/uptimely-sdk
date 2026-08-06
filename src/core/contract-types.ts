/**
 * Type plumbing that derives every method signature DIRECTLY from the
 * `definePublicRoute` descriptors in `@uptimely/contracts` — the same objects
 * that build the server handler and the OpenAPI spec (open-api D7). A
 * wire-contract change recompiles into the SDK types with zero hand-kept
 * parallel copies; these helpers are erased at build time (`import type`).
 */
import type { z } from "zod";

/** `z.input` of a route's query schema (defaults optional), or `never`. */
export type RouteQuery<R> = R extends {
  request: { query: infer Q extends z.ZodType };
}
  ? z.input<Q>
  : never;

/** `z.input` of a route's body schema, or `never` when the op has no body. */
export type RouteBody<R> = R extends {
  request: { body: infer B extends z.ZodType };
}
  ? z.input<B>
  : never;

/** Union of a route's declared success-response payload types. */
export type RouteResult<R> = R extends { responses: infer Rs }
  ? {
      [K in keyof Rs]: Rs[K] extends { schema: infer S extends z.ZodType }
        ? z.output<S>
        : void;
    }[keyof Rs]
  : never;

/** Item type of a `{ data, has_more, next_cursor }` list envelope. */
export type EnvelopeItem<E> = E extends { data: (infer Item)[] } ? Item : never;
