import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { AppModal, ModalSpinner } from './AppModal';

export function AuthLoadingModal() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const prevUserRef = useRef<string | null>(null);

  useEffect(() => {
    const prevUserId = prevUserRef.current;
    const currentUserId = user?.id ?? null;
    prevUserRef.current = currentUserId;

    if (!prevUserId && currentUserId) {
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 2000);
      return () => clearTimeout(timer);
    }

    if (prevUserId && !currentUserId) {
      setVisible(false);
    }

    return undefined;
  }, [user]);

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
