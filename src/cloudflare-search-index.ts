import Cloudflare from "cloudflare";
import type { Document, SearchOptions, SearchResult, SearchIndex } from "./types.js";
import type { AppEnv } from "./env.js";

const SOURCE = "contentstack-developer-docs";
const METADATA_FIELDS = [
  { field_name: "source", data_type: "text" as const },
  { field_name: "url", data_type: "text" as const },
  { field_name: "markdownurl", data_type: "text" as const },
  { field_name: "title", data_type: "text" as const },
];

type IndexedItem = {
  id: string;
  key: string;
  status: string;
  error?: string;
};

export class CloudflareSearchIndex implements SearchIndex {
  private readonly client: Cloudflare;
  private readonly accountId: string;
  private readonly namespace: string;
  private readonly instanceId: string;
  private ready: Promise<void> | undefined;

  constructor(env: AppEnv, client?: Cloudflare) {
    this.accountId = env.CLOUDFLARE_ACCOUNT_ID;
    this.namespace = env.CLOUDFLARE_AI_SEARCH_NAMESPACE;
    this.instanceId = env.CLOUDFLARE_AI_SEARCH_INSTANCE;
    this.client =
      client ??
      new Cloudflare({
        apiToken: env.CLOUDFLARE_API_TOKEN,
      });
  }

  async upsert(document: Document): Promise<void> {
    await this.ensureInstance();
    const currentKey = itemKey(document.id);
    const nextKey = nextItemKey(document.id);
    const current = await this.findByKey(currentKey);
    const next = await this.findByKey(nextKey);
    if (current && next) await this.deleteItem(next.id);

    const existing = current ?? next;
    const key = !existing || existing.key === nextKey ? currentKey : nextKey;

    const uploaded = await this.client.aiSearch.namespaces.instances.items.upload(this.instanceId, {
      account_id: this.accountId,
      name: this.namespace,
      file: {
        file: await Cloudflare.toFile(
          new Blob([document.content], { type: "text/markdown" }),
          key,
        ),
        metadata: JSON.stringify({
          source: SOURCE,
          url: document.url,
          markdownurl: document.markdownUrl,
          title: document.title,
        }),
        wait_for_completion: true,
      },
    });
    await this.waitUntilSettled(uploaded);
    if (existing) await this.deleteItem(existing.id);
  }

  async remove(id: string): Promise<void> {
    await this.ensureInstance();
    const current = await this.findByKey(itemKey(id));
    const next = await this.findByKey(nextItemKey(id));
    if (current) await this.deleteItem(current.id);
    if (next) await this.deleteItem(next.id);
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const limit = clampLimit(options?.limit);
    const response = await this.client.aiSearch.namespaces.instances.search(this.instanceId, {
      account_id: this.accountId,
      name: this.namespace,
      query,
      ai_search_options: {
        retrieval: {
          max_num_results: limit,
          retrieval_type: "hybrid",
        },
      },
    });

    const best = new Map<string, SearchResult>();
    for (const chunk of response.chunks ?? []) {
      const metadata = chunk.item?.metadata ?? {};
      const url = stringField(metadata, "url") || chunk.item?.key || "";
      const current: SearchResult = {
        title: stringField(metadata, "title") || titleFromText(chunk.text) || url,
        url,
        markdownUrl: stringField(metadata, "markdownurl") || undefined,
        text: chunk.text.trim(),
        score: chunk.score,
      };
      const previous = best.get(url);
      if (!previous || (current.score ?? 0) > (previous.score ?? 0)) best.set(url, current);
    }
    return [...best.values()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, limit);
  }

  private async ensureInstance(): Promise<void> {
    this.ready ??= this.prepareInstance();
    await this.ready;
  }

  private async prepareInstance(): Promise<void> {
    try {
      const instance = await this.client.aiSearch.namespaces.instances.read(this.instanceId, {
        account_id: this.accountId,
        name: this.namespace,
      });
      const fields = new Set((instance.custom_metadata ?? []).map((field) => field.field_name.toLowerCase()));
      const missing = METADATA_FIELDS.some((field) => !fields.has(field.field_name));
      if (missing) {
        await this.client.aiSearch.namespaces.instances.update(this.instanceId, {
          account_id: this.accountId,
          name: this.namespace,
          custom_metadata: METADATA_FIELDS,
        });
      }
    } catch (error) {
      if (!isNotFound(error)) throw error;
      await this.client.aiSearch.namespaces.instances.create(this.namespace, {
        account_id: this.accountId,
        id: this.instanceId,
        custom_metadata: METADATA_FIELDS,
      });
    }
  }

  private async findByKey(key: string): Promise<IndexedItem | undefined> {
    const page = await this.client.aiSearch.namespaces.instances.items.list(this.instanceId, {
      account_id: this.accountId,
      name: this.namespace,
      key,
      source: "builtin",
    });
    const item = page.result?.[0];
    if (!item) return undefined;
    return { id: item.id, key: item.key, status: item.status, error: item.error };
  }

  private async deleteItem(itemId: string): Promise<void> {
    await this.client.aiSearch.namespaces.instances.items.delete(itemId, {
      account_id: this.accountId,
      name: this.namespace,
      id: this.instanceId,
    });
  }

  private async waitUntilSettled(item: IndexedItem): Promise<void> {
    let current = item;
    const deadline = Date.now() + 60_000;
    while ((current.status === "queued" || current.status === "running") && Date.now() < deadline) {
      await delay(2_000);
      const info = await this.client.aiSearch.namespaces.instances.items.get(current.id, {
        account_id: this.accountId,
        name: this.namespace,
        id: this.instanceId,
      });
      current = { id: info.id, key: info.key, status: info.status, error: info.error };
    }
    if (current.status === "error") {
      throw new Error(current.error || `Indexing failed for ${current.key}`);
    }
  }
}

export function itemKey(id: string): string {
  return `${id}.md`;
}

function nextItemKey(id: string): string {
  return `${id}.next.md`;
}

function stringField(metadata: { [key: string]: unknown }, key: string): string {
  const value = metadata[key] ?? metadata[key.toLowerCase()];
  return typeof value === "string" ? value : "";
}

function titleFromText(text: string): string {
  const heading = text.match(/^#\s+(.+?)\s*$/m);
  return heading?.[1]?.trim() ?? "";
}

function clampLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) return 5;
  return Math.min(50, Math.max(1, Math.floor(limit)));
}

function isNotFound(error: unknown): boolean {
  return error instanceof Cloudflare.APIError && error.status === 404;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
