import { createClient } from "@supabase/supabase-js";
import { purgeTestUsers } from "../tests/setup/purge-test-users";

// Remove users (and orphaned photo files) left by an aborted run before starting. Local database only.
export default async function setup() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
  const r = await purgeTestUsers(url);
  if (!r.ok) console.warn("[e2e] purge skipped:", r.note);
  // The sign-up / sign-in limiter keeps its counters in the database for an hour, so back-to-back runs used to trip it
  // (a valid sign-up refused for the "sixth attempt"). Start every run from a clean slate — never anywhere but a local database.
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url) && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { error } = await createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }).from("auth_throttle").delete().neq("key", "");
    if (error) console.warn("[e2e] could not reset auth_throttle:", error.message);
  }
}
