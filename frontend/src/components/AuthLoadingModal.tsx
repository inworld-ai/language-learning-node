import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { AppModal, ModalSpinner } from './AppModal';

export function AuthLoadingModal() {
  const { user } = useAuth();
  const { state } = useApp();
  const [visible, setVisible] = useState(false);
  const prevUserRef = useRef<string | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  // Show modal only on actual sign-in (not initial page load with persisted session)
  useEffect(() => {
    const currentUserId = user?.id ?? null;

    if (isFirstRender.current) {
      // First render: just record the initial auth state, don't show modal
      isFirstRender.current = false;
      prevUserRef.current = currentUserId;
      return undefined;
    }

    const prevUserId = prevUserRef.current;
    prevUserRef.current = currentUserId;

    // Show loading when user actually signs in (not on page load)
    if (!prevUserId && currentUserId) {
      setVisible(true);
      maxTimerRef.current = setTimeout(() => setVisible(false), 10000);
      return () => {
        if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
      };
    }

    // Hide on sign out
    if (prevUserId && !currentUserId) {
      setVisible(false);
    }

    return undefined;
  }, [user]);

  // Dismiss when Supabase sync is actually complete
  useEffect(() => {
    if (visible && user && state.syncComplete) {
      const timer = setTimeout(() => {
        setVisible(false);
        if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
      }, 300);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [visible, user, state.syncComplete]);

  return (
    <AppModal visible={visible}>
      <ModalSpinner />
      <h2 className="welcome-title">Loading your data</h2>
      <p className="welcome-description">
        Syncing your conversations and flashcards...
      </p>
    </AppModal>
  );
}
