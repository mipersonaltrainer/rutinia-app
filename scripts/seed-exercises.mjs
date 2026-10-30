// Idempotent: upserts the global library (owner_id null) by slug and rebuilds relations.
// Usage: node --env-file=.env.local scripts/seed-exercises.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const { items, relations } = JSON.parse(readFileSync(new URL("../data/exercises.generated.json", import.meta.url), "utf8"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BATCH = 100;
for (let i = 0; i < items.length; i += BATCH) {
  const chunk = items.slice(i, i + BATCH).map((e) => ({ ...e, owner_id: null }));
  // partial unique index (slug where owner_id is null) can't be targeted by upsert: update-or-insert by slug
  const { data: existing } = await sb.from("exercises").select("id,slug").is("owner_id", null).in("slug", chunk.map((c) => c.slug));
  const idBySlug = new Map((existing ?? []).map((r) => [r.slug, r.id]));
  const toInsert = chunk.filter((c) => !idBySlug.has(c.slug));
  const toUpdate = chunk.filter((c) => idBySlug.has(c.slug));
  if (toInsert.length) { const { error } = await sb.from("exercises").insert(toInsert); if (error) throw error; }
  for (const u of toUpdate) { const { error } = await sb.from("exercises").update(u).eq("id", idBySlug.get(u.slug)); if (error) throw error; }
}
const { data: all } = await sb.from("exercises").select("id,slug").is("owner_id", null).range(0, 4999);
const id = new Map(all.map((r) => [r.slug, r.id]));
const ids = [...id.values()];
for (let i = 0; i < ids.length; i += 50) { const { error } = await sb.from("exercise_relations").delete().in("exercise_id", ids.slice(i, i + 50)); if (error) throw error; }
const rows = relations.map((r) => ({ exercise_id: id.get(r.from), related_id: id.get(r.to), kind: r.kind })).filter((r) => r.exercise_id && r.related_id);
for (let i = 0; i < rows.length; i += 500) { const { error } = await sb.from("exercise_relations").insert(rows.slice(i, i + 500)); if (error) throw error; }
const { count } = await sb.from("exercises").select("id", { count: "exact", head: true }).is("owner_id", null);
console.log(`Biblioteca global: ${count} ejercicios, ${rows.length} relaciones`);
