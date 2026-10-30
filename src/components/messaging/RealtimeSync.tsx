"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { debounce, subscriptionsFor } from "@/lib/messaging/realtime";

const POLL_MS = 20_000;
const idle = (cb: () => void): (() => void) => {
  if (typeof window.requestIdleCallback === "function") { const id = window.requestIdleCallback(cb, { timeout: 2500 }); return () => window.cancelIdleCallback(id); }
  const t = window.setTimeout(cb, 1200); return () => window.clearTimeout(t);
};

/**
 * Keeps server-rendered pages fresh: any relevant change triggers a (debounced) router.refresh(), so the page always shows
 * what the server — not the event payload — says, including unread badges in the layout. If the realtime channel is down it
 * degrades to polling while the tab is visible.
 *
 * Authentication: the session cookie is httpOnly, so this component never sees it. The server renders the user's short-lived
 * access token into the layout; each router.refresh() brings a fresh one and `setAuth` hands it to the open channel. The
 * supabase-js client (≈65 KB gzipped) is imported only after the page is idle: it is not needed to render or interact.
 */
export function RealtimeSync({ role, userId, token }: { role: "trainer" | "client" | "staff"; userId: string; token: string | null }) {
  const router = useRouter();
  const tokenRef = useRef(token);
  const clientRef = useRef<{ realtime: { setAuth: (token?: string | null) => Promise<void> } } | null>(null);

  useEffect(() => {
    tokenRef.current = token;
    void clientRef.current?.realtime.setAuth(token);                  // the open channel keeps working past the old token's expiry
  }, [token]);

  useEffect(() => {
    let cancelled = false; let teardown: (() => void) | undefined; let poll: ReturnType<typeof setInterval> | undefined;
    const refresh = debounce(() => router.refresh(), 250);
    const startPoll = () => { if (!poll) poll = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, POLL_MS); };
    const stopPoll = () => { if (poll) { clearInterval(poll); poll = undefined; } };
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);

    const cancelIdle = idle(async () => {
      if (cancelled || !tokenRef.current) { startPoll(); return; }
      try {
        const { createClient } = await import("@supabase/supabase-js");
        if (cancelled) return;
        const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { accessToken: async () => tokenRef.current });
        clientRef.current = supabase as never;
        // Hand the token to Realtime BEFORE joining: a channel that joins without it is anonymous, RLS filters every row out, and it
        // sits "SUBSCRIBED" receiving nothing (the failure mode already seen once, see docs/MESSAGING.md).
        await supabase.realtime.setAuth(tokenRef.current);
        if (cancelled) return;
        let ch = supabase.channel(`sync:${userId}`);
        for (const s of subscriptionsFor(role, userId)) ch = ch.on("postgres_changes" as never, { event: s.event, schema: "public", table: s.table, filter: s.filter } as never, () => refresh());
        ch.subscribe((status) => { if (status === "SUBSCRIBED") stopPoll(); else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") startPoll(); });
        teardown = () => { void supabase.removeChannel(ch); clientRef.current = null; };
      } catch { startPoll(); }                                         // the chunk could not load (offline): polling keeps the page fresh
    });

    return () => { cancelled = true; cancelIdle(); teardown?.(); document.removeEventListener("visibilitychange", onVisible); stopPoll(); refresh.cancel(); };
  }, [role, userId, router]);
  return null;
}
