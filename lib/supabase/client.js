import { createBrowserClient } from '@supabase/ssr';
import { assertSupabaseEnv, supabaseAnonKey, supabaseUrl } from './env';

let browserClient;

export function createClient() {
  assertSupabaseEnv();
  if (!browserClient) {
    browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey);
  }
  return browserClient;
}
