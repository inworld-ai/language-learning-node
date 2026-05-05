import { useState } from 'react';
import { AppModal } from './AppModal';

const DISMISSED_KEY = 'welcome-dismissed';

export function WelcomeModal() {
  const [visible, setVisible] = useState(
    () => !sessionStorage.getItem(DISMISSED_KEY)
  );

  function dismiss() {
    setVisible(false);
    sessionStorage.setItem(DISMISSED_KEY, '1');
  }

  return (
    <AppModal visible={visible} onDismiss={dismiss}>
      <h2 className="welcome-title">Inworld Language Tutor</h2>
      <p className="welcome-description">
        Practice speaking with an AI language tutor powered by{' '}
        <a href="https://inworld.ai" target="_blank" rel="noopener noreferrer">
          Inworld AI
        </a>
        . Get real-time feedback, build vocabulary with flashcards, and have
        natural conversations — all by voice. The app is{' '}
        <a
          href="https://github.com/inworld-ai/language-learning-node"
          target="_blank"
          rel="noopener noreferrer"
        >
          open source
        </a>{' '}
        and easily deployable on{' '}
        <a
          href="https://render.com/deploy?repo=https://github.com/inworld-ai/language-learning-node"
          target="_blank"
          rel="noopener noreferrer"
        >
          Render
        </a>
        .
      </p>
      <div className="welcome-features">
        <div className="welcome-feature">
          <span>Voice conversations</span>
        </div>
        <div className="welcome-feature">
          <span>Grammar feedback</span>
        </div>
        <div className="welcome-feature">
          <span>Auto flashcards</span>
        </div>
        <div className="welcome-feature">
          <span>60+ languages</span>
        </div>
      </div>
      <button className="welcome-cta" onClick={dismiss}>
        Get Started
      </button>
    </AppModal>
  );
}
