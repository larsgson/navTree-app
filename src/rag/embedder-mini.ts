/**
 * Model2Vec embedder (potion-base-8M).
 * Pure JS — no ONNX runtime needed. Loads a safetensors embedding matrix
 * and a HuggingFace tokenizer, then does lookup + mean pooling + L2 normalize.
 */

const MODEL_BASE = '/models/minishlab/potion-base-8M';
const DIMS = 256;

let embeddings: Float32Array | null = null;
let vocabMap: Map<string, number> | null = null;
let ready: Promise<void> | null = null;

/** Parse safetensors: 8-byte header length (LE), JSON header, raw float32 data */
async function loadSafetensors(url: string): Promise<Float32Array> {
  const resp = await fetch(url);
  const buf = await resp.arrayBuffer();
  const view = new DataView(buf);
  const headerLen = Number(view.getBigUint64(0, true));
  const dataOffset = 8 + headerLen;
  return new Float32Array(buf, dataOffset);
}

/** Load the HF tokenizer.json and build a word -> id map */
async function loadTokenizer(url: string): Promise<Map<string, number>> {
  const resp = await fetch(url);
  const tok = await resp.json();
  const map = new Map<string, number>();

  // WordPiece / Unigram / BPE — the vocab is in tok.model.vocab
  const vocab = tok.model?.vocab;
  if (Array.isArray(vocab)) {
    // Unigram-style: [[token, score], ...]
    vocab.forEach((entry: [string, number], i: number) => map.set(entry[0], i));
  } else if (vocab && typeof vocab === 'object') {
    // WordPiece/BPE-style: { token: id, ... }
    for (const [token, id] of Object.entries(vocab)) {
      map.set(token, id as number);
    }
  }

  // Also include added_tokens
  if (tok.added_tokens) {
    for (const t of tok.added_tokens) {
      map.set(t.content, t.id);
    }
  }

  return map;
}

/** Simple whitespace + punctuation tokenizer, then lookup subwords */
function tokenize(text: string, vocab: Map<string, number>): number[] {
  const ids: number[] = [];
  // Lowercase and split on whitespace/punctuation boundaries
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);

  for (const word of words) {
    // Try whole word first
    if (vocab.has(word)) {
      ids.push(vocab.get(word)!);
      continue;
    }

    // WordPiece-style subword tokenization
    let remaining = word;
    let isFirst = true;
    while (remaining.length > 0) {
      let matched = false;
      for (let end = remaining.length; end > 0; end--) {
        const sub = isFirst ? remaining.slice(0, end) : '##' + remaining.slice(0, end);
        if (vocab.has(sub)) {
          ids.push(vocab.get(sub)!);
          remaining = remaining.slice(isFirst ? end : end);
          isFirst = false;
          matched = true;
          break;
        }
      }
      if (!matched) {
        // Unknown token — skip character
        remaining = remaining.slice(1);
        isFirst = false;
      }
    }
  }

  return ids;
}

export async function initMiniEmbedder(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    const [emb, vocab] = await Promise.all([
      loadSafetensors(`${MODEL_BASE}/model.safetensors`),
      loadTokenizer(`${MODEL_BASE}/tokenizer.json`),
    ]);
    embeddings = emb;
    vocabMap = vocab;
  })();
  return ready;
}

export async function embedQueryMini(text: string): Promise<Float32Array> {
  await initMiniEmbedder();

  const ids = tokenize(text, vocabMap!);
  if (ids.length === 0) {
    return new Float32Array(DIMS);
  }

  // Mean pooling: average the embedding vectors for all tokens
  const result = new Float32Array(DIMS);
  for (const id of ids) {
    const offset = id * DIMS;
    for (let d = 0; d < DIMS; d++) {
      result[d] += embeddings![offset + d];
    }
  }

  // Average
  for (let d = 0; d < DIMS; d++) {
    result[d] /= ids.length;
  }

  // L2 normalize
  let norm = 0;
  for (let d = 0; d < DIMS; d++) {
    norm += result[d] * result[d];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let d = 0; d < DIMS; d++) {
      result[d] /= norm;
    }
  }

  return result;
}
