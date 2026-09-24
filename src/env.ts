import { readFileSync } from "node:fs";
import { z } from "zod";

const envSchema = z.object({
  CLOUDFLARE_ACCOUNT_ID: z.string().min(1),
  CLOUDFLARE_API_TOKEN: z.string().min(1),
  CLOUDFLARE_AI_SEARCH_INSTANCE: z.string().min(1).default("contentstack-developer-docs"),
  CLOUDFLARE_AI_SEARCH_NAMESPACE: z.string().min(1).default("default"),
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadDotEnv(path = ".env"): void {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function readEnv(): AppEnv {
  loadDotEnv();
  const instance =
    process.env.CLOUDFLARE_AI_SEARCH_INSTANCE || process.env.CLOUDFLARE_AI_SEARCH_INDEX;
  const parsed = envSchema.safeParse({
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
    CLOUDFLARE_AI_SEARCH_INSTANCE: instance,
    CLOUDFLARE_AI_SEARCH_NAMESPACE: process.env.CLOUDFLARE_AI_SEARCH_NAMESPACE,
  });
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(
      `Missing Cloudflare configuration (${missing}). Copy .env.example to .env and set the account ID, API token, and AI Search instance name.`,
    );
  }
  return parsed.data;
}
