/**
 * Cursor pagination (open-api D2): every /v1 list responds with
 * `{ data, has_more, next_cursor }`; the next page is the SAME query plus
 * `after=next_cursor` — `Page` re-sends the original query verbatim.
 *
 * Two consumption styles (open-api D9):
 * - auto-iteration: `for await (const m of client.monitors.list())` walks
 *   every page transparently;
 * - page escape hatch: `const page = await client.monitors.list()` then
 *   `page.data` / `page.getNextPage()`.
 */
import type { HttpCore, RequestParams } from "./http";

export interface ListEnvelope<Item> {
  data: Item[];
  has_more: boolean;
  next_cursor: string | null;
}

export class Page<Item> implements AsyncIterable<Item> {
  /** The current page of results. */
  readonly data: Item[];
  /** True when another page exists after this one. */
  readonly hasMore: boolean;
  /** Opaque cursor for the next page; null on the last page. */
  readonly nextCursor: string | null;

  constructor(
    private readonly core: HttpCore,
    private readonly params: RequestParams,
    envelope: ListEnvelope<Item>,
  ) {
    this.data = envelope.data;
    this.hasMore = envelope.has_more;
    this.nextCursor = envelope.next_cursor;
  }

  /** Fetch the next page with the same query, or null on the last page. */
  async getNextPage(): Promise<Page<Item> | null> {
    if (!this.hasMore || this.nextCursor === null) return null;
    const nextParams: RequestParams = {
      ...this.params,
      query: { ...this.params.query, after: this.nextCursor },
    };
    const envelope = await this.core.request<ListEnvelope<Item>>(nextParams);
    return new Page(this.core, nextParams, envelope);
  }

  /** Iterate every item on this page, then every following page. */
  async *[Symbol.asyncIterator](): AsyncIterator<Item> {
    yield* this.data;
    let next = await this.getNextPage();
    while (next !== null) {
      yield* next.data;
      next = await next.getNextPage();
    }
  }
}

/**
 * Awaitable AND async-iterable handle returned by every list method:
 * `await client.monitors.list()` resolves to a `Page`, while
 * `for await (const m of client.monitors.list())` streams items across pages.
 */
export class PagePromise<Item>
  implements PromiseLike<Page<Item>>, AsyncIterable<Item>
{
  constructor(private readonly promise: Promise<Page<Item>>) {}

  // oxlint-disable-next-line unicorn/no-thenable -- being thenable IS this class's contract: `await list()` must resolve to a Page while the same handle stays async-iterable, open-api D9 pagination ergonomics (2026-08-06)
  then<TResult1 = Page<Item>, TResult2 = never>(
    onfulfilled?:
      ((value: Page<Item>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<Page<Item> | TResult> {
    return this.promise.catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<Page<Item>> {
    return this.promise.finally(onfinally);
  }

  async *[Symbol.asyncIterator](): AsyncIterator<Item> {
    const page = await this.promise;
    yield* page;
  }
}

/** Shared list-request helper used by every resource. */
export function requestPage<Item>(
  core: HttpCore,
  params: RequestParams,
): PagePromise<Item> {
  return new PagePromise(
    core
      .request<ListEnvelope<Item>>(params)
      .then((envelope) => new Page(core, params, envelope)),
  );
}
