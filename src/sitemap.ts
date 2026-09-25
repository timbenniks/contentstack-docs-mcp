const SITEMAP_URL = "https://www.contentstack.com/sitemap-docs.xml";

const LOC_PATTERN = /<loc\b[^>]*>([\s\S]*?)<\/loc>/gi;

export function parseSitemapLocs(xml: string): string[] {
  const locs: string[] = [];
  for (const match of xml.matchAll(LOC_PATTERN)) {
    const decoded = decodeXml(unwrapCdata(match[1] ?? "").trim());
    if (decoded) locs.push(decoded);
  }
  return locs;
}

export function isDeveloperDocUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.replace(/\/+$/, "") || "/";
    return pathname === "/docs/developers" || pathname.startsWith("/docs/developers/");
  } catch {
    return false;
  }
}

export function toMarkdownUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  parsed.search = "";
  if (parsed.pathname.endsWith(".md")) return parsed.toString();
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") + ".md";
  return parsed.toString();
}

export function documentId(url: string): string {
  const pathname = new URL(url).pathname.replace(/\/+$/, "");
  const slug = pathname
    .replace(/^\//, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= 110) return slug || "index";
  return `${slug.slice(0, 90)}-${fnv1a(url)}`;
}

export function developerDocPages(locs: string[]): { url: string; markdownUrl: string; id: string }[] {
  const seen = new Set<string>();
  const pages: { url: string; markdownUrl: string; id: string }[] = [];
  for (const loc of locs) {
    if (!isDeveloperDocUrl(loc)) continue;
    const url = canonicalDocUrl(loc);
    if (seen.has(url)) continue;
    seen.add(url);
    pages.push({ url, markdownUrl: toMarkdownUrl(url), id: documentId(url) });
  }
  return pages;
}

export async function fetchSitemap(url = SITEMAP_URL): Promise<string> {
  const response = await fetch(url, {
    headers: { "user-agent": "contentstack-docs-indexer/0.1", accept: "application/xml,text/xml" },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Failed to download sitemap (${response.status})`);
  }
  return response.text();
}

export { SITEMAP_URL };

function canonicalDocUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = parsed.pathname.replace(/\.md$/, "").replace(/\/+$/, "") || "/";
  return parsed.toString();
}

function unwrapCdata(value: string): string {
  const match = value.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return match?.[1] ?? value;
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
