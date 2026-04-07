import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { AppModal, ModalSpinner } from './AppModal';

export function AuthLoadingModal() {
  const { user, isLoading } = useAuth();
  const { state } = useApp();
  const [visible, setVisible] = useState(false);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Once auth finishes initial load, we start watching for sign-in actions */
  const authSettled = useRef(false);
  const prevUserId = useRef<string | null>(null);

  useEffect(() => {
    // Wait for auth to finish its initial session check
    if (isLoading) return;

    const currentUserId = user?.id ?? null;

    if (!authSettled.current) {
      // Auth just settled for the first time — this is page load, not a sign-in
      authSettled.current = true;
      prevUserId.current = currentUserId;
      return;
    }

    // After auth has settled, detect actual sign-in (null → userId)
    if (!prevUserId.current && currentUserId) {
      setVisible(true);
      maxTimerRef.current = setTimeout(() => setVisible(false), 10000);
    }

    // Sign out
    if (prevUserId.current && !currentUserId) {
      setVisible(false);
    }

    prevUserId.current = currentUserId;
  }, [user, isLoading]);

  // Dismiss when Supabase sync completes
  useEffect(() => {
    if (visible && state.syncComplete) {
      const timer = setTimeout(() => {
        setVisible(false);
        if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
      }, 300);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [visible, state.syncComplete]);

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
