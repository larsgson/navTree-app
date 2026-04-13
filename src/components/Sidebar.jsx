import { useState, useEffect, useRef, useCallback } from "react";
import { t } from "../lib/i18n";
import "./Sidebar.css";

// Format slug for display: "intro" -> translated, "01" -> "N.1", "01_01" -> "N.1.1"
function formatSlug(chapterNum, slug, lang) {
  if (slug === "intro") return t("intro", lang);
  if (/^\d{2}$/.test(slug)) return `${chapterNum}.${parseInt(slug, 10)}`;
  if (/^\d{2}_\d{2}$/.test(slug)) {
    const parts = slug.split("_");
    return `${chapterNum}.${parseInt(parts[0], 10)}.${parseInt(parts[1], 10)}`;
  }
  return slug;
}

// Flatten section tree into document order
function flattenSections(sections) {
  const result = [];
  for (const s of sections) {
    result.push(s);
    if (s.children) {
      for (const c of s.children) result.push(c);
    }
  }
  return result;
}

function Sidebar({ index, currentPath, lang = "eng", languages = [] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedChapter, setExpandedChapter] = useState(null);
  const [relevantSources, setRelevantSources] = useState([]);
  const [chatButtonClickable, setChatButtonClickable] = useState(true);
  const prevPathRef = useRef(currentPath);
  const justToggledRef = useRef(false);
  const [expandedCollapsedGroups, setExpandedCollapsedGroups] = useState(
    new Set(),
  );

  // Sync isOpen state
  useEffect(() => {
    sessionStorage.setItem("sidebar-open", isOpen ? "true" : "false");
    window.dispatchEvent(
      new CustomEvent("sidebar-state-changed", { detail: { isOpen } }),
    );
    if (isOpen) {
      document.body.classList.add("sidebar-open");
    } else {
      document.body.classList.remove("sidebar-open");
    }
  }, [isOpen]);

  // Parse current path to determine active chapter/section slug
  const parseCurrentPath = () => {
    if (!currentPath || currentPath === "/")
      return { chapter: null, section: null };

    const match = currentPath.match(
      /^\/(?:\w+)\/chapter\/(\d+)(?:\/section\/([^/]+))?$/,
    );
    if (match) {
      return {
        chapter: parseInt(match[1]),
        section: match[2] || "intro",
      };
    }
    return { chapter: null, section: null };
  };

  const { chapter: currentChapter, section: currentSection } =
    parseCurrentPath();

  // Auto-expand current chapter
  useEffect(() => {
    if (currentChapter && expandedChapter !== currentChapter) {
      setExpandedChapter(currentChapter);
    }
  }, [currentChapter]);

  // Close sidebar on mobile when route changes
  useEffect(() => {
    if (prevPathRef.current === currentPath) return;
    prevPathRef.current = currentPath;
    if (justToggledRef.current) {
      justToggledRef.current = false;
      return;
    }
    setIsOpen(false);
  }, [currentPath]);

  // Listen for menu button clicks
  useEffect(() => {
    const handleToggle = () => {
      justToggledRef.current = true;
      setTimeout(() => {
        justToggledRef.current = false;
      }, 1000);

      setIsOpen((prev) => {
        if (!prev) {
          document.body.classList.remove("chat-open");
          sessionStorage.setItem("chat-panel-open", "false");
          setChatButtonClickable(false);
          setTimeout(() => setChatButtonClickable(true), 400);
        }
        return !prev;
      });
    };
    window.addEventListener("toggle-sidebar", handleToggle);
    return () => window.removeEventListener("toggle-sidebar", handleToggle);
  }, []);

  // Chat button click handler
  const handleChatClick = useCallback(() => {
    window.dispatchEvent(new CustomEvent("toggle-chat"));
    setIsOpen(false);
  }, []);

  // Listen for sources updates
  useEffect(() => {
    const handleSourcesUpdate = (e) => {
      const sources = e.detail.sources || [];
      console.log("Sidebar received sources:", JSON.stringify(sources.map(s => s.url)));
      setRelevantSources(sources);
    };

    window.addEventListener("sources-updated", handleSourcesUpdate);
    return () =>
      window.removeEventListener("sources-updated", handleSourcesUpdate);
  }, []);

  // Restore sources from sessionStorage
  useEffect(() => {
    const saved = sessionStorage.getItem("relevant-sources");
    if (saved) {
      try {
        setRelevantSources(JSON.parse(saved));
      } catch (e) {
        // Ignore parse errors
      }
    }
  }, []);

  // Expose merged chapters for ChatDrawer
  useEffect(() => {
    if (index?.chapters) {
      window.__mergedChapters = index.chapters
        .filter((c) => c.introIsMerged)
        .map((c) => c.number);
    }
  }, [index]);

  // Auto-expand first chapter with relevant sources
  useEffect(() => {
    if (relevantSources.length > 0) {
      const firstSource = relevantSources[0];
      let firstRelevantChapter = firstSource?.chapter_num;
      if (firstRelevantChapter === undefined && firstSource?.url) {
        const frontendMatch = firstSource.url.match(/\/chapter\/(\d+)/);
        const backendMatch = firstSource.url.match(/\/[a-z]{3}\/[^/]+\/(\d+)/);
        const match = frontendMatch || backendMatch;
        if (match) {
          firstRelevantChapter = parseInt(match[1]);
        }
      }
      if (firstRelevantChapter && expandedChapter !== firstRelevantChapter) {
        setExpandedChapter(firstRelevantChapter);
      }
      setExpandedCollapsedGroups(new Set());
    }
  }, [relevantSources]);

  if (!index) {
    return null;
  }

  const cleanTitle = (title) => {
    return title.replace(/^\d+\.\d+\s*/, "").trim();
  };

  const isActiveChapter = (chapterNum) => {
    return currentChapter === chapterNum;
  };

  const isActiveSection = (chapterNum, slug) => {
    return currentChapter === chapterNum && currentSection === slug;
  };

  // Parse chapter and section slug from source
  const parseSource = (source) => {
    if (source.chapter_num !== undefined) {
      return {
        chapter: source.chapter_num,
        slug: source.section_slug || (source.section_num !== undefined ? String(source.section_num).padStart(2, "0") : null),
      };
    }
    if (source.url) {
      // Frontend format: /chapter/N/section/SLUG
      const frontendMatch = source.url.match(
        /\/chapter\/(\d+)(?:\/section\/([^/?#]+))?/,
      );
      if (frontendMatch) {
        return {
          chapter: parseInt(frontendMatch[1]),
          slug: frontendMatch[2] || "intro",
        };
      }
      // Backend format: /lang/book/NN_title/NN_title
      const backendMatch = source.url
        .replace(/#.*$/, "")
        .match(/\/[a-z]{3}\/[^/]+\/(\d+)[^/]*\/(\d+)[^/]*$/);
      if (backendMatch) {
        return {
          chapter: parseInt(backendMatch[1]),
          slug: backendMatch[2],
        };
      }
    }
    return null;
  };

  const isSectionRelevant = (chapterNum, slug) => {
    return relevantSources.some((s) => {
      const parsed = parseSource(s);
      return parsed && parsed.chapter === chapterNum && parsed.slug === slug;
    });
  };

  const isChapterRelevant = (chapterNum) => {
    return relevantSources.some((s) => {
      const parsed = parseSource(s);
      return parsed && parsed.chapter === chapterNum;
    });
  };

  const hasRelevantSources = relevantSources.length > 0;

  const handleChapterClick = (chapter) => {
    setExpandedChapter((current) =>
      current === chapter.number ? null : chapter.number,
    );
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const closeChatPanel = () => {
    sessionStorage.setItem("chat-panel-open", "false");
    document.body.classList.remove("chat-open");
  };

  const getSectionUrl = (chapterNum, slug) => {
    if (slug === "intro") {
      return `/${lang}/chapter/${chapterNum}.html`;
    }
    return `/${lang}/chapter/${chapterNum}/section/${slug}.html`;
  };

  const toggleCollapsedGroup = (groupKey) => {
    setExpandedCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  // Group chapters into relevant and non-relevant segments for collapsed view
  const getChapterGroups = () => {
    if (!hasRelevantSources || !index?.chapters) {
      return null;
    }

    const groups = [];
    let currentNonRelevant = [];
    let lastRelevantIdx = -1;
    index.chapters.forEach((chapter, idx) => {
      if (isChapterRelevant(chapter.number)) {
        lastRelevantIdx = idx;
      }
    });

    index.chapters.forEach((chapter, idx) => {
      if (isChapterRelevant(chapter.number)) {
        if (currentNonRelevant.length > 0) {
          groups.push({
            type: "collapsed",
            chapters: currentNonRelevant,
            key: `collapsed-before-${chapter.number}`,
          });
          currentNonRelevant = [];
        }
        groups.push({
          type: "relevant",
          chapter,
          key: `chapter-${chapter.number}`,
        });
      } else {
        if (idx < lastRelevantIdx) {
          currentNonRelevant.push(chapter);
        } else {
          if (currentNonRelevant.length > 0) {
            groups.push({
              type: "collapsed",
              chapters: currentNonRelevant,
              key: `collapsed-before-end`,
            });
            currentNonRelevant = [];
          }
          groups.push({
            type: "trailing",
            chapter,
            key: `chapter-${chapter.number}`,
          });
        }
      }
    });

    return groups;
  };

  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={handleClose}></div>}

      <aside className={`sidebar ${isOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <h1 className="sidebar-title">{index.book_title}</h1>
          <div className="sidebar-header-actions">
            <button
              onClick={handleChatClick}
              className={`chat-toggle-btn ${hasRelevantSources ? "has-sources" : ""}`}
              style={{ visibility: chatButtonClickable ? "visible" : "hidden" }}
              aria-label={t("openChat", lang)}
              title={t("askTheHandbook", lang)}
            >
              💬
              {hasRelevantSources && (
                <span className="sources-badge">{relevantSources.length}</span>
              )}
            </button>
            <button
              className="close-button"
              onClick={handleClose}
              aria-label={t("closeMenu", lang)}
            >
              ✕
            </button>
          </div>
        </div>

        <nav className="sidebar-nav">
          <a
            href={`/${lang}.html`}
            className={`nav-item home-link ${currentPath === `/${lang}` || currentPath === `/${lang}.html` ? "active" : ""}`}
            onClick={closeChatPanel}
          >
            <span className="nav-icon">🏠</span>
            <span>{t("home", lang)}</span>
          </a>

          <button
            className="nav-item home-link"
            onClick={handleChatClick}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}
          >
            <span className="nav-icon">💬</span>
            <span>{t("askTheHandbook", lang)}</span>
          </button>

          {/* Language switcher - disabled for single-language build
          <div className="language-switcher">
            {languages.map(({ code, label }) => {
              let href;
              if (code === lang) {
                href = currentPath;
              } else {
                const chapterMatch = currentPath.match(/^\/\w+\/chapter\/(\d+)/);
                href = chapterMatch
                  ? `/${code}/chapter/${chapterMatch[1]}`
                  : `/${code}/`;
              }
              return (
                <a
                  key={code}
                  href={href}
                  className={`lang-link ${code === lang ? "active" : ""}`}
                >
                  {label}
                </a>
              );
            })}
          </div>
          */}

          <div className="nav-divider"></div>

          <div className="chapters-list">
            {(() => {
              const chapterGroups = getChapterGroups();

              // Render a single section (top-level or subsection)
              const renderSection = (chapter, section, isChild = false) => {
                // Skip merged intro
                if (section.slug === "intro" && chapter.introIsMerged) {
                  return null;
                }

                const sectionUrl =
                  section.slug === "01" && chapter.introIsMerged
                    ? `/${lang}/chapter/${chapter.number}.html`
                    : getSectionUrl(chapter.number, section.slug);

                // For merged section 01, also check if chapter page (intro) is active
                const isActive =
                  section.slug === "01" && chapter.introIsMerged
                    ? isActiveSection(chapter.number, "intro") ||
                      isActiveSection(chapter.number, "01")
                    : isActiveSection(chapter.number, section.slug);

                const hasChildren =
                  section.children && section.children.length > 0;

                return (
                  <div key={section.slug}>
                    <a
                      href={sectionUrl}
                      className={`nav-item section-item ${isChild ? "subsection-item" : ""} ${
                        isActive ? "active" : ""
                      } ${hasRelevantSources ? (isSectionRelevant(chapter.number, section.slug) ? "relevant" : "dimmed") : ""}`}
                      onClick={closeChatPanel}
                    >
                      <span className="sidebar-section-number">
                        {formatSlug(chapter.number, section.slug, lang)}
                      </span>
                      <span className="sidebar-section-title">
                        {cleanTitle(section.title)}
                      </span>
                    </a>
                    {hasChildren && (
                      <div className="subsections-list">
                        {section.children.map((child) =>
                          renderSection(chapter, child, true),
                        )}
                      </div>
                    )}
                  </div>
                );
              };

              // Render sections list for a chapter
              const renderSections = (chapter) => {
                return chapter.sections.map((section) =>
                  renderSection(chapter, section),
                );
              };

              // Render a single chapter
              const renderChapter = (chapter) => {
                const isExpanded = expandedChapter === chapter.number;
                const isActive = isActiveChapter(chapter.number);
                const chapterIsRelevant = isChapterRelevant(chapter.number);
                const allSections = flattenSections(chapter.sections);

                return (
                  <div key={chapter.number} className="chapter-group">
                    <div
                      className={`nav-item chapter-item ${isActive ? "active" : ""} ${hasRelevantSources ? (chapterIsRelevant ? "relevant" : "dimmed") : ""}`}
                      onClick={() => handleChapterClick(chapter)}
                    >
                      <a
                        href={`/${lang}/chapter/${chapter.number}.html`}
                        className="sidebar-chapter-content"
                        onClick={(e) => {
                          e.stopPropagation();
                          closeChatPanel();
                        }}
                      >
                        <span className="sidebar-chapter-number">
                          {chapter.number}
                        </span>
                        <span className="sidebar-chapter-title">
                          {cleanTitle(chapter.title)}
                        </span>
                      </a>
                      {allSections.length > 1 && (
                        <span
                          className={`expand-icon ${isExpanded ? "expanded" : ""}`}
                        >
                          ▼
                        </span>
                      )}
                    </div>

                    {isExpanded && allSections.length > 1 && (
                      <div className="sections-list">
                        {renderSections(chapter)}
                      </div>
                    )}
                  </div>
                );
              };

              // If no grouping needed, render all chapters normally
              if (!chapterGroups) {
                return index.chapters.map((chapter) => renderChapter(chapter));
              }

              // Render grouped chapters with collapsible sections
              return chapterGroups.map((group) => {
                if (group.type === "relevant" || group.type === "trailing") {
                  return renderChapter(group.chapter);
                }

                const isGroupExpanded = expandedCollapsedGroups.has(group.key);
                const firstChapter = group.chapters[0].number;
                const lastChapter =
                  group.chapters[group.chapters.length - 1].number;

                return (
                  <div key={group.key} className="collapsed-chapters-group">
                    <button
                      className="collapsed-chapters-placeholder"
                      onClick={() => toggleCollapsedGroup(group.key)}
                      title={`${t("chapters", lang)} ${firstChapter}-${lastChapter} (${group.chapters.length} ${t("chapters", lang)})`}
                    >
                      <span className="collapsed-placeholder-icon">
                        {isGroupExpanded ? "▼" : "▶"}
                      </span>
                      <span className="collapsed-placeholder-text">
                        {isGroupExpanded
                          ? t("hideChapters", lang).replace(
                              "{range}",
                              `${firstChapter}-${lastChapter}`,
                            )
                          : t("moreChapters", lang)
                              .replace("{count}", group.chapters.length)
                              .replace(
                                "{range}",
                                `${firstChapter}-${lastChapter}`,
                              )}
                      </span>
                    </button>
                    {isGroupExpanded && (
                      <div className="collapsed-chapters-content">
                        {group.chapters.map((chapter) =>
                          renderChapter(chapter),
                        )}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </nav>
      </aside>
    </>
  );
}

export default Sidebar;
