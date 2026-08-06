/**
 * Pins the cursor-pagination contract (open-api D2/D9): auto-iteration
 * across pages, cursor+query preservation (the server 400s a cursor reused
 * with different params — re-sending the original query is load-bearing),
 * and the awaited-Page escape hatch.
 */
import { describe, expect, it } from "vitest";

import {
  TEST_BASE_URL,
  createQueuedFetch,
  listReply,
  makeTestClient,
} from "./support/mock-fetch";

const monitor = (id: string) => ({ id, name: `Monitor ${id}` });

function searchParamsOfCall(url: string | undefined): URLSearchParams {
  if (url === undefined) throw new Error("expected a recorded call url");
  return new URL(url).searchParams;
}

describe("for-await auto-iteration across pages", () => {
  it("walks all three queued pages in order and re-sends the original limit alongside each after cursor", async () => {
    const harness = createQueuedFetch([
      listReply([monitor("m-1"), monitor("m-2")], "cur_page2"),
      listReply([monitor("m-3"), monitor("m-4")], "cur_page3"),
      listReply([monitor("m-5")], null),
    ]);
    const client = makeTestClient(harness);

    const seenIds: string[] = [];
    for await (const item of client.monitors.list({ limit: 2 })) {
      seenIds.push(item.id);
    }

    expect(seenIds).toEqual(["m-1", "m-2", "m-3", "m-4", "m-5"]);
    expect(harness.calls).toHaveLength(3);

    const first = searchParamsOfCall(harness.calls[0]?.url);
    expect(first.get("limit")).toBe("2");
    expect(first.get("after")).toBeNull();

    const second = searchParamsOfCall(harness.calls[1]?.url);
    expect(second.get("after")).toBe("cur_page2");
    expect(second.get("limit")).toBe("2");

    const third = searchParamsOfCall(harness.calls[2]?.url);
    expect(third.get("after")).toBe("cur_page3");
    expect(third.get("limit")).toBe("2");

    expect(
      harness.calls.every((call) =>
        call.url.startsWith(`${TEST_BASE_URL}/v1/monitors`),
      ),
    ).toBe(true);
  });
});

describe("awaited Page escape hatch", () => {
  it("exposes data, hasMore and nextCursor on the awaited page, fetches page two via getNextPage, and returns null from getNextPage on the last page", async () => {
    const harness = createQueuedFetch([
      listReply([monitor("m-1"), monitor("m-2")], "cur_page2"),
      listReply([monitor("m-3")], null),
    ]);
    const client = makeTestClient(harness);

    const page = await client.monitors.list({ limit: 2 });
    expect(page.data.map((item) => item.id)).toEqual(["m-1", "m-2"]);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe("cur_page2");

    const nextPage = await page.getNextPage();
    expect(nextPage).not.toBeNull();
    expect(nextPage?.data.map((item) => item.id)).toEqual(["m-3"]);
    expect(nextPage?.hasMore).toBe(false);
    expect(nextPage?.nextCursor).toBeNull();

    expect(await nextPage?.getNextPage()).toBeNull();
    expect(harness.calls).toHaveLength(2);
  });

  it("crosses into the remaining pages when for-await iterating a resolved Page instance directly (Symbol.asyncIterator on Page)", async () => {
    const harness = createQueuedFetch([
      listReply([monitor("m-1"), monitor("m-2")], "cur_page2"),
      listReply([monitor("m-3")], null),
    ]);
    const client = makeTestClient(harness);

    const page = await client.monitors.list();
    const seenIds: string[] = [];
    for await (const item of page) {
      seenIds.push(item.id);
    }

    expect(seenIds).toEqual(["m-1", "m-2", "m-3"]);
    expect(harness.calls).toHaveLength(2);
  });
});

describe("single-page lists", () => {
  it("performs exactly one fetch when a status-pages list answers has_more false and next_cursor null", async () => {
    const harness = createQueuedFetch([
      listReply(
        [
          { id: "sp_1", name: "Public status" },
          { id: "sp_2", name: "Internal status" },
        ],
        null,
      ),
    ]);
    const client = makeTestClient(harness);

    const seenIds: string[] = [];
    for await (const statusPage of client.statusPages.list()) {
      seenIds.push(statusPage.id);
    }

    expect(seenIds).toEqual(["sp_1", "sp_2"]);
    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0]?.url).toBe(`${TEST_BASE_URL}/v1/status-pages`);
  });
});
