// Idempotent: upserts the global food library (owner_id null) by slug.
// Usage: node --env-file=.env.local scripts/seed-foods.mjs
import { createClient } from "@supabase/supabase-js";
import { FOODS } from "../data/foods.source.mjs";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const rows = FOODS.map(([slug, name_es, category, kcal_100, protein_100, carbs_100, fat_100, fiber_100, liquid, measures]) => ({ owner_id: null, slug, name_es, category, kcal_100, protein_100, carbs_100, fat_100, fiber_100, is_liquid: !!liquid, measures }));
const { data: existing } = await sb.from("foods").select("id,slug").is("owner_id", null);
const idBySlug = new Map((existing ?? []).map((r) => [r.slug, r.id]));
const toInsert = rows.filter((r) => !idBySlug.has(r.slug));
if (toInsert.length) { const { error } = await sb.from("foods").insert(toInsert); if (error) throw error; }
for (const r of rows.filter((r) => idBySlug.has(r.slug))) { const { slug, owner_id, ...rest } = r; void slug; void owner_id; const { error } = await sb.from("foods").update(rest).eq("id", idBySlug.get(r.slug)); if (error) throw error; }
const { count } = await sb.from("foods").select("id", { count: "exact", head: true }).is("owner_id", null);
console.log(`Biblioteca de alimentos: ${count} (${toInsert.length} nuevos)`);
