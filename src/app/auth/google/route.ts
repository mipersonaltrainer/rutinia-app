import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appOrigin } from "@/lib/auth/server";
import { googleEnabled } from "@/lib/auth/google";

export const dynamic = "force-dynamic";

/**
 * Starts "Continue with Google". It is a plain link (GET), not a form: nothing is submitted, so no CSP form-action rule is involved, and the
 * server client stores the PKCE verifier cookie this very browser needs to finish at /auth/confirm. A new Google account becomes a trainer
 * with the 7-day trial (same as the sign-up form); an existing account with the same verified e-mail is simply signed in.
 */
export async function GET(req: NextRequest) {
  const back = (err: string) => NextResponse.redirect(new URL(`/login?error=${err}`, req.url));
  if (!googleEnabled()) return back("google");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${await appOrigin()}/auth/confirm?next=/trainer&provider=google`, queryParams: { prompt: "select_account" } } });
  if (error || !data.url) return back("google");
  return NextResponse.redirect(data.url);
}
