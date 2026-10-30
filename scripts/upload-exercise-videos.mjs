// Bulk-uploads exercise demo clips. Each file must be named after the exercise's slug: press-de-banca-inclinado-con-barra.mp4
// Usage: node --env-file=.env.cloud scripts/upload-exercise-videos.mjs <folder> [--dry-run]
// Safe to rerun: an identical file is skipped, a changed file replaces the old one (new content-hashed name, so caches never serve a stale clip).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { extname, basename, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const dir = process.argv[2]; const dry = process.argv.includes("--dry-run");
if (!dir) { console.error("Uso: node --env-file=<archivo> scripts/upload-exercise-videos.mjs <carpeta> [--dry-run]"); process.exit(1); }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BUCKET = "exercise-videos", MAX = 15 * 1024 * 1024, TYPE = { ".mp4": "video/mp4", ".webm": "video/webm" };
const isMp4 = (b) => b.length > 12 && b.toString("latin1", 4, 8) === "ftyp"; const isWebm = (b) => b.length > 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;

const { data: ex, error } = await sb.from("exercises").select("id,slug,video_path").is("owner_id", null).range(0, 4999); if (error) throw error;
const bySlug = new Map(ex.map((e) => [e.slug, e]));
const r = { uploaded: [], unchanged: [], unknown: [], invalid: [] };
for (const f of readdirSync(dir).filter((x) => TYPE[extname(x).toLowerCase()]).sort()) {
  const slug = basename(f, extname(f)).toLowerCase(), ext = extname(f).toLowerCase(), full = join(dir, f);
  const e = bySlug.get(slug); if (!e) { r.unknown.push(f); continue; }
  const size = statSync(full).size; const buf = readFileSync(full);
  if (size > MAX) { r.invalid.push(`${f}: ${(size / 1048576).toFixed(1)} MB (máximo 15 MB)`); continue; }
  if (!(ext === ".mp4" ? isMp4(buf) : isWebm(buf))) { r.invalid.push(`${f}: el contenido no es un ${ext.slice(1)} válido`); continue; }
  const path = `${slug}-${createHash("sha1").update(buf).digest("hex").slice(0, 8)}${ext}`;
  if (e.video_path === path) { r.unchanged.push(f); continue; }
  if (!dry) {
    const up = await sb.storage.from(BUCKET).upload(path, buf, { contentType: TYPE[ext], cacheControl: "31536000", upsert: false }); if (up.error && !/already exists|Duplicate/i.test(up.error.message)) throw up.error;
    const { error: ue } = await sb.from("exercises").update({ video_path: path, media_status: "available" }).eq("id", e.id); if (ue) throw ue;
    if (e.video_path && e.video_path !== path) await sb.storage.from(BUCKET).remove([e.video_path]);
  }
  r.uploaded.push(`${f} → ${path}`);
}
console.log(`${dry ? "[simulacro] " : ""}Subidos: ${r.uploaded.length} · sin cambios: ${r.unchanged.length} · nombre desconocido: ${r.unknown.length} · inválidos: ${r.invalid.length}`);
for (const l of r.unknown) console.log(`  ? ${l} (no coincide con ningún ejercicio: revisa el nombre exacto en el CSV, columna «archivo»)`);
for (const l of r.invalid) console.log(`  ✗ ${l}`);
