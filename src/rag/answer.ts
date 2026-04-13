import type { SearchResult } from './search';

interface Source {
  title: string;
  url: string;
  relevance: number;
}

interface RAGResponse {
  answer: string;
  sources: Source[];
  confidence: number;
}

export function buildAnswer(results: SearchResult[], maxResults = 3): RAGResponse {
  const seen = new Set<string>();
  const parts: string[] = [];
  const sources: Source[] = [];
  let sourceIndex = 0;

  for (const result of results.slice(0, maxResults)) {
    const key = result.content.slice(0, 100);
    if (seen.has(key)) continue;
    seen.add(key);
    sourceIndex++;

    const cleaned = result.content
      .split('\n')
      .filter(line => !(line.trim().startsWith('# ') && line.trim().length < 20))
      .join('\n')
      .trim();

    if (cleaned) {
      parts.push(`${cleaned} [Source ${sourceIndex}]`);
      sources.push({
        title: result.metadata.title || result.metadata.hierarchy,
        url: `/${result.metadata.hierarchy_path}`,
        relevance: result.similarity,
      });
    }
  }

  const avgSimilarity = results.length > 0
    ? results.reduce((sum, r) => sum + r.similarity, 0) / results.length
    : 0;

  return {
    answer: parts.join('\n\n'),
    sources,
    confidence: Math.min(avgSimilarity * 1.2, 1.0),
  };
}
