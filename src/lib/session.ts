import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "trainer" | "client";

/** Where each kind of account lives. The support team has its own panel and no trainer/student screens. */
export const homeFor = (role: string | null | undefined) => (role === "staff" ? "/staff" : role === "client" ? "/client" : "/trainer");

/**
 * The signed-in person for this request. `cache` makes the layout and the page (and any component) share ONE answer per request: before, each of
 * them verified the session with the auth server and re-read the profile, two or three network round trips on every navigation.
 */
const currentUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null };
  const { data: profile } = await supabase.from("profiles").select("id, role, full_name").eq("id", user.id).maybeSingle();
  return { supabase, user, profile };
});
export { currentUser };

export async function requireUser(role: Role) {
  const { supabase, user, profile } = await currentUser();
  if (!user || !profile) redirect("/login");
  if (profile.role !== role) redirect(homeFor(profile.role));
  return { supabase, profile };
}

/** Server-side subscription gate (mirrors DB function trainer_has_access). */
export const trainerAccess = cache(async function trainerAccess(supabase: Awaited<ReturnType<typeof createClient>>, trainerId: string) {
  const { data: sub } = await supabase.from("trainer_subscriptions").select("status, trial_ends_at, current_period_end, provider").eq("trainer_id", trainerId).single();
  if (!sub) return { allowed: false as const, sub: null, daysLeft: null };
  const now = new Date();
  const paid = ["active", "past_due", "canceled"].includes(sub.status) && !!sub.current_period_end && new Date(sub.current_period_end) > now;
  const allowed = paid || (sub.status === "trialing" && new Date(sub.trial_ends_at) > now);
  const daysLeft = sub.status === "trialing" ? Math.max(0, Math.ceil((new Date(sub.trial_ends_at).getTime() - Date.now()) / 86400000)) : null;
  return { allowed, sub, daysLeft };
});
