import { normalizeUrl } from "./normalizer.js";
import type { NormalizedOpportunity } from "./types.js";

export interface DeduplicationResult {
  records: NormalizedOpportunity[];
  duplicatesFound: number;
}

export function deduplicateRecords(
  records: NormalizedOpportunity[],
): DeduplicationResult {
  const seen = new Set<string>();
  const uniqueRecords: NormalizedOpportunity[] = [];
  let duplicatesFound = 0;

  for (const record of records) {
    const canonicalUrl = normalizeUrl(record.opportunityUrl);
    const identity = `${record.sourceId ?? record.source}:${canonicalUrl}`;

    if (seen.has(identity)) {
      duplicatesFound += 1;
      continue;
    }

    seen.add(identity);
    uniqueRecords.push({
      ...record,
      url: canonicalUrl,
      opportunityUrl: canonicalUrl,
    });
  }

  return { records: uniqueRecords, duplicatesFound };
}
