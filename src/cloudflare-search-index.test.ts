import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Cloudflare from "cloudflare";
import { CloudflareSearchIndex, itemKey } from "./cloudflare-search-index.js";
import type { AppEnv } from "./env.js";
import type { Document } from "./types.js";

const env: AppEnv = {
  CLOUDFLARE_ACCOUNT_ID: "acct",
  CLOUDFLARE_API_TOKEN: "token",
  CLOUDFLARE_AI_SEARCH_INSTANCE: "docs",
  CLOUDFLARE_AI_SEARCH_NAMESPACE: "default",
};

const document: Document = {
  id: "docs-foo",
  url: "https://www.contentstack.com/docs/developers/foo",
  markdownUrl: "https://www.contentstack.com/docs/developers/foo.md",
  title: "Foo",
  content: "# Foo\n",
};

describe("CloudflareSearchIndex.upsert", () => {
  it("uploads a replacement before deleting the current item", async () => {
    const items = new Map([
      [
        itemKey(document.id),
        { id: "old-id", key: itemKey(document.id), status: "complete" as const },
      ],
    ]);
    const calls: string[] = [];
    const index = new CloudflareSearchIndex(env, fakeClient(items, calls));

    await index.upsert(document);

    assert.deepEqual(calls, ["upload:docs-foo.next.md", "delete:old-id"]);
    assert.equal(items.has(itemKey(document.id)), false);
    assert.equal(items.get("docs-foo.next.md")?.status, "complete");
  });

  it("keeps the current item when the replacement upload fails", async () => {
    const items = new Map([
      [
        itemKey(document.id),
        { id: "old-id", key: itemKey(document.id), status: "complete" as const },
      ],
    ]);
    const calls: string[] = [];
    const index = new CloudflareSearchIndex(
      env,
      fakeClient(items, calls, { uploadError: new Error("upload failed") }),
    );

    await assert.rejects(() => index.upsert(document), /upload failed/);
    assert.deepEqual(calls, ["upload:docs-foo.next.md"]);
    assert.equal(items.get(itemKey(document.id))?.id, "old-id");
  });

  it("keeps the current item when replacement indexing fails", async () => {
    const items = new Map([
      [
        itemKey(document.id),
        { id: "old-id", key: itemKey(document.id), status: "complete" as const },
      ],
    ]);
    const calls: string[] = [];
    const index = new CloudflareSearchIndex(
      env,
      fakeClient(items, calls, { uploadStatus: "error", uploadErrorMessage: "embed failed" }),
    );

    await assert.rejects(() => index.upsert(document), /embed failed/);
    assert.deepEqual(calls, ["upload:docs-foo.next.md"]);
    assert.equal(items.get(itemKey(document.id))?.id, "old-id");
  });
});

describe("CloudflareSearchIndex.remove", () => {
  it("deletes both the current and replacement slots", async () => {
    const items = new Map([
      [itemKey(document.id), { id: "current-id", key: itemKey(document.id), status: "complete" as const }],
      ["docs-foo.next.md", { id: "next-id", key: "docs-foo.next.md", status: "complete" as const }],
    ]);
    const calls: string[] = [];
    const index = new CloudflareSearchIndex(env, fakeClient(items, calls));

    await index.remove(document.id);

    assert.deepEqual(calls, ["delete:current-id", "delete:next-id"]);
    assert.equal(items.size, 0);
  });
});

type StoredItem = {
  id: string;
  key: string;
  status: string;
  error?: string;
};

function fakeClient(
  items: Map<string, StoredItem>,
  calls: string[],
  options?: { uploadError?: Error; uploadStatus?: string; uploadErrorMessage?: string },
): Cloudflare {
  let nextId = 1;
  return {
    aiSearch: {
      namespaces: {
        instances: {
          read: async () => ({
            custom_metadata: [
              { field_name: "source" },
              { field_name: "url" },
              { field_name: "markdownurl" },
              { field_name: "title" },
            ],
          }),
          items: {
            list: async (_instanceId: string, params: { key?: string }) => ({
              result: params.key && items.has(params.key) ? [items.get(params.key)] : [],
            }),
            upload: async (_instanceId: string, params: { file: { file: { name?: string } } }) => {
              const key = params.file.file.name ?? `upload-${nextId}.md`;
              calls.push(`upload:${key}`);
              if (options?.uploadError) throw options.uploadError;
              const item: StoredItem = {
                id: `new-${nextId++}`,
                key,
                status: options?.uploadStatus ?? "complete",
                error: options?.uploadErrorMessage,
              };
              items.set(key, item);
              return item;
            },
            delete: async (itemId: string) => {
              calls.push(`delete:${itemId}`);
              for (const [key, item] of items) {
                if (item.id === itemId) items.delete(key);
              }
            },
            get: async (itemId: string) => {
              for (const item of items.values()) {
                if (item.id === itemId) return item;
              }
              throw new Error(`missing item ${itemId}`);
            },
          },
        },
      },
    },
  } as unknown as Cloudflare;
}
