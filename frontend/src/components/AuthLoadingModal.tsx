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

  // Show modal when user signs in
  useEffect(() => {
    const prevUserId = prevUserRef.current;
    const currentUserId = user?.id ?? null;
    prevUserRef.current = currentUserId;

    if (!prevUserId && currentUserId) {
      setVisible(true);
      // Safety timeout — dismiss after 10s even if sync hangs
      maxTimerRef.current = setTimeout(() => setVisible(false), 10000);
      return () => {
        if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
      };
    }

    if (prevUserId && !currentUserId) {
      setVisible(false);
    }

    return undefined;
  }, [user]);

  // Dismiss when Supabase sync is actually complete
  useEffect(() => {
    if (visible && user && state.syncComplete) {
      // Small delay so the UI doesn't flash
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
