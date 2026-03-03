/**
 * Supabase Client Configuration
 * Server-side Supabase client for database operations
 */

import { createClient } from '@supabase/supabase-js';

// Get Supabase URL and service role key from environment
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.warn('Warning: SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL not set');
}

if (!supabaseServiceKey) {
  console.warn('Warning: SUPABASE_SERVICE_ROLE_KEY not set');
}

// Create Supabase client with service role key (bypasses RLS)
export const supabase = supabaseUrl && supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

// Helper function to handle Supabase errors
export function handleSupabaseError(error: unknown, context?: string) {
  if (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Supabase error${context ? ` in ${context}` : ''}:`, {
      message,
      context,
      originalError: error,
    });
    throw new Error(message);
  }
}
