import { parseArgs } from "node:util";
import { CloudflareSearchIndex } from "./cloudflare-search-index.js";
import { readEnv } from "./env.js";
import { hashContent } from "./hash.js";
import { loadManifest, planIndex, saveManifest } from "./manifest.js";
import { extractTitle, fetchMarkdown } from "./markdown.js";
import { developerDocPages, fetchSitemap, parseSitemapLocs } from "./sitemap.js";
import type { Document } from "./types.js";

const args = parseArgs({
  options: {
    limit: { type: "string" },
    force: { type: "boolean", default: false },
  },
});

const limit = args.values.limit === undefined ? undefined : Number(args.values.limit);
if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
  throw new Error("--limit must be a positive integer");
}

const xml = await fetchSitemap();
const pages = developerDocPages(parseSitemapLocs(xml));
if (pages.length === 0) {
  throw new Error(
    "Sitemap contained no developer documentation pages; refusing to update the index",
  );
}
console.log(`Found ${pages.length} developer documentation pages`);

const selected = limit === undefined ? pages : pages.slice(0, limit);
console.log(
  limit === undefined
    ? `Indexing ${selected.length} pages`
    : `Indexing ${selected.length} of ${pages.length} pages`,
);

const discoveredIds = new Set(pages.map((page) => page.id));
const manifest = await loadManifest();
const documents = new Map<string, Document & { hash: string }>();
let failed = 0;

for (const [position, page] of selected.entries()) {
  const label = `[${position + 1}/${selected.length}]`;
  try {
    const fetched = await fetchMarkdown(page.markdownUrl);
    if (fetched.status === 404 || fetched.status === 410) {
      console.log(`${label} missing ${page.url}`);
      continue;
    }
    if (fetched.status >= 400) {
      failed += 1;
      console.log(`${label} failed ${page.url} (HTTP ${fetched.status})`);
      continue;
    }
    const content = fetched.content.trim();
    if (!content) {
      console.log(`${label} empty ${page.url}`);
      continue;
    }
    const title = extractTitle(fetched.content) || page.id;
    const hash = hashContent(fetched.content);
    documents.set(page.id, {
      id: page.id,
      url: page.url,
      markdownUrl: page.markdownUrl,
      title,
      content: fetched.content,
      hash,
    });
    console.log(`${label} fetched ${title}`);
  } catch (error) {
    failed += 1;
    console.log(`${label} failed ${page.url} (${errorMessage(error)})`);
  }
}

const index = new CloudflareSearchIndex(readEnv());
const plan = planIndex({
  manifest,
  documents: [...documents.values()].map((document) => ({ id: document.id, hash: document.hash })),
  discoveredIds,
  force: args.values.force,
});

let uploaded = 0;
let removed = 0;

for (const id of plan.remove) {
  const url = manifest[id]?.url ?? id;
  try {
    await index.remove(id);
    delete manifest[id];
    removed += 1;
    console.log(`removed ${url}`);
  } catch (error) {
    failed += 1;
    console.log(`failed to remove ${url} (${errorMessage(error)})`);
  }
}

for (const id of plan.skip) {
  const document = documents.get(id);
  console.log(`unchanged ${document?.title ?? id}`);
}

for (const id of plan.upsert) {
  const document = documents.get(id);
  if (!document) continue;
  try {
    await index.upsert(document);
    manifest[id] = { hash: document.hash, url: document.url };
    uploaded += 1;
    console.log(`uploaded ${document.title}`);
  } catch (error) {
    failed += 1;
    console.log(`failed ${document.url} (${errorMessage(error)})`);
  }
}

await saveManifest(manifest);
console.log(
  `Done. uploaded=${uploaded} skipped=${plan.skip.length} removed=${removed} failed=${failed}`,
);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
