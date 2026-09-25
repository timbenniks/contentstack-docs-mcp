import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planIndex } from "./manifest.js";
import type { Manifest } from "./types.js";

const manifest: Manifest = {
  alpha: { hash: "same", url: "https://example.com/alpha" },
  beta: { hash: "old", url: "https://example.com/beta" },
  gone: { hash: "old", url: "https://example.com/gone" },
};

describe("manifest diffing", () => {
  it("skips unchanged documents, uploads changes and new pages, and removes missing ones", () => {
    const plan = planIndex({
      manifest,
      documents: [
        { id: "alpha", hash: "same" },
        { id: "beta", hash: "new" },
        { id: "gamma", hash: "fresh" },
      ],
      discoveredIds: new Set(["alpha", "beta", "gamma", "later"]),
    });
    assert.deepEqual(plan.skip, ["alpha"]);
    assert.deepEqual(plan.upsert, ["beta", "gamma"]);
    assert.deepEqual(plan.remove, ["gone"]);
  });

  it("re-uploads unchanged documents when forced", () => {
    const plan = planIndex({
      manifest,
      documents: [{ id: "alpha", hash: "same" }],
      discoveredIds: new Set(["alpha", "beta", "gone"]),
      force: true,
    });
    assert.deepEqual(plan.upsert, ["alpha"]);
    assert.deepEqual(plan.skip, []);
    assert.deepEqual(plan.remove, []);
  });

  it("does not remove documents outside a limited batch when they are still in the sitemap", () => {
    const plan = planIndex({
      manifest,
      documents: [{ id: "alpha", hash: "same" }],
      discoveredIds: new Set(["alpha", "beta", "gone"]),
    });
    assert.deepEqual(plan.remove, []);
  });

  it("does not treat an empty sitemap as every document disappearing", () => {
    const plan = planIndex({
      manifest,
      documents: [],
      discoveredIds: new Set(),
    });
    assert.deepEqual(plan.upsert, []);
    assert.deepEqual(plan.skip, []);
    assert.deepEqual(plan.remove, []);
  });
});
