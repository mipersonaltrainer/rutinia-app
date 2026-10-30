// Manual / scheduled safety copy of the Rutinia database and its private photos, onto THIS computer.
//   node --env-file=.env.cloud scripts/ops/backup.mjs                 (production: uses the linked Supabase project)
//   node --env-file=.env.local scripts/ops/backup.mjs --local --out /tmp/backups-test   (local test; needs Docker/Supabase running)
// Options: --out <dir> (default ~/rutinia-backups)  --keep <n> (default 14 copies)  --local  --no-photos
// It only READS from Supabase and WRITES to the output folder. Nothing is changed in the database or in Storage.
// What it does not replace: Supabase's own daily backups (Pro plan). Your computer must be on; the files hold personal data — keep FileVault on.
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { dumpLooksValid, stamp, toPrune } from "./backup-lib.mjs";

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const local = flag("local"); const withPhotos = !flag("no-photos");
const keep = Number(opt("keep", "14"));
const root = path.resolve(opt("out", path.join(homedir(), "rutinia-backups")));
const BUCKET = "progress-photos";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""; const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const isLocalUrl = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url);
if (!url || !key) { console.error("Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (usa --env-file=.env.cloud)."); process.exit(2); }
if (local !== isLocalUrl) { console.error(local ? "--local pero la URL no es local." : "La URL es local: usa --local, o apunta a .env.cloud para producción."); process.exit(2); }

mkdirSync(root, { recursive: true, mode: 0o700 }); chmodSync(root, 0o700);
const dir = path.join(root, stamp());
if (existsSync(dir)) { console.error(`Ya hay una copia de este minuto (${dir}). Espera un minuto y vuelve a intentarlo.`); process.exit(3); }
mkdirSync(dir, { mode: 0o700 });
const logFile = path.join(root, "backup.log");
const log = (m) => { const line = `${new Date().toISOString()} ${m}`; console.log(line); appendFileSync(logFile, line + "\n"); };
const fail = (m) => { log(`ERROR ${m}`); rmSync(dir, { recursive: true, force: true }); process.exit(1); };       // an incomplete copy is removed so it is never mistaken for a good one

// 1) database: schema and data, as the Supabase CLI does it (pg_dump inside Docker)
const base = ["supabase", "db", "dump", local ? "--local" : "--linked"];
for (const [name, extra] of [["esquema.sql", []], ["datos.sql", ["--data-only"]]]) {
  const file = path.join(dir, name);
  const r = spawnSync("npx", [...base, ...extra, "-f", file], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (r.status !== 0 || !existsSync(file)) fail(`volcado ${name} falló: ${(r.stderr || "").split("\n").slice(-3).join(" ").slice(0, 200)}`);
  chmodSync(file, 0o600);
  if (name === "esquema.sql") { const v = dumpLooksValid(readFileSync(file, "utf8")); if (!v.ok) fail(`el volcado del esquema no parece válido (${v.tables} tablas)`); log(`esquema OK (${v.tables} tablas, ${(statSync(file).size / 1024).toFixed(0)} KB)`); }
  else log(`datos OK (${(statSync(file).size / 1024).toFixed(0)} KB)`);
}

// 2) photos: private bucket, copied object by object (same paths), and counted against the table
let photos = { copied: 0, expected: null };
if (withPhotos) {
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const walk = async (prefix) => {
    const out = []; let offset = 0;
    for (;;) {
      const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw new Error(`listar ${prefix || "/"}: ${error.message}`);
      for (const o of data) {
        const p = prefix ? `${prefix}/${o.name}` : o.name;
        if (o.id) out.push(p); else out.push(...(await walk(p)));          // a folder has no id: go into it
      }
      if (data.length < 100) break; offset += 100;
    }
    return out;
  };
  try {
    const files = await walk("");
    for (const f of files) {
      const { data, error } = await admin.storage.from(BUCKET).download(f);
      if (error) throw new Error(`descargar una foto: ${error.message}`);
      const dest = path.join(dir, "fotos", f); mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
      writeFileSync(dest, Buffer.from(await data.arrayBuffer()), { mode: 0o600 }); photos.copied++;
    }
    const { count } = await admin.from("progress_photos").select("id", { count: "exact", head: true });
    photos.expected = count ?? null;
    if (photos.expected !== null && photos.copied !== photos.expected) log(`AVISO fotos: ${photos.copied} archivos copiados pero ${photos.expected} filas en la tabla (puede haber archivos huérfanos o faltantes)`);
    log(`fotos OK (${photos.copied} archivos)`);
  } catch (e) { fail(`fotos: ${e.message}`); }
}

writeFileSync(path.join(dir, "LEEME.txt"), `Copia de Rutinia del ${new Date().toISOString()}\nOrigen: ${local ? "base LOCAL" : "producción (proyecto enlazado)"}\nContiene datos personales. No la subas a ningún sitio sin cifrar.\nfotos: ${photos.copied}\n`, { mode: 0o600 });

// 3) keep the newest `keep` copies; only folders this script made (timestamped names) are ever removed
for (const old of toPrune(readdirSync(root), keep)) { rmSync(path.join(root, old), { recursive: true, force: true }); log(`copia antigua eliminada: ${old}`); }
log(`LISTO ${dir}`);
