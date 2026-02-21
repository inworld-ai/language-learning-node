import { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

export function Header() {
  const { state, toggleSidebar } = useApp();
  const { connectionStatus } = state;
  const { user, isLoading, isConfigured, signUp, signIn, signOut } = useAuth();

  const [showAuthForm, setShowAuthForm] = useState(false);
  const [isSignUp, setIsSignUp] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const authFormRef = useRef<HTMLDivElement>(null);
  const signInButtonRef = useRef<HTMLButtonElement>(null);

  const statusMessages: Record<string, string> = {
    connecting: 'Connecting...',
    connected: 'Connected',
    disconnected: 'Disconnected',
  };

  // Close auth form when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const clickedInAuthForm =
        authFormRef.current && authFormRef.current.contains(target);
      const clickedSignInButton =
        signInButtonRef.current && signInButtonRef.current.contains(target);

      // Close auth form if clicked outside (but not on the Sign In button itself)
      if (showAuthForm && !clickedInAuthForm && !clickedSignInButton) {
        setShowAuthForm(false);
      }
    }
    // Use a small delay to prevent immediate closing when opening
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAuthForm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = isSignUp
      ? await signUp(email, password)
      : await signIn(email, password);

    setSubmitting(false);

    if (result.error) {
      setError(result.error);
    } else {
      setShowAuthForm(false);
      setEmail('');
      setPassword('');
    }
  };

  const toggleAuthMode = () => {
    setIsSignUp(!isSignUp);
    setError(null);
  };

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <header className="header">
      <div className="header-content">
        <div className="header-left">
          <button
            className="menu-toggle"
            onClick={toggleSidebar}
            aria-label="Toggle sidebar"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <h1 className="header-logo">Inworld Immersive Tutor</h1>
        </div>

        <div className="header-right">
          {/* Connection Status - Only show when NOT connected */}
          {connectionStatus !== 'connected' && (
            <div className="header-connection-status">
              <span className={`status-dot ${connectionStatus}`} />
              <span className="connection-status-text">
                {statusMessages[connectionStatus] || 'Unknown'}
              </span>
            </div>
          )}

          {/* Auth Section - Always Visible */}
          {isConfigured && (
            <div className="header-auth-section">
              {isLoading ? (
                <div className="header-auth-loading">Loading...</div>
              ) : user ? (
                <div className="header-auth-user">
                  <span className="header-auth-email" title={user.email}>
                    {user.email}
                  </span>
                  <button
                    className="header-sign-out-button"
                    onClick={handleSignOut}
                    title="Sign Out"
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <>
                  <button
                    ref={signInButtonRef}
                    className="header-sign-in-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAuthForm(!showAuthForm);
                    }}
                  >
                    Sign In
                  </button>
                  {showAuthForm && (
                    <div ref={authFormRef} className="header-auth-form-wrapper">
                      <form
                        onSubmit={handleSubmit}
                        className="header-auth-form"
                      >
                        <div className="header-auth-form-header">
                          {isSignUp ? 'Create Account' : 'Sign In'}
                          <button
                            type="button"
                            className="header-auth-form-close"
                            onClick={() => setShowAuthForm(false)}
                            aria-label="Close"
                          >
                            ×
                          </button>
                        </div>
                        {error && (
                          <div className="header-auth-error">{error}</div>
                        )}
                        <input
                          type="email"
                          placeholder="Email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          autoComplete="email"
                          className="header-auth-input"
                        />
                        <input
                          type="password"
                          placeholder="Password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          minLength={6}
                          autoComplete={
                            isSignUp ? 'new-password' : 'current-password'
                          }
                          className="header-auth-input"
                        />
                        <button
                          type="submit"
                          className="header-auth-submit"
                          disabled={submitting}
                        >
                          {submitting
                            ? '...'
                            : isSignUp
                              ? 'Create Account'
                              : 'Sign In'}
                        </button>
                        <button
                          type="button"
                          className="header-auth-toggle"
                          onClick={toggleAuthMode}
                        >
                          {isSignUp
                            ? 'Have an account? Sign In'
                            : 'Need an account? Sign Up'}
                        </button>
                      </form>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Logo */}
          <a
            href="https://www.inworld.ai"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src="/favicon.svg"
              alt="Inworld Language Tutor"
              className="logo-icon"
            />
          </a>
        </div>
      </div>
    </header>
  );
}
