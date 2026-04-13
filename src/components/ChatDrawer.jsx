import { useState, useEffect, useRef, useCallback } from "react";
import Markdown from "react-markdown";
import { initRAG, query as ragQuery, getRAGMode, setRAGMode } from "../rag/index";
import { t } from "../lib/i18n";
import "./ChatDrawer.css";

function getCurrentLang() {
  if (typeof window === "undefined") return "eng";
  const m = window.location.pathname.match(/^\/(\w+)\//);
  return m ? m[1] : "eng";
}

// Extract chapter number and section slug from a backend source URL
// e.g., "/eng/mybook/15/02#chunk-39" -> { chapter: 15, slug: "02" }
// e.g., "/eng/mybook/03/intro#chunk-1" -> { chapter: 3, slug: "intro" }
function extractSectionInfo(url) {
  if (!url) return null;
  const clean = url.replace(/#.*$/, "");
  const match = clean.match(/\/[a-z]{3}\/[^/]+\/(\d+)\/([^/]+)$/);
  if (!match) return null;
  return { chapter: parseInt(match[1], 10), slug: match[2] };
}

// Format chapter + slug for display: "15.2", "3.1.1", "3.0"
function formatDisplayNumber(chapter, slug) {
  if (slug === "intro") return `${chapter}.0`;
  if (/^\d{2}$/.test(slug)) return `${chapter}.${parseInt(slug, 10)}`;
  if (/^\d{2}_\d{2}$/.test(slug)) {
    const parts = slug.split("_");
    return `${chapter}.${parseInt(parts[0], 10)}.${parseInt(parts[1], 10)}`;
  }
  return `${chapter}.${slug}`;
}

// Convert a backend source URL to a frontend route
function sourceUrlToFrontendUrl(url) {
  const info = extractSectionInfo(url);
  if (!info) return url;
  const lang = getCurrentLang();
  const { chapter, slug } = info;
  if (slug === "intro") return `/${lang}/chapter/${chapter}.html`;
  const merged = (typeof window !== "undefined" && window.__mergedChapters) || [];
  if (slug === "01" && merged.includes(chapter)) return `/${lang}/chapter/${chapter}.html`;
  return `/${lang}/chapter/${chapter}/section/${slug}.html`;
}

// Convert citation patterns in text to markdown links
// Convert [Source N] citations in text to compact clickable links
// Both LLM and template modes use the same format (1-indexed into sources array)
function processCitations(text, sources, usedLlm) {
  if (!text) return text;

  let result = text;

  // Strip any trailing "Sources" / "## Sources" section
  result = result.replace(/\n*\s*#*\s*sources:?\s*\n[\s\S]*$/i, "");

  // Replace [Source N] citations with compact clickable links
  result = result.replace(/\[Source\s+(\d+)\]/gi, (match, num) => {
    const index = parseInt(num, 10) - 1;
    const source = sources?.[index];
    if (!source) return match;
    const info = extractSectionInfo(source.url);
    const url = sourceUrlToFrontendUrl(source.url) || "#";
    const label = info ? formatDisplayNumber(info.chapter, info.slug) : null;
    return label ? `[📖 ${label}](${url})` : `[📖](${url})`;
  });

  // Clean up
  result = result.replace(/  +/g, " ");
  result = result.replace(/\(\s*\)/g, "");

  return result;
}

// Search modes
const SEARCH_MODES = {
  local: "local", // Client-side FTS (fast, free, works offline)
  semantic: "semantic", // Local RAG with vector embeddings (offline)
};

// Confidence indicator with three-step scale
function ConfidenceIndicator({ confidence, lang }) {
  const percent = confidence * 100;

  let level, label, barWidth;
  if (percent >= 70) {
    level = "high";
    label = t("confidenceHigh", lang);
    barWidth = "100%";
  } else if (percent >= 50) {
    level = "medium";
    label = t("confidenceMedium", lang);
    barWidth = "66%";
  } else {
    level = "low";
    label = t("confidenceLow", lang);
    barWidth = "33%";
  }

  return (
    <div className={`confidence-indicator confidence-${level}`}>
      <span className="confidence-label">{t("confidenceLabel", lang)}</span>
      <div className="confidence-bar">
        <div className="confidence-fill" style={{ width: barWidth }} />
      </div>
      <span className="confidence-value">{label}</span>
    </div>
  );
}

function ChatDrawer({ currentPath }) {
  // Track language in state to avoid SSR/client mismatch (SSR has no window.location)
  const [lang, setLang] = useState("eng");
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const searchMode = SEARCH_MODES.semantic;
  const [ragStatus, setRagStatus] = useState("loading");
  const [ragMode, setRagModeState] = useState(getRAGMode);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Update lang from URL on mount and when path changes
  useEffect(() => {
    setLang(getCurrentLang());
  }, [currentPath]);

  // Switch RAG mode
  const handleModeSwitch = useCallback((mode) => {
    setRAGMode(mode);
    setRagModeState(mode);
    setRagStatus("loading");
    initRAG(mode)
      .then(() => setRagStatus("ready"))
      .catch((err) => {
        console.error("Failed to init RAG engine:", err);
        setRagStatus("error");
      });
  }, []);

  // Initialize RAG engine on mount
  useEffect(() => {
    initRAG()
      .then(() => setRagStatus("ready"))
      .catch((err) => {
        console.error("Failed to init RAG engine:", err);
        setRagStatus("error");
      });
  }, []);

  // Restore state from sessionStorage on mount
  useEffect(() => {
    const saved = sessionStorage.getItem("chat-state");
    if (saved) {
      try {
        const state = JSON.parse(saved);
        setMessages(state.messages || []);
        setInputValue(state.inputValue || "");
        // searchMode is now a constant, no need to restore
      } catch (e) {
        console.error("Failed to restore chat state:", e);
      }
    }
  }, []);

  // Save state to sessionStorage on changes
  useEffect(() => {
    const state = {
      messages,
      inputValue,
      searchMode,
    };
    sessionStorage.setItem("chat-state", JSON.stringify(state));
  }, [messages, inputValue, searchMode]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Dispatch sources-updated event when new assistant message with sources arrives
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === "assistant" && lastMessage.sources) {
      window.dispatchEvent(
        new CustomEvent("sources-updated", {
          detail: { sources: lastMessage.sources },
        }),
      );
      sessionStorage.setItem(
        "relevant-sources",
        JSON.stringify(lastMessage.sources),
      );
    }
  }, [messages]);

  // Local search handler
  const handleLocalSearch = async (question) => {
    const results = await localSearch(question, 5);

    if (results.length === 0) {
      return {
        answer:
          t("noResults", lang),
        sources: [],
        confidence: 0,
      };
    }

    // Calculate confidence from top result relevance
    const confidence = results[0]?.relevance || 0.5;

    return {
      answer: t("foundSections", lang).replace("{count}", results.length),
      sources: results,
      confidence: confidence,
    };
  };

  // Semantic RAG search handler (offline)
  const handleSemanticSearch = async (question) => {
    const data = await ragQuery(question, lang);
    return {
      answer: data.answer,
      sources: data.sources,
      confidence: data.confidence,
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const question = inputValue.trim();
    if (!question || isLoading) return;

    // Add user message
    const userMessage = { role: "user", content: question };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);
    setError(null);

    try {
      let data;

      if (searchMode === SEARCH_MODES.local) {
        // Use client-side FTS
        data = await handleLocalSearch(question);
      } else {
        // Use local RAG with vector embeddings
        data = await handleSemanticSearch(question);
      }

      // Add assistant message with sources
      const assistantMessage = {
        role: "assistant",
        content: data.answer,
        sources: data.sources || [],
        confidence: data.confidence,
        searchMode: searchMode, // Track which mode was used
        usedLlm: data.used_llm || false, // Track if LLM was used
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.error("Chat error:", err);
      setError(err.message);
      setMessages((prev) => [
        ...prev,
        {
          role: "error",
          content: `Failed to get response: ${err.message}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCitationClick = (source) => {
    // Close the chat panel so content is visible after navigation
    sessionStorage.setItem("chat-panel-open", "false");
    document.body.classList.remove("chat-open");
    // Convert backend URL to frontend route and navigate
    window.location.href = sourceUrlToFrontendUrl(source.url);
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
    sessionStorage.removeItem("chat-state");
    sessionStorage.removeItem("relevant-sources");
    window.dispatchEvent(
      new CustomEvent("sources-updated", {
        detail: { sources: [] },
      }),
    );
  };

  // Close chat panel and show book content
  const showBookContent = () => {
    sessionStorage.setItem("chat-panel-open", "false");
    document.body.classList.remove("chat-open");
  };

  // Get badge label for search mode
  const getModeBadgeLabel = (mode) => {
    switch (mode) {
      case SEARCH_MODES.local:
        return t("searchLocal", lang);
      case SEARCH_MODES.semantic:
        return "Semantic";
      default:
        return mode;
    }
  };

  return (
      <aside className="chat-drawer">
        <header className="chat-header">
          <div className="chat-title-row">
            <h2 className="chat-title">{t("askTheHandbook", lang)}</h2>
          </div>
          <div className="rag-mode-toggle">
            <button
              className={`mode-btn${ragMode === "mini" ? " active" : ""}`}
              onClick={() => handleModeSwitch("mini")}
              disabled={ragStatus === "loading"}
            >
              Mini
            </button>
            <button
              className={`mode-btn${ragMode === "standard" ? " active" : ""}`}
              onClick={() => handleModeSwitch("standard")}
              disabled={ragStatus === "loading"}
            >
              Standard
            </button>
          </div>
          <div className="chat-header-actions">
            {messages.length > 0 && (
              <button
                className="chat-action-btn"
                onClick={clearChat}
                title={t("clearChat", lang)}
              >
                🗑️
              </button>
            )}
            <button
              className="chat-action-btn"
              onClick={showBookContent}
              title={t("viewBookContent", lang)}
            >
              📖
            </button>
          </div>
        </header>

        <div className="chat-messages">
          {messages.length === 0 && (
            <div className="chat-welcome">
              {ragStatus === "loading" && (
                  <p className="index-status">Loading search engine...</p>
                )}
              {ragStatus === "ready" && (
                <p className="index-status ready">Search engine ready</p>
              )}
              {ragStatus === "error" && (
                <p className="index-status">Search engine failed to load</p>
              )}
              <div className="example-questions">
                <button
                  className="example-question"
                  onClick={() => setInputValue(t("exampleHealthyAnimal", lang))}
                >
                  {t("exampleHealthyAnimal", lang)}
                </button>
                <button
                  className="example-question"
                  onClick={() => setInputValue(t("examplePreventDisease", lang))}
                >
                  {t("examplePreventDisease", lang)}
                </button>
                <button
                  className="example-question"
                  onClick={() => setInputValue(t("exampleFeverSigns", lang))}
                >
                  {t("exampleFeverSigns", lang)}
                </button>
              </div>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} className={`chat-message ${msg.role}`}>
              {msg.role === "user" && (
                <div className="message-content user-message">
                  {msg.content}
                </div>
              )}

              {msg.role === "assistant" && (
                <>
                  <div className="message-content assistant-message">
                    <Markdown
                      components={{
                        a: ({ href, children }) => (
                          <a
                            href={href}
                            className="citation-link"
                            onClick={(e) => {
                              if (href?.match(/^\/[a-z]{3}\/chapter\//)) {
                                e.preventDefault();
                                sessionStorage.setItem(
                                  "chat-panel-open",
                                  "false",
                                );
                                document.body.classList.remove("chat-open");
                                window.location.href = href;
                              }
                            }}
                          >
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {processCitations(msg.content, msg.sources, msg.usedLlm)}
                    </Markdown>
                    {msg.searchMode && (
                      <span className={`search-mode-badge ${msg.searchMode}`}>
                        {getModeBadgeLabel(msg.searchMode)}
                      </span>
                    )}
                  </div>

                  {msg.confidence !== undefined && msg.confidence > 0 && (
                    <ConfidenceIndicator confidence={msg.confidence} lang={lang} />
                  )}
                </>
              )}

              {msg.role === "error" && (
                <div className="message-content error-message">
                  {msg.content}
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="chat-message assistant">
              <div className="message-content assistant-message loading">
                <span className="loading-dots">
                  <span>.</span>
                  <span>.</span>
                  <span>.</span>
                </span>
                {t("searchingHandbook", lang)}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <form className="chat-input-form" onSubmit={handleSubmit}>
          <textarea
            ref={inputRef}
            className="chat-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder={t("askPlaceholder", lang)}
            rows={2}
            disabled={isLoading || ragStatus === "loading"}
          />
          <button
            type="submit"
            className="chat-submit-btn"
            disabled={isLoading || !inputValue.trim() || ragStatus === "loading"}
          >
            {isLoading ? "..." : "→"}
          </button>
        </form>
      </aside>
  );
}

export default ChatDrawer;
