import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashContent } from "./hash.js";
import { extractTitle } from "./markdown.js";

describe("title extraction", () => {
  it("reads a quoted frontmatter title", () => {
    const markdown = `---\ntitle: "Content Management API"\ndescription: "Reference"\n---\n\n# Ignored\n`;
    assert.equal(extractTitle(markdown), "Content Management API");
  });

  it("falls back to the first H1", () => {
    const markdown = "Intro\n\n# Create a management token\n\nBody\n";
    assert.equal(extractTitle(markdown), "Create a management token");
  });

  it("returns an empty string when no title is present", () => {
    assert.equal(extractTitle("Just a paragraph."), "");
  });
});

describe("content hashing", () => {
  it("is stable for the same markdown", () => {
    const content = "# Title\n\nSame body\n";
    assert.equal(hashContent(content), hashContent(content));
    assert.equal(hashContent(content).length, 64);
  });

  it("changes when the markdown changes", () => {
    assert.notEqual(hashContent("one"), hashContent("two"));
  });
});
