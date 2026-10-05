import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

// Public browser configuration; access is controlled by Supabase Auth and RLS.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://pqpezqeagxeuetztwlam.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Knu9QnUZOgrOMFq6HIYxbg_VgDGkEaI';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.',
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
