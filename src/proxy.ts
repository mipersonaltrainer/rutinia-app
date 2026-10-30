import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, newNonce } from "@/lib/csp";
import { hardenCookie } from "@/lib/supabase/cookies";

const isPrivate = (path: string) => path.startsWith("/trainer") || path.startsWith("/client") || path.startsWith("/staff");

// 1) Every page response gets a CSP with a fresh nonce (Next reads the nonce from the request header and tags its scripts).
// 2) Private areas also refresh the session and require a user. Real authorization lives in RLS + server checks.
export async function proxy(request: NextRequest) {
  const nonce = newNonce();
  const csp = buildCsp({ nonce, dev: process.env.NODE_ENV !== "production", supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "" });
  const path = request.nextUrl.pathname;
  request.headers.set("x-pathname", path);
  request.headers.set("x-nonce", nonce);
  // CSP_MODE=report-only is a rollout/diagnosis switch: browsers log violations but block nothing.
  const header = process.env.CSP_MODE === "report-only" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
  request.headers.set(header, csp);
  const withCsp = (r: NextResponse) => { r.headers.set(header, csp); return r; };

  let response = NextResponse.next({ request });
  if (!isPrivate(path)) return withCsp(response);

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, hardenCookie(options)));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return withCsp(NextResponse.redirect(new URL("/login", request.url)));
  return withCsp(response);
}

export const config = {
  // Pages only: skip API routes, static assets, images, the worker and the manifest/icons.
  matcher: [{ source: "/((?!api|_next/static|_next/image|icons|favicon.ico|sw.js|manifest.webmanifest).*)", missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }] }],
};
