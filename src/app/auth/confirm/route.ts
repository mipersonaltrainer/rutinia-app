import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { RECOVERY_COOKIE, safeNext, signRecoveryMarker } from "@/lib/auth/recovery";
import { authSecret } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
const TYPES: EmailOtpType[] = ["recovery", "signup", "email", "magiclink", "invite", "email_change"];

/**
 * Landing point of the links Supabase e-mails (password recovery, sign-up confirmation). Two shapes are accepted:
 *   ?code=…                 PKCE: the browser that asked for the link finishes the exchange (default Supabase template)
 *   ?token_hash=…&type=…    works in any browser (needs the template described in docs/DEPLOY.md)
 * `next` is reduced to an internal allow-list: this URL is public and must never become an open redirect.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const next = safeNext(url.searchParams.get("next"), "/login");
  const google = url.searchParams.get("provider") === "google";
  const fail = () => NextResponse.redirect(new URL(google ? "/login?error=google" : "/login?error=link", req.url));   // cancelled at Google, or the exchange failed
  const supabase = await createClient();
  const code = url.searchParams.get("code"), tokenHash = url.searchParams.get("token_hash"), type = url.searchParams.get("type") as EmailOtpType | null;

  let userId: string | undefined; let isRecovery = false;
  if (tokenHash && type && TYPES.includes(type)) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error || !data.user) return fail();
    userId = data.user.id; isRecovery = type === "recovery";
  } else if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    // A sign-up link that carries a code was already accepted by Supabase (the e-mail is confirmed); what failed is opening the session in a
    // browser other than the one that signed up (PKCE needs that browser's verifier). Say so, instead of "invalid link".
    if (error || !data.user) return google ? fail() : next === "/trainer" ? NextResponse.redirect(new URL("/login?error=confirm", req.url)) : fail();
    userId = data.user.id; isRecovery = next === "/reset-password";
  } else return fail();

  // A recovery link may only lead to the reset form; anything else it asks for is ignored.
  const res = NextResponse.redirect(new URL(isRecovery ? "/reset-password" : next, req.url));
  if (isRecovery && userId) res.cookies.set(RECOVERY_COOKIE, signRecoveryMarker(authSecret(), userId), { httpOnly: true, sameSite: "lax", secure: req.nextUrl.protocol === "https:", path: "/", maxAge: 15 * 60 });
  return res;
}
