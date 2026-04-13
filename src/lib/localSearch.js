/**
 * Local search service using Flexsearch for client-side FTS
 * This uses a pre-built search index generated at build time
 */

import { Document } from "flexsearch";

// Singleton search index
let searchIndex = null;
let indexedDocuments = [];
let isIndexing = false;
let indexReady = false;

/**
 * Initialize the search index from pre-built data
 */
export async function initSearchIndex() {
  if (indexReady || isIndexing) {
    return;
  }

  isIndexing = true;

  try {
    // Create a document index for full-text search
    searchIndex = new Document({
      document: {
        id: "id",
        index: ["title", "content"],
        store: ["title", "content", "url", "chapter_num", "section_slug"],
      },
      tokenize: "forward",
      resolution: 9,
      cache: true,
    });

    // Detect current language from URL path
    const langMatch = window.location.pathname.match(/^\/(\w+)\//);
    const lang = langMatch ? langMatch[1] : "eng";

    // Load the pre-built search data generated at build time
    const response = await fetch(`/${lang}/search-index.json`);
    if (!response.ok) {
      throw new Error(`Failed to load search index: ${response.status}`);
    }

    const searchData = await response.json();
    indexedDocuments = searchData.documents;

    // Add all documents to the search index
    for (const doc of indexedDocuments) {
      searchIndex.add(doc);
    }

    indexReady = true;
    console.log(`Search index ready with ${indexedDocuments.length} documents`);
  } catch (err) {
    console.error("Failed to initialize search index:", err);
  } finally {
    isIndexing = false;
  }
}

/**
 * Clean up title formatting
 */
function cleanTitle(title) {
  if (!title) return "";
  return title
    .replace(/\.+$/, "") // Remove trailing dots
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
}

/**
 * Search the local index
 * @param {string} query - Search query
 * @param {number} limit - Max results to return
 * @returns {Array} Search results with relevance scores
 */
export async function localSearch(query, limit = 5) {
  // Ensure index is ready
  if (!indexReady) {
    await initSearchIndex();
  }

  if (!searchIndex || !query.trim()) {
    return [];
  }

  try {
    // Search across both title and content fields
    const results = searchIndex.search(query, {
      limit: limit * 2, // Get more results to dedupe
      enrich: true,
    });

    // Collect unique results with scores
    const resultMap = new Map();

    for (const fieldResult of results) {
      for (const hit of fieldResult.result) {
        const doc = indexedDocuments.find((d) => d.id === hit.id);
        if (!doc) continue;

        // Calculate relevance score based on field and position
        const fieldWeight = fieldResult.field === "title" ? 1.5 : 1.0;
        const positionScore = 1 / (1 + hit.id * 0.01); // Favor earlier docs slightly
        const score = fieldWeight * positionScore;

        if (!resultMap.has(doc.id) || resultMap.get(doc.id).score < score) {
          resultMap.set(doc.id, {
            ...doc,
            score: score,
            content_preview: doc.content.substring(0, 200) + "...",
          });
        }
      }
    }

    // Sort by score and return top results
    const sortedResults = Array.from(resultMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // Normalize scores to 0-1 range for consistency with server API
    const maxScore = sortedResults[0]?.score || 1;
    return sortedResults.map((r) => ({
      title: r.title,
      content_preview: r.content_preview,
      url: r.url,
      chapter_num: r.chapter_num,
      section_slug: r.section_slug,
      relevance: Math.min(r.score / maxScore, 1.0),
    }));
  } catch (err) {
    console.error("Local search error:", err);
    return [];
  }
}

/**
 * Check if the search index is ready
 */
export function isSearchReady() {
  return indexReady;
}

/**
 * Get index statistics
 */
export function getIndexStats() {
  return {
    ready: indexReady,
    documentCount: indexedDocuments.length,
  };
}
