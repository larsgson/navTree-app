import { embedQuery, getEmbedder } from './embedder';
import { embedQueryMini, initMiniEmbedder } from './embedder-mini';
import { loadDB, search, type RAGMode } from './search';
import { buildAnswer } from './answer';

let currentMode: RAGMode = 'mini';

export function getRAGMode(): RAGMode {
  return currentMode;
}

export function setRAGMode(mode: RAGMode): void {
  currentMode = mode;
}

/** Initialize the current mode's embedder + embeddings DB */
export async function initRAG(mode?: RAGMode): Promise<void> {
  const m = mode ?? currentMode;
  if (m === 'mini') {
    await Promise.all([initMiniEmbedder(), loadDB('mini')]);
  } else {
    await Promise.all([getEmbedder(), loadDB('standard')]);
  }
}

/** Query the local RAG engine using the current mode */
export async function query(question: string, lang?: string) {
  const mode = currentMode;

  // Ensure this mode is initialized
  await initRAG(mode);

  const vector = mode === 'mini'
    ? await embedQueryMini(question)
    : await embedQuery(question);

  const results = search(vector, mode);
  return buildAnswer(results);
}

export type { RAGMode };
