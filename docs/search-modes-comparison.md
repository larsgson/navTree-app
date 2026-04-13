# Search Modes: Mini vs Standard

The app has two offline search modes. The user can switch between them using the toggle in the chat header.

Both modes answer questions by finding relevant sections from the book — they do not generate new text or use AI to rephrase anything. The difference is in **how well they understand the meaning of the question**.

## How search works (both modes)

The search process has three stages:

### 1. Understanding the question (embedding)

When the user types a question, the app converts it into a list of numbers (a "vector") that represents the **meaning** of the question. This is done differently depending on the mode:

- **Mini**: Looks up each word in a pre-built vocabulary table and averages the word meanings together. Fast and lightweight — works like a dictionary lookup.
- **Standard**: Runs the question through a small neural network (transformer) that reads the full sentence and understands how words relate to each other. Slower but captures more nuance.

### 2. Finding matches (vector search)

The book content has been pre-split into small passages (chunks), and each chunk has its own vector computed in advance (stored in a JSON file that ships with the app).

The app compares the question vector against every chunk vector using cosine similarity — a mathematical measure of how close two meanings are. The top 3 most similar chunks are selected.

### 3. Building the answer (formatting)

The selected chunks are displayed as-is (the actual book text), with source references like `[Source 1]` that link back to the relevant chapter and section. A confidence score is shown based on how similar the best matches were.

No text is generated or rephrased — the user sees the original book content.

## Comparison

### Mini mode (Model2Vec — `potion-base-8M`)

**How it understands questions**: Word-by-word lookup and averaging. Does not understand word order or sentence structure.

| Aspect | Detail |
|--------|--------|
| Speed | Near-instant (no neural network, just array lookups) |
| Model size | 30 MB bundled in app |
| Needs ONNX runtime | No (plain JavaScript) |
| Vector dimensions | 256 |
| Language | English only (currently) |

**Strengths**:
- Very fast, even on low-end devices
- Lower memory usage
- No ML runtime overhead — simpler, fewer things can break

**Weaknesses**:
- Treats "how to fix errors" and "errors fix how" as the same thing — word order is ignored
- Struggles with synonyms it hasn't seen (e.g., may not connect "error" with "failure")
- Less accurate at finding the right passage when the question is phrased differently from the book text

**What the user sees**: Results are often correct for simple, direct questions that use the same words as the book. For more conversational or indirect questions, the results may be less relevant or miss the best passage.

### Standard mode (Transformer — `all-MiniLM-L6-v2`)

**How it understands questions**: Reads the entire sentence through a 6-layer transformer network that understands context, word order, and relationships between words.

| Aspect | Detail |
|--------|--------|
| Speed | ~50-200ms per query (neural network inference via WebAssembly) |
| Model size | 23 MB bundled in app |
| Needs ONNX runtime | Yes (22 MB WASM binary) |
| Vector dimensions | 384 |
| Language | English only (currently) |

**Strengths**:
- Understands meaning, not just words — "connection problem" matches content about "network error"
- Handles paraphrasing well — different wordings of the same question find the same content
- Better at ranking — the top result is more likely to be the best one

**Weaknesses**:
- Slower startup (model must load into memory)
- Higher memory usage
- Requires the ONNX WebAssembly runtime (22 MB extra in the app)

**What the user sees**: Results are more relevant, especially for natural questions. The confidence scores tend to be more meaningful — a high-confidence result is more likely to actually answer the question.

## Side-by-side example

**Question**: "How do I handle a network connection timeout?"

| | Mini mode | Standard mode |
|--|-----------|---------------|
| Understanding | Looks up: "how", "do", "handle", "network", "connection", "timeout" — averages them | Understands the full sentence means "dealing with network connectivity issues" |
| Best match | May find a section that mentions "timeout" frequently (possibly about session timeouts) | More likely to find the section about connection error handling |
| Result quality | Reasonable if book uses similar wording | Good even if book uses different terminology |

## When to use which

- **Mini**: Good enough for quick lookups where you know roughly what words the book uses. Best for users who tend to search with specific terms.
- **Standard**: Better for natural questions, especially when the user doesn't know the exact terminology used in the book.

## Future: Multilingual mode

Currently both modes are English-only. A future update will add multilingual support, which changes the picture significantly:

### What multilingual enables

- The user can ask questions in **French, Spanish, or other languages** and find results in the book regardless of what language the content is written in
- A French-speaking user could ask a question in French and find relevant English content (and vice versa)
- Cross-language search works because the multilingual model maps different languages into the same vector space — the French and English sentences for the same concept end up near each other

### What changes

| Aspect | Current (English) | Future (Multilingual) |
|--------|-------------------|----------------------|
| Standard model | `all-MiniLM-L6-v2` (23 MB) | `paraphrase-multilingual-MiniLM-L12-v2` (145 MB) |
| Mini model | `potion-base-8M` (30 MB) | Multilingual Model2Vec variant (~30 MB) |
| Query language | English only | Any supported language |
| Content language | English only | Mixed languages in same index |

The tradeoff is size: the multilingual standard model is significantly larger (145 MB vs 23 MB) because it needs vocabulary and understanding for many languages.

### Impact on search quality

Multilingual models are generally slightly less accurate for single-language search than dedicated English models, because they spread their capacity across many languages. Users searching in English may notice marginally less precise results compared to the current English-only setup. However, the ability to search across languages more than compensates for this in a multilingual book.
