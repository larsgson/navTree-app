interface Chunk {
  id: string;
  text: string;
  vector: number[];
  metadata: {
    title: string;
    hierarchy: string;
    hierarchy_path: string;
    language: string;
    canonical_book_id: string;
    section_id: string;
    chunk_index: number;
  };
}

interface EmbeddingsDB {
  model: string;
  dimensions: number;
  total_chunks: number;
  chunks: Chunk[];
}

export interface SearchResult {
  content: string;
  metadata: Chunk['metadata'];
  similarity: number;
}

export type RAGMode = 'mini' | 'standard';

const dbs: Record<RAGMode, EmbeddingsDB | null> = {
  mini: null,
  standard: null,
};

const EMBEDDINGS_FILES: Record<RAGMode, string> = {
  mini: '/assets/embeddings-mini.json',
  standard: '/assets/embeddings-standard.json',
};

export async function loadDB(mode: RAGMode): Promise<void> {
  if (dbs[mode]) return;
  const response = await fetch(EMBEDDINGS_FILES[mode]);
  if (!response.ok) {
    throw new Error(`Failed to load embeddings for ${mode}: ${response.status}`);
  }
  dbs[mode] = await response.json();
}

function cosineSimilarity(a: Float32Array, b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function search(
  queryVector: Float32Array,
  mode: RAGMode,
  lang?: string,
  nResults: number = 5
): SearchResult[] {
  const db = dbs[mode];
  if (!db) throw new Error(`DB not loaded for mode: ${mode}`);

  const scored = db.chunks
    .filter(chunk => !lang || chunk.metadata.language === lang)
    .map(chunk => ({
      content: chunk.text,
      metadata: chunk.metadata,
      similarity: cosineSimilarity(queryVector, chunk.vector),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, nResults);

  return scored;
}
