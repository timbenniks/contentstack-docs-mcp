import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { parseArgs } from "node:util";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { CloudflareSearchIndex } from "./cloudflare-search-index.js";
import { readEnv } from "./env.js";
import { extractTitle, fetchMarkdown } from "./markdown.js";
import { isDeveloperDocUrl, toMarkdownUrl } from "./sitemap.js";
import type { SearchIndex } from "./types.js";

const args = parseArgs({
  options: {
    stdio: { type: "boolean", default: false },
    port: { type: "string" },
  },
});

const index = new CloudflareSearchIndex(readEnv());

if (args.values.stdio) {
  const server = createDocsServer(index);
  await server.connect(new StdioServerTransport());
} else {
  const port = Number(args.values.port ?? process.env.PORT ?? 8788);
  if (!Number.isInteger(port) || port < 1) throw new Error("--port must be a positive integer");
  const httpServer = createServer((req, res) => {
    void handleHttp(req, res, index);
  });
  httpServer.listen(port, "127.0.0.1", () => {
    console.log(`Contentstack docs MCP listening on http://127.0.0.1:${port}/mcp`);
  });
}

export function createDocsServer(searchIndex: SearchIndex): McpServer {
  const server = new McpServer({
    name: "contentstack-developer-docs",
    version: "0.1.0",
  });

  server.registerTool(
    "search_docs",
    {
      description:
        "Search Contentstack developer documentation and return matching passages with source URLs. Does not generate an answer.",
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().int().min(1).max(20).optional(),
      }),
    },
    async ({ query, limit }) => {
      const results = await searchIndex.search(query, { limit: limit ?? 5 });
      return {
        content: [{ type: "text", text: JSON.stringify({ results }, null, 2) }],
      };
    },
  );

  server.registerTool(
    "get_document",
    {
      description: "Fetch the complete Markdown for a Contentstack developer documentation page.",
      inputSchema: z.object({
        url: z.string().url(),
      }),
    },
    async ({ url }) => {
      if (!isDeveloperDocUrl(url) && !isDeveloperDocUrl(url.replace(/\.md$/, ""))) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Only https://www.contentstack.com/docs/developers/ URLs are supported.",
            },
          ],
        };
      }
      const markdownUrl = url.endsWith(".md") ? url : toMarkdownUrl(url);
      const fetched = await fetchMarkdown(markdownUrl);
      if (fetched.status === 404 || fetched.status === 410 || !fetched.content.trim()) {
        return {
          isError: true,
          content: [{ type: "text", text: `Document not found: ${url}` }],
        };
      }
      if (fetched.status >= 400) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to fetch document (HTTP ${fetched.status})` }],
        };
      }
      const canonicalUrl = markdownUrl.replace(/\.md$/, "");
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                title: extractTitle(fetched.content),
                url: canonicalUrl,
                markdownUrl,
                content: fetched.content,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  return server;
}

async function handleHttp(req: IncomingMessage, res: ServerResponse, searchIndex: SearchIndex): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname !== "/mcp") {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
    return;
  }
  try {
    const server = createDocsServer(searchIndex);
    const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "text/plain" }).end(error instanceof Error ? error.message : "MCP error");
    }
  }
}
