import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { developerDocPages, documentId, isDeveloperDocUrl, parseSitemapLocs, toMarkdownUrl } from "./sitemap.js";

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.contentstack.com/docs</loc></url>
  <url><loc>https://www.contentstack.com/docs/developers/apis/content-management-api</loc></url>
  <url><loc><![CDATA[https://www.contentstack.com/docs/developers/sdks/javascript]]></loc></url>
  <url><loc>https://www.contentstack.com/docs/headless-cms/generate-a-management-token</loc></url>
  <url><loc>https://www.contentstack.com/docs/developers/apis/example?ref=sitemap</loc></url>
</urlset>`;

describe("sitemap parsing", () => {
  it("reads loc values, including CDATA", () => {
    const locs = parseSitemapLocs(SITEMAP);
    assert.equal(locs.length, 5);
    assert.equal(locs[2], "https://www.contentstack.com/docs/developers/sdks/javascript");
  });

  it("decodes XML entities", () => {
    const locs = parseSitemapLocs("<urlset><url><loc>https://example.com/a&amp;b</loc></url></urlset>");
    assert.deepEqual(locs, ["https://example.com/a&b"]);
  });
});

describe("developer URL filtering", () => {
  it("keeps only /docs/developers/ pages", () => {
    const pages = developerDocPages(parseSitemapLocs(SITEMAP));
    assert.deepEqual(
      pages.map((page) => page.url),
      [
        "https://www.contentstack.com/docs/developers/apis/content-management-api",
        "https://www.contentstack.com/docs/developers/sdks/javascript",
        "https://www.contentstack.com/docs/developers/apis/example",
      ],
    );
  });

  it("rejects documentation outside the developer section", () => {
    assert.equal(isDeveloperDocUrl("https://www.contentstack.com/docs/headless-cms/generate-a-management-token"), false);
    assert.equal(isDeveloperDocUrl("https://www.contentstack.com/docs/developers/apis/content-management-api"), true);
  });
});

describe("markdown URL conversion", () => {
  it("appends .md and drops the query string", () => {
    assert.equal(
      toMarkdownUrl("https://www.contentstack.com/docs/developers/foo?ref=1"),
      "https://www.contentstack.com/docs/developers/foo.md",
    );
  });

  it("does not double the markdown suffix", () => {
    assert.equal(
      toMarkdownUrl("https://www.contentstack.com/docs/developers/foo.md"),
      "https://www.contentstack.com/docs/developers/foo.md",
    );
  });

  it("strips a trailing slash before adding .md", () => {
    assert.equal(
      toMarkdownUrl("https://www.contentstack.com/docs/developers/foo/"),
      "https://www.contentstack.com/docs/developers/foo.md",
    );
  });
});

describe("document ids", () => {
  it("derives a stable id from the documentation path", () => {
    assert.equal(
      documentId("https://www.contentstack.com/docs/developers/apis/content-management-api"),
      "docs-developers-apis-content-management-api",
    );
  });

  it("keeps long paths short enough for an AI Search filename", () => {
    const url =
      "https://www.contentstack.com/docs/developers/how-to-guides/setting-up-a-translation-system-using-contentstack-webhooks-aws-lambda-and-smartling-human-translator";
    const id = documentId(url);
    assert.ok(`${id}.md`.length <= 128);
    assert.equal(documentId(url), id);
  });
});
