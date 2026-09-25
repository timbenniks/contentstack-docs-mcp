export type Document = {
  id: string;
  url: string;
  markdownUrl: string;
  title: string;
  content: string;
};

export type SearchOptions = {
  limit?: number;
};

export type SearchResult = {
  title: string;
  url: string;
  markdownUrl?: string;
  text: string;
  score?: number;
};

export interface SearchIndex {
  upsert(document: Document): Promise<void>;
  remove(id: string): Promise<void>;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}

export type ManifestEntry = {
  hash: string;
  url: string;
  itemId?: string;
};

export type Manifest = Record<string, ManifestEntry>;
