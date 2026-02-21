import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ChatSection } from './components/ChatSection';
import { FlashcardsSection } from './components/FlashcardsSection';
import './styles/main.css';

function AppContent() {
  const { state } = useApp();
  const { switchingConversation } = state;

  return (
    <div className="app-wrapper">
      <Header />
      <div className="app-layout">
        <Sidebar />
        <div className="app-main">
          <main className="main">
            <div className="container">
              <div className="app-grid">
                {switchingConversation ? (
                  <div className="conversation-switch-loading">
                    <div className="chat-loading-spinner" />
                    <div className="chat-loading-text">
                      Switching conversation...
                    </div>
                  </div>
                ) : (
                  <>
                    <ChatSection />
                    <FlashcardsSection />
                  </>
                )}
              </div>
            </div>
          </main>
          {/* Hidden audio elements for TTS playback -- routed through here so browser AEC can cancel echo */}
          <audio id="ttsAudioOutput" style={{ display: 'none' }} playsInline />
          <audio id="ttsAudioOutputFlashcard" style={{ display: 'none' }} playsInline />
        </div>
      </div>
      {/* Floating Action Buttons */}
      <div className="floating-buttons">
        <a
          href="https://render.com/deploy?repo=https://github.com/inworld-ai/language-learning-node"
          target="_blank"
          rel="noopener noreferrer"
          className="fab-button fab-labeled"
          aria-label="Deploy on Render"
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
          <span>Deploy on Render</span>
        </a>
        <a
          href="https://github.com/inworld-ai/language-learning-node"
          target="_blank"
          rel="noopener noreferrer"
          className="fab-button fab-labeled"
          aria-label="GitHub"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
          </svg>
          <span>GitHub</span>
        </a>
      </div>
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
