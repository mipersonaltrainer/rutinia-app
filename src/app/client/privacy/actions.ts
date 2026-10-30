"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { CONSENTS, DELETE_CONFIRM_WORD, type ConsentType } from "@/lib/privacy/consents";
import { verifyPassword } from "@/lib/privacy/reauth";
import { eraseClientAccount } from "@/lib/privacy/erase";

type State = { error?: string; ok?: string } | undefined;

export async function setConsent(type: ConsentType, grant: boolean) {
  const def = CONSENTS.find((c) => c.type === type); if (!def) return;
  if (!grant && !def.revocable) return;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser(); if (!user) return;
  const { data: existing } = await supabase.from("consents").select("id").eq("user_id", user.id).eq("type", type).maybeSingle();
  if (!existing) { if (grant) await supabase.from("consents").insert({ user_id: user.id, type }); }
  else await supabase.from("consents").update(grant ? { revoked_at: null, granted_at: new Date().toISOString() } : { revoked_at: new Date().toISOString() }).eq("id", existing.id);
  revalidatePath("/client", "layout");
}

export async function deleteMyAccount(_: State, fd: FormData): Promise<State> {
  const p = z.object({ password: z.string().min(1, "Escribe tu contraseña"), confirm: z.literal(DELETE_CONFIRM_WORD, { error: `Escribe ${DELETE_CONFIRM_WORD} para confirmar` }) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Sesión expirada" };
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (prof?.role !== "client") return { error: "Esta acción es solo para alumnos." };
  if (!(await verifyPassword(user.email, p.data.password))) return { error: "La contraseña no es correcta." };
  try { await eraseClientAccount(user.id); } catch { return { error: "No se pudo eliminar la cuenta. No se perdió nada a medias que no podamos reintentar: inténtalo de nuevo." }; }
  await supabase.auth.signOut().catch(() => undefined);
  redirect("/?cuenta=eliminada");
}

/** The client ends the relationship with their trainer: access stops at once and the trainer cannot undo it (SEC-001). */
export async function endMyRelationship(_: State, fd: FormData): Promise<State> {
  if (fd.get("confirm") !== "on") return { error: "Marca la casilla para confirmar." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("end_my_relationship");
  if (error) return { error: /no active relationship/.test(error.message) ? "No tienes una relación activa con un entrenador." : "No se pudo terminar la relación. Inténtalo de nuevo." };
  revalidatePath("/client", "layout");
  return { ok: "Terminaste la relación. Tu entrenador ya no puede ver tus datos ni escribirte." };
}
