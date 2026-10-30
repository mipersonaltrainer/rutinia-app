"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { CLOSE_CONFIRM_WORD } from "@/lib/privacy/consents";
import { verifyPassword } from "@/lib/privacy/reauth";
import { closeTrainerAccount } from "@/lib/privacy/erase";
import { validBirthDate } from "@/lib/marketing/birth-date";

type State = { error?: string; ok?: string } | undefined;

export async function savePreferences(_: State, fd: FormData): Promise<State> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser(); if (!user) return { error: "Sesión expirada" };
  const raw = String(fd.get("birthDate") ?? "").trim();
  if (raw && !validBirthDate(raw)) return { error: "Revisa la fecha de nacimiento." };
  const { error } = await supabase.from("profiles").update({ birth_date: raw || null, marketing_in_app: fd.get("marketingInApp") === "on", marketing_email: fd.get("marketingEmail") === "on" }).eq("id", user.id);
  if (error) return { error: "No se pudieron guardar tus preferencias." };
  return { ok: "Preferencias guardadas" };
}

export async function savePushSubscription(s: { endpoint: string; p256dh: string; auth: string }): Promise<State> {
  const p = z.object({ endpoint: z.string().url().startsWith("https://").max(1000), p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }).safeParse(s);
  if (!p.success) return { error: "Suscripción no válida." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_push_subscription", { p_endpoint: p.data.endpoint, p_p256dh: p.data.p256dh, p_auth: p.data.auth, p_ua: null });
  return error ? { error: /too many/.test(error.message) ? "Ya tienes 10 dispositivos con avisos. Desactiva alguno." : "No se pudo activar en este dispositivo." } : { ok: "ok" };
}
export async function removePushSubscription(endpoint: string): Promise<State> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser(); if (!user) return { error: "Sesión expirada" };
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", user.id);
  return { ok: "ok" };
}

export async function closeMyAccount(_: State, fd: FormData): Promise<State> {
  const p = z.object({ password: z.string().min(1, "Escribe tu contraseña"), confirm: z.literal(CLOSE_CONFIRM_WORD, { error: `Escribe ${CLOSE_CONFIRM_WORD} para confirmar` }) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Sesión expirada" };
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (prof?.role !== "trainer") return { error: "Esta acción es solo para entrenadores." };
  if (!(await verifyPassword(user.email, p.data.password))) return { error: "La contraseña no es correcta." };
  try { await closeTrainerAccount(user.id); } catch { return { error: "No se pudo cerrar la cuenta. Inténtalo de nuevo." }; }
  await supabase.auth.signOut().catch(() => undefined);
  redirect("/?cuenta=cerrada");
}
