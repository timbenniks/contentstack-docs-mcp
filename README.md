# Contentstack developer docs search

Indexes Contentstack developer documentation into Cloudflare AI Search. Cloudflare hosts retrieval and the public MCP endpoint.

```text
Contentstack sitemap
        ↓
filter /docs/developers/
        ↓
convert URL to .md endpoint
        ↓
fetch Markdown
        ↓
Cloudflare AI Search
        ↓
MCP search
```

Cloudflare AI Search chunks, embeds, and ranks the Markdown. This project does not add another database or generate answers.

## Setup

```bash
pnpm install
cp .env.example .env
```

Create a Cloudflare API token with **Account > AI Search > Edit**.

```env
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_AI_SEARCH_INSTANCE=contentstack-developer-docs
CLOUDFLARE_AI_SEARCH_NAMESPACE=default
```

`CLOUDFLARE_AI_SEARCH_INDEX` is accepted as an alias for the instance name. The indexer creates the instance in the `default` namespace when it does not already exist. The instance uses AI Search built-in storage, with metadata fields `source`, `url`, `markdownurl`, and `title`.

## Index

```bash
pnpm index-docs --limit 10
pnpm index-docs
pnpm index-docs --force
```

The first run prints how many `/docs/developers/` pages are in `https://www.contentstack.com/sitemap-docs.xml`, then fetches each page's `.md` endpoint. `--limit` indexes the first N pages in sitemap order. It does not delete pages that are still in the sitemap but outside that batch.

The first pages are Administration API references. The Content Management API tokens page is further down the sitemap, so a 10-page sample does not include it. Raise the limit or run a full index before judging that query.

A local `.index-manifest.json` stores the SHA-256 hash and URL of each uploaded document. Later runs skip unchanged pages, re-upload changed or new pages, and delete documents that disappeared from the sitemap.

There are about 699 developer pages. Start with `--limit 10`.

## Search

```bash
pnpm search-docs "How do I create a management token?"
pnpm search-docs --limit 5 "content management API authentication"
```

Results include the title, original documentation URL, a text passage, and the relevance score. No answer is generated.

Indexing can take a short time after upload. If a search returns nothing, wait and run it again.

## MCP

Cloudflare serves the MCP endpoint for the `contentstack-developer-docs` instance:

```text
https://4cdabb7e-44af-497b-99a4-582049010959.search.ai.cloudflare.com/mcp
```

Clients call the built-in `search` tool. This repository does not run an MCP server.

## Tests

```bash
pnpm test
pnpm typecheck
```
