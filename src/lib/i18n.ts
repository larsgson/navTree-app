import appConfig from './appConfig';

export type Lang = string;
export const DEFAULT_LANG: Lang = appConfig.defaultLanguage || "eng";

// Load all locale files at build time via Vite's import.meta.glob (eager)
const localeModules = import.meta.glob<Record<string, string>>(
  "../locales/*.json",
  { eager: true, import: "default" }
);

// Build a map keyed by language code: { eng: { ... }, kir: { ... }, ... }
const locales: Record<string, Record<string, string>> = {};
for (const [path, mod] of Object.entries(localeModules)) {
  const lang = path.match(/\/(\w+)\.json$/)?.[1];
  if (lang) locales[lang] = mod;
}

// Merge app-specific strings from app.config.json into all locales
const appStrings: Record<string, string> = {
  subtitle: appConfig.branding?.subtitle || "",
  metaDescription: appConfig.branding?.metaDescription || "",
  askTheHandbook: appConfig.search?.askLabel || "Search",
  searchingHandbook: appConfig.search?.searchingLabel || "Searching...",
  noResults: appConfig.search?.noResultsLabel || "No results found.",
  foundSections: appConfig.search?.foundSectionsLabel || "Found {count} result(s):",
  exampleHealthyAnimal: appConfig.examples?.question1 || "",
  examplePreventDisease: appConfig.examples?.question2 || "",
  exampleFeverSigns: appConfig.examples?.question3 || "",
};

// Inject app strings as defaults into every locale (locale values take precedence)
for (const lang of Object.keys(locales)) {
  locales[lang] = { ...appStrings, ...locales[lang] };
}
// Also make them available for the default language even if no locale file exists
if (!locales[DEFAULT_LANG]) locales[DEFAULT_LANG] = { ...appStrings };

// Cache for discovered languages
let discoveredLanguages: string[] | null = null;

// Discover available languages by scanning src/data/content/ for directories with _book.toml
export async function getSupportedLanguages(): Promise<string[]> {
  if (discoveredLanguages) return discoveredLanguages;

  const fs = await import("fs/promises");
  const path = await import("path");

  const contentDir = path.join(process.cwd(), "src/data/content");
  const entries = await fs.readdir(contentDir, { withFileTypes: true });
  const langs: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const langDir = path.join(contentDir, entry.name);
    const subEntries = await fs.readdir(langDir, { withFileTypes: true });

    // Check if any subdirectory has _book.toml
    for (const sub of subEntries) {
      if (!sub.isDirectory()) continue;
      try {
        await fs.access(path.join(langDir, sub.name, "_book.toml"));
        langs.push(entry.name);
        break;
      } catch {
        // Not a book directory
      }
    }
  }

  // Sort with default language first
  langs.sort((a, b) => {
    if (a === DEFAULT_LANG) return -1;
    if (b === DEFAULT_LANG) return 1;
    return a.localeCompare(b);
  });

  discoveredLanguages = langs;
  return langs;
}

export function getLanguageLabel(lang: string): string {
  return locales[lang]?.languageLabel || lang.toUpperCase();
}

export function getHtmlLang(lang: string): string {
  return locales[lang]?.htmlLang || lang.substring(0, 2);
}

export function t(key: string, lang: string): string {
  return locales[lang]?.[key] || locales[DEFAULT_LANG]?.[key] || key;
}

export function isValidLang(lang: string): boolean {
  // During build, check against discovered languages
  if (discoveredLanguages) return discoveredLanguages.includes(lang);
  // Fallback: accept any 3-letter code
  return /^[a-z]{3}$/.test(lang);
}
