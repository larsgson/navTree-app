/**
 * Generate per-language search index at build time
 * This creates a static JSON file that the client-side search can load
 */

import type { APIRoute } from 'astro';
import { loadIndex, loadSection, flattenSections } from '../../lib/content';
import { getSupportedLanguages, isValidLang, type Lang } from '../../lib/i18n';

export const prerender = true;

export async function getStaticPaths() {
  const langs = await getSupportedLanguages();
  return langs.map((lang) => ({
    params: { lang },
  }));
}

/**
 * Extract plain text from content array
 */
function extractTextContent(content: any[]): string {
  if (!content || !Array.isArray(content)) return "";

  const texts: string[] = [];

  for (const item of content) {
    if (item.type === "paragraph" && item.text) {
      texts.push(item.text);
    } else if (item.type === "table" && item.rows) {
      for (const row of item.rows) {
        if (row.cells) {
          for (const cell of row.cells) {
            if (cell.text) {
              texts.push(cell.text);
            }
          }
        }
      }
    }
  }

  return texts.join(" ").replace(/\s+/g, " ").trim();
}

function cleanTitle(title: string): string {
  if (!title) return "";
  return title
    .replace(/\.+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const GET: APIRoute = async ({ params }) => {
  const lang = params.lang as Lang;

  if (!isValidLang(lang)) {
    return new Response("Not found", { status: 404 });
  }

  let index;
  try {
    index = await loadIndex(lang);
  } catch {
    return new Response(JSON.stringify({ generated: new Date().toISOString(), documentCount: 0, documents: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const documents: any[] = [];
  let docId = 0;

  for (const chapter of index.chapters) {
    const allSections = flattenSections(chapter.sections);
    for (const section of allSections) {
      try {
        const sectionData = await loadSection(chapter.number, section.slug, lang);
        const textContent = extractTextContent(sectionData.content);

        if (textContent.trim().length < 10) continue;

        const url = section.slug === 'intro'
          ? `/${lang}/chapter/${chapter.number}`
          : `/${lang}/chapter/${chapter.number}/section/${section.slug}`;

        documents.push({
          id: docId++,
          title: cleanTitle(sectionData.title),
          content: textContent,
          url: url,
          chapter_num: chapter.number,
          section_slug: section.slug,
        });
      } catch (err) {
        console.warn(`Failed to load ${lang} chapter ${chapter.number} section ${section.slug}:`, err);
      }
    }
  }

  const searchIndex = {
    generated: new Date().toISOString(),
    documentCount: documents.length,
    documents: documents,
  };

  return new Response(JSON.stringify(searchIndex), {
    headers: { 'Content-Type': 'application/json' },
  });
};
