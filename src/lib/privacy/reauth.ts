import { createClient } from "@supabase/supabase-js";

/** Re-authentication for destructive actions. Uses a throw-away client: it never touches the user's session cookies. */
export async function verifyPassword(email: string, password: string): Promise<boolean> {
  if (!email || !password) return false;
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  // scope "local": revoke only the session this check created. The default scope is "global", which signs the user out of every device,
  // including the browser that is asking for the re-authentication.
  if (!error) await c.auth.signOut({ scope: "local" }).catch(() => undefined);
  return !error && !!data.user;
}
