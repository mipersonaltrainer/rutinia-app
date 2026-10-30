// Requires local Supabase. Run: npm run test:int
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exerciseVideoUrl } from "@/lib/exercises/video";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(); const pw = "Test-Pass-12345"; let uid = ""; let T: SupabaseClient; let dir = ""; let slug = "", slug2 = ""; let exId = ""; const uploaded: string[] = [];
const fakeMp4 = (tag: string) => Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.from(`${tag}-${run}`.padEnd(40, "x"))]);
const upload = () => execFileSync("node", ["scripts/upload-exercise-videos.mjs", dir], { env: { ...process.env }, encoding: "utf8" });

beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({ email: `vid-${run}@x.co`, password: pw, email_confirm: true }); if (error) throw error; uid = data.user.id;
  T = createClient(URL, ANON, { auth: { persistSession: false } }); await T.auth.signInWithPassword({ email: `vid-${run}@x.co`, password: pw });
  const e = (await admin.from("exercises").select("id,slug").is("owner_id", null).is("video_path", null).limit(1).single()).data!; slug = e.slug; exId = e.id;
  slug2 = (await admin.from("exercises").select("slug").is("owner_id", null).is("video_path", null).neq("slug", slug).limit(1).single()).data!.slug;
  dir = mkdtempSync(join(tmpdir(), "videos-"));
});
afterAll(async () => {
  await admin.auth.admin.deleteUser(uid); rmSync(dir, { recursive: true, force: true });
  const { data } = await admin.from("exercises").select("video_path").eq("id", exId).single(); if (data?.video_path) await admin.storage.from("exercise-videos").remove([data.video_path, ...uploaded]);
  await admin.from("exercises").update({ video_path: null, media_status: "pending" }).eq("id", exId);
});

describe("videos de ejercicios", () => {
  it("la subida masiva valida nombre y contenido, sube, es idempotente y reemplaza con un nombre nuevo", async () => {
    writeFileSync(join(dir, `${slug}.mp4`), fakeMp4("a")); writeFileSync(join(dir, "no-existe-este-ejercicio.mp4"), fakeMp4("b")); writeFileSync(join(dir, `${slug2}.mp4`), Buffer.from("esto no es un video"));
    const out1 = upload(); expect(out1).toMatch(/Subidos: 1/); expect(out1).toMatch(/nombre desconocido: 1/); expect(out1).toMatch(/inválidos: 1/);
    const { data: ex } = await admin.from("exercises").select("video_path,media_status").eq("id", exId).single(); expect(ex!.media_status).toBe("available"); expect(ex!.video_path).toMatch(new RegExp(`^${slug}-[0-9a-f]{8}\\.mp4$`));
    expect(upload()).toMatch(/Subidos: 0 · sin cambios: 1/);
    writeFileSync(join(dir, `${slug}.mp4`), fakeMp4("a-v2")); expect(upload()).toMatch(/Subidos: 1/);
    const { data: ex2 } = await admin.from("exercises").select("video_path").eq("id", exId).single(); expect(ex2!.video_path).not.toBe(ex!.video_path);
    expect((await admin.storage.from("exercise-videos").list()).data!.some((f) => f.name === ex!.video_path)).toBe(false);       // the old clip was removed
  });
  it("el video se lee sin iniciar sesión, con el tipo correcto", async () => {
    const { data } = await admin.from("exercises").select("video_path").eq("id", exId).single(); const url = exerciseVideoUrl(data!.video_path, URL)!;
    const r = await fetch(url); expect(r.status).toBe(200); expect(r.headers.get("content-type")).toBe("video/mp4"); expect(r.headers.get("cache-control")).toMatch(/max-age=31536000/);
  });
  it("nadie salvo el servicio puede subir, reemplazar ni borrar videos", async () => {
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    for (const c of [anon, T]) {
      expect((await c.storage.from("exercise-videos").upload(`hack-${run}-00000000.mp4`, fakeMp4("h"), { contentType: "video/mp4" })).error).not.toBeNull();
      const { data } = await admin.from("exercises").select("video_path").eq("id", exId).single(); await c.storage.from("exercise-videos").remove([data!.video_path!]);
      expect((await fetch(exerciseVideoUrl(data!.video_path, URL)!)).status).toBe(200);          // still there
    }
  });
  it("el bucket solo admite mp4/webm y 15 MB; una ruta inválida se rechaza en la base", async () => {
    expect((await admin.storage.from("exercise-videos").upload(`x-${run}-00000000.exe`, Buffer.from("MZ"), { contentType: "application/x-msdownload" })).error).not.toBeNull();
    expect((await admin.from("exercises").update({ video_path: "../../etc/passwd" }).eq("id", exId)).error).not.toBeNull();
  });
  it("un entrenador no puede cambiar el video de un ejercicio de la biblioteca", async () => {
    await T.from("exercises").update({ video_path: `${slug}-deadbeef.mp4` }).eq("id", exId);
    expect((await admin.from("exercises").select("video_path").eq("id", exId).single()).data!.video_path).not.toBe(`${slug}-deadbeef.mp4`);
  });
  it("la URL pública solo se arma para rutas nuestras", () => {
    expect(exerciseVideoUrl("sentadilla-12345678.mp4", "https://abc.supabase.co")).toBe("https://abc.supabase.co/storage/v1/object/public/exercise-videos/sentadilla-12345678.mp4");
    for (const bad of [null, "", "../x-12345678.mp4", "a-12345678.exe", "https://evil.com/x-12345678.mp4"]) expect(exerciseVideoUrl(bad, "https://abc.supabase.co")).toBeNull();
  });
});
