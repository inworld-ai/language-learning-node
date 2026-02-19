import {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  type ReactNode,
} from 'react';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient, User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  supabase: SupabaseClient | null;
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isConfigured: boolean;
  signUp: (
    email: string,
    password: string
  ) => Promise<{ error: string | null }>;
  signIn: (
    email: string,
    password: string
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Singleton Supabase client to prevent multiple instances
let supabaseClientInstance: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClientInstance) {
    return supabaseClientInstance;
  }

  const url = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    console.log('Supabase not configured - running in anonymous mode');
    return null;
  }

  supabaseClientInstance = createClient(url, publishableKey, {
    auth: {
      storageKey: 'aprende-auth-token',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });

  return supabaseClientInstance;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Use useMemo to ensure client is only created once
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const isConfigured = supabase !== null;
  const [isLoading, setIsLoading] = useState(isConfigured);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const friendlyAuthError = (err: unknown): string => {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg === 'Failed to fetch' ||
      msg.includes('NetworkError') ||
      msg.includes('network')
    ) {
      return 'Unable to connect to the authentication server. Check your network connection or verify Supabase is configured correctly.';
    }
    return msg;
  };

  const signUp = async (
    email: string,
    password: string
  ): Promise<{ error: string | null }> => {
    if (!supabase) return { error: 'Supabase not configured' };

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      return { error: error?.message ?? null };
    } catch (err) {
      return { error: friendlyAuthError(err) };
    }
  };

  const signIn = async (
    email: string,
    password: string
  ): Promise<{ error: string | null }> => {
    if (!supabase) return { error: 'Supabase not configured' };

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      return { error: error?.message ?? null };
    } catch (err) {
      return { error: friendlyAuthError(err) };
    }
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        supabase,
        user,
        session,
        isLoading,
        isConfigured,
        signUp,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
