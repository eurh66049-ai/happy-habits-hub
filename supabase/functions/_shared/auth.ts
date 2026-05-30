// Shared auth helpers for edge functions
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.54.0";

export type AuthResult =
  | { ok: true; userId: string; email: string | null; isAdmin: boolean }
  | { ok: false; status: number; error: string };

/**
 * Verify the caller's JWT from the Authorization header.
 * Returns userId + admin status (looked up from public.admin_users).
 */
export async function verifyAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return { ok: false, status: 401, error: "Missing Authorization header" };
  }
  const token = authHeader.slice(7).trim();
  if (!token) return { ok: false, status: 401, error: "Empty bearer token" };

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Validate JWT using anon client + bearer
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return { ok: false, status: 401, error: "Invalid or expired token" };
  }

  // Admin lookup via service role
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let isAdmin = false;
  if (userData.user.email) {
    const { data: adminRow } = await admin
      .from("admin_users")
      .select("id")
      .eq("email", userData.user.email)
      .eq("is_active", true)
      .maybeSingle();
    isAdmin = !!adminRow;
  }

  return {
    ok: true,
    userId: userData.user.id,
    email: userData.user.email ?? null,
    isAdmin,
  };
}

/** Simple HTML escape for safe interpolation into HTML attributes/text. */
export function escapeHtml(input: unknown): string {
  if (input === null || input === undefined) return "";
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
