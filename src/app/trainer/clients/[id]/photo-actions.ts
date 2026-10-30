"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type State = { error?: string; ok?: string } | undefined;

export async function saveSchedule(clientId: string, _: State, fd: FormData): Promise<State> {
  const p = z.object({ kind: z.enum(["biweekly", "four_weeks", "six_weeks", "monthly", "custom"]), custom_days: z.preprocess((v) => (v === "" ? null : v), z.coerce.number().int().min(7, "Mínimo 7 días").max(120, "Máximo 120 días").nullable()) })
    .refine((d) => (d.kind === "custom") === (d.custom_days !== null), "Indica los días solo para la frecuencia personalizada").safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser(); if (!user) return { error: "Sesión expirada" };
  const { error } = await supabase.from("photo_schedules").upsert({ client_id: clientId, trainer_id: user.id, kind: p.data.kind, custom_days: p.data.kind === "custom" ? p.data.custom_days : null, updated_at: new Date().toISOString() }, { onConflict: "client_id" });
  if (error) return { error: "No se pudo guardar la frecuencia." };
  revalidatePath(`/trainer/clients/${clientId}`);
  return { ok: "Frecuencia guardada." };
}

export async function reviewPhoto(photoId: string, clientId: string, _: State, fd: FormData): Promise<State> {
  const comment = String(fd.get("comment") ?? "").trim().slice(0, 1000);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser(); if (!user) return { error: "Sesión expirada" };
  const { error } = await supabase.from("photo_reviews").upsert({ photo_id: photoId, trainer_id: user.id, comment: comment || null }, { onConflict: "photo_id,trainer_id" });
  if (error) return { error: "No se pudo registrar la revisión." };
  revalidatePath(`/trainer/clients/${clientId}`);
  return { ok: "Revisión registrada." };
}
