import { parseArgs } from "node:util";
import { CloudflareSearchIndex } from "./cloudflare-search-index.js";
import { readEnv } from "./env.js";

const args = parseArgs({
  allowPositionals: true,
  options: {
    limit: { type: "string", default: "5" },
  },
});

const query = args.positionals.join(" ").trim();
if (!query) {
  throw new Error('Usage: pnpm search-docs "How do I create a management token?"');
}

const limit = Number(args.values.limit);
if (!Number.isInteger(limit) || limit < 1) {
  throw new Error("--limit must be a positive integer");
}

const results = await new CloudflareSearchIndex(readEnv()).search(query, { limit });
if (results.length === 0) {
  console.log("No results. The documents may still be indexing.");
  process.exitCode = 1;
} else {
  results.forEach((result, index) => {
    const score = result.score === undefined ? "" : ` (${result.score.toFixed(3)})`;
    console.log(`${index + 1}. ${result.title}${score}`);
    console.log(`   ${result.url}`);
    console.log(`   ${excerpt(result.text)}`);
    console.log("");
  });
}

function excerpt(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 280 ? `${compact.slice(0, 277)}...` : compact;
}
