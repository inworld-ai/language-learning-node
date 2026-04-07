import type { ReactNode } from 'react';

interface AppModalProps {
  visible: boolean;
  onDismiss?: () => void;
  children: ReactNode;
}

/**
 * Reusable modal — single design for welcome, auth loading, export loading, etc.
 * Uses the welcome-overlay + welcome-modal CSS.
 */
export function AppModal({ visible, onDismiss, children }: AppModalProps) {
  if (!visible) return null;

  return (
    <div
      className="welcome-overlay"
      onClick={onDismiss}
      role="dialog"
      aria-modal="true"
    >
      <div className="welcome-modal" onClick={(e) => e.stopPropagation()}>
        {onDismiss && (
          <button
            className="welcome-close"
            onClick={onDismiss}
            aria-label="Close"
          >
            ×
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

/** Spinner element for loading modals */
export function ModalSpinner() {
  return <div className="auth-loading-spinner" />;
}
