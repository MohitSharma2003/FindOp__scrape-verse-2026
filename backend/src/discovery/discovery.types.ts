import type { SearchIntent } from "../search/search-intent.schema.js";

export interface CandidateUrl {
  url: string;
  title: string;
  description: string;
  source: "web_search";
  searchQuery: string;
  rank: number;
  discoveryMetadata: { domain: string; category?: string };
}

export interface DiscoveryQueryResult {
  link?: unknown;
  url?: unknown;
  title?: unknown;
  description?: unknown;
  snippet?: unknown;
  rank?: unknown;
}

export interface DiscoveryClient {
  search(query: string): Promise<unknown>;
}

export interface DiscoveryRequest {
  intent: SearchIntent;
}

export interface DiscoveryResponse {
  queries: string[];
  candidates: CandidateUrl[];
  metadata: {
    queriesExecuted: number;
    resultsDiscovered: number;
    duplicatesRemoved: number;
    candidatesReturned: number;
  };
}
