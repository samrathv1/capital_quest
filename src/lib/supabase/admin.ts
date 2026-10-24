import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('FATAL SECURITY VIOLATION: createAdminClient() invoked on client-side! Service-role key must never be exposed to browser.');
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables for admin client.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
