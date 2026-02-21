import { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';

export function Sidebar() {
  const {
    state,
    selectConversation,
    createNewConversation,
    deleteConversation,
    renameConversation,
    toggleSidebar,
    changeUiLanguage,
  } = useApp();
  const {
    conversations,
    currentConversationId,
    sidebarOpen,
    availableLanguages,
    uiLanguage,
  } = state;

  // Helper to get flag for a language code
  const getFlag = (languageCode: string): string => {
    const lang = availableLanguages.find((l) => l.code === languageCode);
    return lang?.flag || '';
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showLangMenu, setShowLangMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const langMenuRef = useRef<HTMLDivElement>(null);

  // Use uiLanguage for the button display (doesn't change when switching conversations)
  const currentLang = availableLanguages.find((l) => l.code === uiLanguage);

  // Focus input when editing starts
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  // Close language menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        langMenuRef.current &&
        !langMenuRef.current.contains(event.target as Node)
      ) {
        setShowLangMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLanguageSelect = (langCode: string) => {
    if (langCode !== uiLanguage) {
      changeUiLanguage(langCode);
    }
    setShowLangMenu(false);
  };

  const startEditing = (conversationId: string, currentTitle: string) => {
    setEditingId(conversationId);
    setEditValue(currentTitle);
  };

  const saveEdit = () => {
    if (editingId && editValue.trim()) {
      renameConversation(editingId, editValue.trim());
    }
    setEditingId(null);
    setEditValue('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  };

  return (
    <>
      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={toggleSidebar} />
      )}

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="new-chat-wrapper" ref={langMenuRef}>
            <button
              className="new-chat-button"
              onClick={createNewConversation}
              title="Start a new conversation"
            >
              New chat
            </button>
            <button
              className="new-chat-lang-button"
              onClick={() => setShowLangMenu(!showLangMenu)}
              title="Select language for new chat"
            >
              <span className="lang-flag">{currentLang?.flag || '🌐'}</span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {showLangMenu && (
              <div className="new-chat-lang-dropdown">
                {availableLanguages.map((lang) => (
                  <button
                    key={lang.code}
                    className={`lang-option ${lang.code === uiLanguage ? 'active' : ''}`}
                    onClick={() => handleLanguageSelect(lang.code)}
                  >
                    <span className="lang-flag">{lang.flag}</span>
                    <span className="lang-name">{lang.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            className="sidebar-close-button"
            onClick={toggleSidebar}
            title="Close sidebar"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="sidebar-conversations">
          {conversations.length === 0 ? (
            <div className="sidebar-empty">
              <p>No conversations yet</p>
              <p className="sidebar-empty-hint">
                Start a new chat to begin learning!
              </p>
            </div>
          ) : (
            <ul className="conversation-list">
              {conversations.map((conversation) => (
                <li
                  key={conversation.id}
                  className={`conversation-item ${
                    conversation.id === currentConversationId ? 'active' : ''
                  }`}
                >
                  {editingId === conversation.id ? (
                    <div className="conversation-edit">
                      <input
                        ref={inputRef}
                        type="text"
                        className="conversation-edit-input"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={saveEdit}
                        onKeyDown={handleKeyDown}
                      />
                    </div>
                  ) : (
                    <>
                      <button
                        className="conversation-button"
                        onClick={() => selectConversation(conversation.id)}
                      >
                        <span className="conversation-flag-left">
                          {getFlag(conversation.languageCode)}
                        </span>
                        <span className="conversation-title">
                          {conversation.title}
                        </span>
                      </button>
                      <div className="conversation-actions">
                        <button
                          className="conversation-action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditing(conversation.id, conversation.title);
                          }}
                          title="Rename conversation"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          className="conversation-action-btn conversation-delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteConversation(conversation.id);
                          }}
                          title="Delete conversation"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="sidebar-footer">
          <a
            href="https://render.com/deploy?repo=https://github.com/inworld-ai/language-learning-node"
            target="_blank"
            rel="noopener noreferrer"
            className="sidebar-footer-link"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            <span>Render</span>
          </a>
          <a
            href="https://github.com/inworld-ai/language-learning-node"
            target="_blank"
            rel="noopener noreferrer"
            className="sidebar-footer-link"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
            <span>GitHub</span>
          </a>
        </div>
      </aside>
    </>
  );
}
