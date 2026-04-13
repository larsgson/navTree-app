# Backend Task: Generate Embeddings for Offline RAG

## Context

The mobile app implements a fully **offline RAG (Retrieval-Augmented Generation)** pipeline with **two search modes** that the user can toggle between:

| Mode | Client model | Dimensions | Embeddings file |
|------|-------------|------------|-----------------|
| **Mini** | `minishlab/potion-base-8M` (Model2Vec, plain JS) | 256 | `embeddings-mini.json` |
| **Standard** | `Xenova/all-MiniLM-L6-v2` (ONNX, transformers.js) | 384 | `embeddings-standard.json` |

The backend must generate **two separate embeddings files** — one for each mode.

## Required Output

Two JSON files placed in `public/assets/` in the mobile repo:
- `public/assets/embeddings-mini.json` (256d vectors)
- `public/assets/embeddings-standard.json` (384d vectors)

### Schema (same for both files, only model/dimensions differ)

```json
{
  "model": "model-name-here",
  "dimensions": 256,
  "total_chunks": 1234,
  "chunks": [
    {
      "id": "eng-mybook-01-01-chunk-0",
      "text": "The actual text content of this chunk...",
      "vector": [0.0123, -0.0456, ...],
      "metadata": {
        "title": "Section title",
        "hierarchy": "Chapter 1 > Section 1",
        "hierarchy_path": "eng/mybook/01/01",
        "language": "eng",
        "canonical_book_id": "mybook",
        "section_id": "01-01",
        "chunk_index": 0
      }
    }
  ]
}
```

### TypeScript interfaces (for reference)

Defined in `src/rag/search.ts`:

```typescript
interface Chunk {
  id: string;
  text: string;
  vector: number[];       // length must equal `dimensions`
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
```

## Critical: Model Compatibility

Each embeddings file must use the **exact same model** as its corresponding client-side embedder. The vectors are NOT interchangeable between modes.

### Mini mode

| Side | Model | Dimensions |
|------|-------|------------|
| Client (query) | `minishlab/potion-base-8M` | 256 |
| Backend (chunks) | `minishlab/potion-base-8M` | 256 |

### Standard mode

| Side | Model | Dimensions |
|------|-------|------------|
| Client (query) | `Xenova/all-MiniLM-L6-v2` | 384 |
| Backend (chunks) | `sentence-transformers/all-MiniLM-L6-v2` | 384 |

For standard mode, `Xenova/` is the ONNX-converted version of `sentence-transformers/` — vectors are compatible.

## Steps for the Backend

### 1. Install dependencies

```bash
pip install sentence-transformers model2vec torch
```

### 2. Write the export script

The script generates both files from the same chunked content:

```python
import json
import os
from sentence_transformers import SentenceTransformer
from model2vec import StaticModel

# Load both models
standard_model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
mini_model = StaticModel.from_pretrained("minishlab/potion-base-8M")

# Load and chunk your content (same chunks for both)
chunks = load_and_chunk_content()  # You implement this
texts = [c["text"] for c in chunks]

# Generate standard embeddings (384d)
standard_vectors = standard_model.encode(texts, normalize_embeddings=True, show_progress_bar=True)

standard_output = {
    "model": "sentence-transformers/all-MiniLM-L6-v2",
    "dimensions": 384,
    "total_chunks": len(chunks),
    "chunks": [
        {
            "id": chunk["id"],
            "text": chunk["text"],
            "vector": vector.tolist(),
            "metadata": chunk["metadata"],
        }
        for chunk, vector in zip(chunks, standard_vectors)
    ],
}

with open("embeddings-standard.json", "w") as f:
    json.dump(standard_output, f)
print(f"Standard: {len(chunks)} chunks, {os.path.getsize('embeddings-standard.json') / 1e6:.1f} MB")

# Generate mini embeddings (256d)
mini_vectors = mini_model.encode(texts)

mini_output = {
    "model": "minishlab/potion-base-8M",
    "dimensions": 256,
    "total_chunks": len(chunks),
    "chunks": [
        {
            "id": chunk["id"],
            "text": chunk["text"],
            "vector": vector.tolist(),
            "metadata": chunk["metadata"],
        }
        for chunk, vector in zip(chunks, mini_vectors)
    ],
}

with open("embeddings-mini.json", "w") as f:
    json.dump(mini_output, f)
print(f"Mini: {len(chunks)} chunks, {os.path.getsize('embeddings-mini.json') / 1e6:.1f} MB")
```

### 3. Chunking guidelines

- Target **200-500 tokens** per chunk (roughly 150-400 words)
- Keep chunks within a single section — don't cross section boundaries
- Include enough context in each chunk to be useful standalone
- If a section is short enough, it can be a single chunk
- Overlap between chunks (e.g., 1-2 sentences) can improve retrieval quality but increases file size
- **Use the same chunks for both files** — only the vectors differ

### 4. Metadata requirements

Each chunk's metadata must include:

| Field | Example | Description |
|-------|---------|-------------|
| `title` | `"Section Title"` | Section or subsection title |
| `hierarchy` | `"Chapter 1 > Topic > Section"` | Human-readable breadcrumb |
| `hierarchy_path` | `"eng/mybook/01/01"` | URL path segment (used for linking) |
| `language` | `"eng"` | ISO 639-3 language code |
| `canonical_book_id` | `"mybook"` | Book identifier |
| `section_id` | `"01-01"` | Section identifier |
| `chunk_index` | `0` | Index within the section (0-based) |

## File Size Estimates

| Chunks | Mini (256d) | Standard (384d) | Both |
|--------|-------------|-----------------|------|
| 500 | ~1.5 MB | ~2 MB | ~3.5 MB |
| 2000 | ~6 MB | ~8 MB | ~14 MB |
| 5000 | ~15 MB | ~20 MB | ~35 MB |

If files get too large (>10 MB each), consider:
- Using fewer/larger chunks
- Storing vectors as base64 instead of JSON arrays (requires a client-side change)

## Deployment

Once generated, the files should be:
1. Placed at `public/assets/embeddings-mini.json` and `public/assets/embeddings-standard.json`
2. These files are **gitignored** — they must be provided separately (copied manually or fetched during CI/build)
3. Regenerated whenever handbook content changes
4. **Both files must be regenerated together** from the same content to keep them in sync

## Temporary Dual-Mode Setup

Both modes exist for comparison purposes. After gathering enough experience with both, one mode will be kept and the other removed. At that point:
- Remove the unused embeddings file
- Remove the unused model from `public/models/`
- Simplify `src/rag/` to a single embedder

## Future: Multilingual Support

When adding French (or other languages), the **standard mode** model should be swapped to a multilingual one:

| Component | Current (English) | Future (Multilingual) |
|-----------|-------------------|----------------------|
| Standard model | `all-MiniLM-L6-v2` (384d, 23 MB) | `paraphrase-multilingual-MiniLM-L12-v2` (384d, 145 MB) |
| Backend model | `sentence-transformers/all-MiniLM-L6-v2` | `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` |
| Dimensions | 384 | 384 |

This requires re-generating `embeddings-standard.json` — vectors are not compatible across models.

For mini mode, a multilingual Model2Vec variant would be needed (e.g., `M2V_multilingual_output`, ~30 MB). This would also require re-generating `embeddings-mini.json`.

Both sides must use the same model family — you cannot mix vectors from different models.
