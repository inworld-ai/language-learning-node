/**
 * Supabase Backend Client Configuration
 *
 * Sets up Supabase client for server-side operations (memories, embeddings).
 * Uses secret key for admin access (bypasses RLS).
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('Supabase');

let supabaseClient: SupabaseClient | null = null;

/**
 * Get or create the Supabase client singleton.
 * Returns null if environment variables are not configured.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    logger.debug('supabase_not_configured');
    return null;
  }

  supabaseClient = createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  logger.info('supabase_client_initialized');
  return supabaseClient;
}

/**
 * Check if Supabase is configured and available.
 */
export function isSupabaseConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}
