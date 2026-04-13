// Helper functions for loading content from /src/data/content/
// Content is read at Astro build time (SSG)

import { type Lang, DEFAULT_LANG } from "./i18n";

const CONTENT_BASE = "src/data/content";

// Cache resolved book folder names per language
const bookPathCache = new Map<string, string>();

// Find the book folder inside a language directory (contains _book.toml)
async function getBookPath(lang: Lang): Promise<string> {
  if (bookPathCache.has(lang)) return bookPathCache.get(lang)!;

  const fs = await import("fs/promises");
  const path = await import("path");

  const langDir = path.join(process.cwd(), CONTENT_BASE, lang);
  const entries = await fs.readdir(langDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      await fs.access(path.join(langDir, entry.name, "_book.toml"));
      const bookPath = `${lang}/${entry.name}`;
      bookPathCache.set(lang, bookPath);
      return bookPath;
    } catch {
      // No _book.toml in this directory
    }
  }

  throw new Error(`No book found for language: ${lang}`);
}

// Threshold for minimal intro content (in characters)
// Intros with less than this will be merged with section 1
const MINIMAL_INTRO_THRESHOLD = 150;

export interface Chapter {
  number: number;
  title: string;
  folderName: string;
  sections: Section[]; // top-level sections (intro, 01, 02...) with nested children
  total_sections: number; // total count including subsections
  introIsMerged: boolean;
}

export interface Section {
  slug: string; // file stem: "intro", "01", "01_01", etc.
  title: string;
  fileName: string;
  id: string;
  isMinimalIntro?: boolean;
  children: Section[];
}

export interface BookIndex {
  book_title: string;
  book_folder: string;
  total_chapters: number;
  total_sections: number;
  chapters: Chapter[];
}

export interface SectionContent {
  id: string;
  title: string;
  section_id: string;
  links: Array<{ type: string; target: string }>;
  content: ContentBlock[];
  footnotes?: Record<string, string>;
  statistics?: { paragraphs: number; tables: number; images: number };
}

export interface ContentBlock {
  type: "paragraph" | "image" | "table" | "heading";
  text?: string;
  path?: string;
  alt?: string;
  caption?: string;
  rows?: Array<{ cells: Array<{ text: string }> }>;
}

export interface ImageOverride {
  sectionId: string;
  blockIndex: number;
  originalPath: string;
  correctedPath: string;
}

export interface ImageOverrides {
  overrides: ImageOverride[];
}

// Calculate total text length of content blocks
function getContentTextLength(content: ContentBlock[]): number {
  let total = 0;
  for (const block of content) {
    if (block.text) {
      total += block.text.length;
    }
    if (block.rows) {
      for (const row of block.rows) {
        for (const cell of row.cells) {
          if (cell.text) {
            total += cell.text.length;
          }
        }
      }
    }
  }
  return total;
}

// Sort section files: intro.json first, then numerically (01.json, 01_01.json, 02.json, etc.)
function sortSectionFiles(files: string[]): string[] {
  return files.sort((a, b) => {
    if (a === "intro.json") return -1;
    if (b === "intro.json") return 1;
    const aNum = a.replace(".json", "").split("_").map(Number);
    const bNum = b.replace(".json", "").split("_").map(Number);
    for (let i = 0; i < Math.max(aNum.length, bNum.length); i++) {
      const av = aNum[i] ?? 0;
      const bv = bNum[i] ?? 0;
      if (av !== bv) return av - bv;
    }
    return 0;
  });
}

// Flatten section tree into document order (parent, then children, then next parent)
export function flattenSections(sections: Section[]): Section[] {
  const result: Section[] = [];
  for (const s of sections) {
    result.push(s);
    for (const child of s.children) {
      result.push(child);
    }
  }
  return result;
}

// Find a section by slug in a section tree
export function findSectionBySlug(
  sections: Section[],
  slug: string,
): Section | undefined {
  for (const s of sections) {
    if (s.slug === slug) return s;
    for (const child of s.children) {
      if (child.slug === slug) return child;
    }
  }
  return undefined;
}

// Cache for the built index per language
const cachedIndexes = new Map<string, BookIndex>();

// Build the index by scanning the folder structure
export async function loadIndex(
  lang: Lang = DEFAULT_LANG,
): Promise<BookIndex> {
  if (cachedIndexes.has(lang)) return cachedIndexes.get(lang)!;

  const fs = await import("fs/promises");
  const path = await import("path");

  const resolvedBookPath = await getBookPath(lang);
  const bookFolder = resolvedBookPath.split("/").pop()!;
  const bookPath = path.join(process.cwd(), CONTENT_BASE, resolvedBookPath);

  // Read book metadata from _book.toml
  let bookTitle = "";
  try {
    const tomlContent = await fs.readFile(
      path.join(bookPath, "_book.toml"),
      "utf-8",
    );
    const titleMatch = tomlContent.match(/title\s*=\s*"([^"]+)"/);
    if (titleMatch) bookTitle = titleMatch[1];
  } catch {
    // Use default title if _book.toml not found
  }

  // Get all chapter folders (directories that are numeric, e.g. "01", "02")
  const entries = await fs.readdir(bookPath, { withFileTypes: true });
  const chapterFolders = entries
    .filter((e) => e.isDirectory() && /^\d{2}$/.test(e.name))
    .map((e) => e.name)
    .sort();

  const chapters: Chapter[] = [];
  let totalSections = 0;

  for (const folderName of chapterFolders) {
    const chapterNum = parseInt(folderName, 10);
    const chapterPath = path.join(bookPath, folderName);

    // Get all section JSON files in sorted order
    const sectionFiles = sortSectionFiles(
      (await fs.readdir(chapterPath)).filter((f) => f.endsWith(".json")),
    );

    // Parse all sections flat first
    const allSections: Section[] = [];
    let chapterTitle = "";
    let introIsMerged = false;

    for (const fileName of sectionFiles) {
      const filePath = path.join(chapterPath, fileName);
      const slug = fileName.replace(".json", "");

      try {
        const content = await fs.readFile(filePath, "utf-8");
        const sectionData = JSON.parse(content) as SectionContent;

        const isIntro = fileName === "intro.json";
        if (isIntro) {
          chapterTitle = sectionData.title;
          const introLength = getContentTextLength(sectionData.content);
          if (introLength < MINIMAL_INTRO_THRESHOLD) {
            introIsMerged = true;
          }
        }

        allSections.push({
          slug,
          title: sectionData.title,
          fileName,
          id: sectionData.id,
          isMinimalIntro: isIntro && introIsMerged,
          children: [],
        });
      } catch {
        console.warn(`Could not parse ${filePath}`);
      }
    }

    // Build tree: top-level sections get subsections as children
    const parentMap = new Map<string, Section>();
    const topLevel: Section[] = [];

    for (const section of allSections) {
      // Top-level: "intro" or two-digit slug (e.g., "01", "02")
      if (section.slug === "intro" || /^\d{2}$/.test(section.slug)) {
        parentMap.set(section.slug, section);
        topLevel.push(section);
      }
    }

    for (const section of allSections) {
      // Subsection: "01_01", "03_16", etc.
      if (/^\d{2}_\d{2}$/.test(section.slug)) {
        const parentSlug = section.slug.split("_")[0];
        const parent = parentMap.get(parentSlug);
        if (parent) {
          parent.children.push(section);
        } else {
          // Orphan subsection — promote to top level
          topLevel.push(section);
        }
      }
    }

    totalSections += allSections.length;

    chapters.push({
      number: chapterNum,
      title: chapterTitle,
      folderName,
      sections: topLevel,
      total_sections: allSections.length,
      introIsMerged,
    });
  }

  const index: BookIndex = {
    book_title: bookTitle,
    book_folder: bookFolder,
    total_chapters: chapters.length,
    total_sections: totalSections,
    chapters,
  };

  cachedIndexes.set(lang, index);
  return index;
}

// Load a specific section by chapter number and slug
export async function loadSection(
  chapterNum: number,
  slug: string,
  lang: Lang = DEFAULT_LANG,
): Promise<SectionContent> {
  const fs = await import("fs/promises");
  const path = await import("path");

  const index = await loadIndex(lang);
  const chapter = index.chapters.find((c) => c.number === chapterNum);

  if (!chapter) {
    throw new Error(`Chapter ${chapterNum} not found`);
  }

  const section = findSectionBySlug(chapter.sections, slug);
  if (!section) {
    throw new Error(
      `Section "${slug}" not found in chapter ${chapterNum}`,
    );
  }

  const filePath = path.join(
    process.cwd(),
    CONTENT_BASE,
    await getBookPath(lang),
    chapter.folderName,
    section.fileName,
  );

  const content = await fs.readFile(filePath, "utf-8");
  return JSON.parse(content);
}

// Load merged content (intro + section 01) for chapters with minimal intros
export async function loadMergedSection(
  chapterNum: number,
  lang: Lang = DEFAULT_LANG,
): Promise<SectionContent> {
  const index = await loadIndex(lang);
  const chapter = index.chapters.find((c) => c.number === chapterNum);

  if (!chapter) {
    throw new Error(`Chapter ${chapterNum} not found`);
  }

  if (!chapter.introIsMerged || chapter.sections.length < 2) {
    return loadSection(chapterNum, "intro", lang);
  }

  const intro = await loadSection(chapterNum, "intro", lang);
  const section1 = await loadSection(chapterNum, "01", lang);

  const mergedContent: SectionContent = {
    id: section1.id,
    title: section1.title,
    section_id: section1.section_id,
    links: section1.links,
    content: [...intro.content, ...section1.content],
  };

  return mergedContent;
}

// Load section by its full ID (e.g., "mybook/01/01")
export async function loadSectionById(
  sectionId: string,
  lang: Lang = DEFAULT_LANG,
): Promise<SectionContent> {
  const fs = await import("fs/promises");
  const path = await import("path");

  const filePath = path.join(
    process.cwd(),
    CONTENT_BASE,
    lang,
    sectionId + ".json",
  );

  const content = await fs.readFile(filePath, "utf-8");
  return JSON.parse(content);
}

export function cleanTitle(title: string): string {
  return title
    .replace(/\.{2,}\s*\d+$/, "")
    .replace(/^\d+\.\d+\s*/, "")
    .trim();
}

// Get the effective first section slug for a chapter
export function getEffectiveFirstSection(chapter: Chapter): string {
  return chapter.introIsMerged ? "01" : "intro";
}

// Get navigation links, accounting for merged intros
export function getNavigation(
  index: BookIndex,
  chapterNum: number,
  slug: string,
) {
  const currentChapter = index.chapters.find((c) => c.number === chapterNum);
  if (!currentChapter) return { next: null, previous: null };

  let next: { chapterNum: number; slug: string; title: string } | null = null;
  let previous: { chapterNum: number; slug: string; title: string } | null =
    null;

  const flat = flattenSections(currentChapter.sections);
  const effectiveSlug =
    currentChapter.introIsMerged && slug === "intro" ? "01" : slug;

  const currentIdx = flat.findIndex((s) => s.slug === effectiveSlug);

  // Next section
  if (currentIdx >= 0 && currentIdx < flat.length - 1) {
    const nextSection = flat[currentIdx + 1];
    next = {
      chapterNum: currentChapter.number,
      slug: nextSection.slug,
      title: nextSection.title,
    };
  } else {
    // First section of next chapter
    const chapterIdx = index.chapters.findIndex(
      (c) => c.number === currentChapter.number,
    );
    if (chapterIdx < index.chapters.length - 1) {
      const nextChapter = index.chapters[chapterIdx + 1];
      const nextFirst = getEffectiveFirstSection(nextChapter);
      const nextSection = findSectionBySlug(nextChapter.sections, nextFirst);
      if (nextSection) {
        next = {
          chapterNum: nextChapter.number,
          slug: nextFirst,
          title: nextSection.title,
        };
      }
    }
  }

  // Previous section
  const effectiveFirst = getEffectiveFirstSection(currentChapter);
  const effectiveFirstIdx = flat.findIndex(
    (s) => s.slug === effectiveFirst,
  );

  if (currentIdx > effectiveFirstIdx) {
    let prevIdx = currentIdx - 1;
    // Skip minimal intro
    if (
      currentChapter.introIsMerged &&
      flat[prevIdx]?.slug === "intro"
    ) {
      prevIdx--;
    }
    if (prevIdx >= 0) {
      const prevSection = flat[prevIdx];
      previous = {
        chapterNum: currentChapter.number,
        slug: prevSection.slug,
        title: prevSection.title,
      };
    }
  }

  // If no previous in current chapter, go to last section of previous chapter
  if (!previous && currentIdx <= effectiveFirstIdx) {
    const chapterIdx = index.chapters.findIndex(
      (c) => c.number === currentChapter.number,
    );
    if (chapterIdx > 0) {
      const prevChapter = index.chapters[chapterIdx - 1];
      const prevFlat = flattenSections(prevChapter.sections);
      const lastSection = prevFlat[prevFlat.length - 1];
      if (lastSection) {
        previous = {
          chapterNum: prevChapter.number,
          slug: lastSection.slug,
          title: lastSection.title,
        };
      }
    }
  }

  return { next, previous };
}

export function getSectionUrl(
  chapterNum: number,
  slug: string,
  chapter?: Chapter,
  lang: Lang = DEFAULT_LANG,
): string {
  if (slug === "intro") {
    return `/${lang}/chapter/${chapterNum}`;
  }
  if (slug === "01" && chapter?.introIsMerged) {
    return `/${lang}/chapter/${chapterNum}`;
  }
  return `/${lang}/chapter/${chapterNum}/section/${slug}`;
}

// Format a section slug for display: "01" -> "1", "01_01" -> "1.1"
export function formatSlug(chapterNum: number, slug: string): string {
  if (slug === "intro") return "intro";
  if (/^\d{2}$/.test(slug)) return `${chapterNum}.${parseInt(slug, 10)}`;
  if (/^\d{2}_\d{2}$/.test(slug)) {
    const parts = slug.split("_");
    return `${chapterNum}.${parseInt(parts[0], 10)}.${parseInt(parts[1], 10)}`;
  }
  return slug;
}
