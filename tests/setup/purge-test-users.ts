// Integration and E2E suites create throwaway users (@x.co …). Several of them cannot be removed through the Auth API
// (audit, billing and plan records deliberately restrict deletes), so aborted or finished runs left hundreds behind.
// This removes them — and everything referencing them — before and after a run, via scripts/dev/purge-test-users.sql,
// and then deletes storage folders whose owner no longer exists (deleting a user never removes their files).
// Local database only: it refuses anything but the local Supabase and skips quietly when Docker is unavailable.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PHOTO_BUCKET = "progress-photos";

async function removeOrphanPhotoFolders(url: string, serviceKey: string): Promise<number> {
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: folders } = await admin.storage.from(PHOTO_BUCKET).list("", { limit: 1000 });
  let removed = 0;
  for (const f of folders ?? []) {
    if (!/^[0-9a-f-]{36}$/.test(f.name)) continue;
    const { data: owner } = await admin.from("profiles").select("id").eq("id", f.name).maybeSingle();
    if (owner) continue;
    const { data: files } = await admin.storage.from(PHOTO_BUCKET).list(f.name, { limit: 1000 });
    const paths = (files ?? []).map((x) => `${f.name}/${x.name}`);
    if (paths.length) { await admin.storage.from(PHOTO_BUCKET).remove(paths); removed += paths.length; }
  }
  return removed;
}

export async function purgeTestUsers(url: string): Promise<{ ok: boolean; note?: string }> {
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw new Error(`refusing to purge users on a non-local database: ${url}`);
  const container = process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_training-os";
  try {
    execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-q", "-v", "ON_ERROR_STOP=1"], { input: readFileSync("scripts/dev/purge-test-users.sql"), stdio: ["pipe", "ignore", "pipe"], timeout: 120_000 });
  } catch (e) { return { ok: false, note: String((e as Error).message).slice(0, 200) }; }
  try { if (process.env.SUPABASE_SERVICE_ROLE_KEY) await removeOrphanPhotoFolders(url, process.env.SUPABASE_SERVICE_ROLE_KEY); } catch { /* storage cleanup is best effort */ }
  return { ok: true };
}

export default async function setup() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
  const pre = await purgeTestUsers(url); if (!pre.ok) console.warn("[purge] skipped:", pre.note);
  return async () => { await purgeTestUsers(url); };
}
