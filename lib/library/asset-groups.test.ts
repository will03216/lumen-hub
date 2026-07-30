/**
 * Unit tests for the BytePlus asset-group store.
 *
 * The Groups panel backfills pages 2..n in the background while the user is
 * already looking at (and clicking) the list, so two properties matter:
 *  - bulk import commits ONCE, not once per group (per-group commits were
 *    O(n²): a full serialise + listener fan-out for every one of 5k groups)
 *  - list order is derived from the group's real CreateTime, so a group's
 *    position never depends on which page it happened to arrive on
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetForTests,
  addAssetGroup,
  addAssetGroups,
  listAssetGroups,
  subscribeAssetGroups,
} from "./asset-groups";

// Newest first, mirroring the API: index 0 is the most recent group.
const idOf = (n: number) => `group-${String(n).padStart(5, "0")}`;
const createTimeOf = (n: number) =>
  new Date(Date.UTC(2026, 6, 30) - n * 60_000).toISOString();
const pageOf = (start: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({
    byteplusGroupId: idOf(start + i),
    name: `Group ${start + i}`,
    createTime: createTimeOf(start + i),
  }));

describe("asset-group store", () => {
  beforeEach(() => __resetForTests());
  afterEach(() => vi.restoreAllMocks());

  it("commits once per bulk import, not once per group", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAssetGroups(listener);

    addAssetGroups(pageOf(0, 500));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listAssetGroups()).toHaveLength(500);
    unsubscribe();
  });

  it("is a no-op for an empty batch", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAssetGroups(listener);

    addAssetGroups([]);

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("orders by CreateTime, independent of the page a group arrived on", () => {
    // Import out of order — page 3, then page 1, then page 2.
    addAssetGroups(pageOf(200, 100));
    addAssetGroups(pageOf(0, 100));
    addAssetGroups(pageOf(100, 100));

    const ids = listAssetGroups().map((g) => g.id);
    expect(ids).toHaveLength(300);
    // Newest (index 0) first, regardless of insertion order.
    expect(ids.slice(0, 3)).toEqual([idOf(0), idOf(1), idOf(2)]);
    expect(ids.at(-1)).toBe(idOf(299));
  });

  it("keeps the head of the list stable as later pages stream in", () => {
    addAssetGroups(pageOf(0, 100));
    const topAfterFirstPage = listAssetGroups()[0].id;

    for (let page = 1; page < 10; page++) addAssetGroups(pageOf(page * 100, 100));

    // A backfilled page must never displace the top of the list — that is what
    // made rows slide out from under the cursor mid-click.
    expect(listAssetGroups()[0].id).toBe(topAfterFirstPage);
  });

  it("re-importing the same page does not reorder the list", () => {
    addAssetGroups(pageOf(0, 200));
    const before = listAssetGroups().map((g) => g.id);

    addAssetGroups(pageOf(0, 200)); // a second sync pass

    expect(listAssetGroups().map((g) => g.id)).toEqual(before);
    expect(listAssetGroups()).toHaveLength(200);
  });

  it("falls back to insertion time when the server omits CreateTime", () => {
    addAssetGroups([{ byteplusGroupId: "no-time", name: "No time" }]);
    const [group] = listAssetGroups();

    expect(group.id).toBe("no-time");
    expect(Number.isFinite(group.createdAt)).toBe(true);
  });

  it("sorts a locally created group above older backfilled ones", () => {
    addAssetGroups(pageOf(0, 100));
    const created = addAssetGroup({ byteplusGroupId: "brand-new", name: "Brand new" });

    // addAssetGroup stamps Date.now(), which is later than every seeded
    // CreateTime, so a just-created group surfaces at the top where the user
    // expects to find it.
    expect(created.id).toBe("brand-new");
    expect(listAssetGroups()[0].id).toBe("brand-new");
  });
});
