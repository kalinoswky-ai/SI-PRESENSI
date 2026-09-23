import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// PENTING: file ini hanya boleh diimpor dari kode server (route handlers / server actions).
// SUPABASE_SERVICE_ROLE_KEY memiliki akses penuh dan tidak pernah dikirim ke browser.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
