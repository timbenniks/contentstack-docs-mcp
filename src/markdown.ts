export function extractTitle(markdown: string): string {
  const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const title = frontmatter ? readFrontmatterTitle(frontmatter[1] ?? "") : "";
  if (title) return title;
  const heading = markdown.match(/^#\s+(.+?)\s*$/m);
  return heading?.[1]?.trim() ?? "";
}

export async function fetchMarkdown(url: string): Promise<{ content: string; status: number }> {
  const response = await fetchWithRetries(url);
  if (!response.ok) {
    return { content: "", status: response.status };
  }
  const content = await response.text();
  return { content, status: response.status };
}

async function fetchWithRetries(url: string, attempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": "contentstack-docs-indexer/0.1",
          accept: "text/markdown, text/plain;q=0.9, */*;q=0.1",
        },
        redirect: "follow",
      });
      if (response.status === 404 || response.status === 410) return response;
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`HTTP ${response.status} for ${url}`);
        if (attempt < attempts) {
          await delay(250 * 2 ** (attempt - 1));
          continue;
        }
        return response;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await delay(250 * 2 ** (attempt - 1));
        continue;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`);
}

function readFrontmatterTitle(frontmatter: string): string {
  for (const line of frontmatter.split(/\r?\n/)) {
    const match = line.match(/^title:\s*(.*)$/);
    if (!match) continue;
    return unquote(match[1]?.trim() ?? "");
  }
  return "";
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
