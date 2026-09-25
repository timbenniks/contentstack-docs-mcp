import { readFile, rename, writeFile } from "node:fs/promises";
import type { Manifest } from "./types.js";

export const MANIFEST_PATH = ".index-manifest.json";

export type PlannedDocument = {
  id: string;
  hash: string;
};

export type IndexPlan = {
  upsert: string[];
  skip: string[];
  remove: string[];
};

export async function loadManifest(path = MANIFEST_PATH): Promise<Manifest> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Manifest;
  } catch (error) {
    if (isNotFound(error)) return {};
    throw error;
  }
}

export async function saveManifest(manifest: Manifest, path = MANIFEST_PATH): Promise<void> {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`);
  await rename(temporary, path);
}

export function planIndex(input: {
  manifest: Manifest;
  documents: PlannedDocument[];
  discoveredIds: ReadonlySet<string>;
  force?: boolean;
}): IndexPlan {
  const upsert: string[] = [];
  const skip: string[] = [];
  for (const document of input.documents) {
    const existing = input.manifest[document.id];
    if (!input.force && existing && existing.hash === document.hash) {
      skip.push(document.id);
      continue;
    }
    upsert.push(document.id);
  }

  const remove =
    input.discoveredIds.size === 0
      ? []
      : Object.keys(input.manifest).filter((id) => !input.discoveredIds.has(id));
  return { upsert, skip, remove };
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
