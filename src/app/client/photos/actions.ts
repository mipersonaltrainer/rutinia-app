"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_PER_DAY, POSES, processPhoto } from "@/lib/photos/validate";
import { PHOTO_BUCKET } from "@/lib/privacy/erase";

type State = { error?: string; ok?: string } | undefined;

export async function uploadPhoto(_: State, fd: FormData): Promise<State> {
  const meta = z.object({ taken_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"), pose: z.enum(POSES), notes: z.string().max(300).optional() }).safeParse(Object.fromEntries(fd));
  if (!meta.success) return { error: meta.error.issues[0].message };
  if (meta.data.taken_on > new Date(Date.now() + 86400000).toISOString().slice(0, 10)) return { error: "La fecha no puede ser futura." };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Elige una foto." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada" };
  const { data: consent } = await supabase.from("consents").select("id").eq("user_id", user.id).eq("type", "photos").is("revoked_at", null).maybeSingle();
  if (!consent) return { error: "Activa el consentimiento de fotos para subir imágenes." };
  const since = new Date(Date.now() - 86400000).toISOString();
  const { count } = await supabase.from("progress_photos").select("id", { count: "exact", head: true }).eq("client_id", user.id).gte("created_at", since);
  if ((count ?? 0) >= MAX_PER_DAY) return { error: `Límite de ${MAX_PER_DAY} fotos por día alcanzado.` };

  const processed = await processPhoto(new Uint8Array(await file.arrayBuffer()));
  if (!processed.ok) return { error: processed.error };
  const path = `${user.id}/${randomUUID()}.webp`;
  const up = await createAdminClient().storage.from(PHOTO_BUCKET).upload(path,    // the server stores photos (SEC-008); the path is built from the session, never from the form
     processed.data, { contentType: processed.contentType, upsert: false, cacheControl: "0" });
  if (up.error) return { error: "No se pudo guardar la foto." };
  const { error } = await supabase.from("progress_photos").insert({ client_id: user.id, taken_on: meta.data.taken_on, pose: meta.data.pose, storage_path: path, content_type: processed.contentType, size_bytes: processed.data.byteLength, notes: meta.data.notes || null });
  if (error) { await createAdminClient().storage.from(PHOTO_BUCKET).remove([path]); return { error: "No se pudo registrar la foto." }; }
  revalidatePath("/client/photos");
  return { ok: "Foto guardada de forma privada." };
}

export async function deletePhoto(id: string) {
  const supabase = await createClient();
  const { data: p } = await supabase.from("progress_photos").select("id,storage_path").eq("id", id).maybeSingle();
  if (!p) return;
  await supabase.storage.from(PHOTO_BUCKET).remove([p.storage_path]);
  await supabase.from("progress_photos").delete().eq("id", id);
  revalidatePath("/client/photos");
}
