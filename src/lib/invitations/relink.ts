import type { SupabaseClient } from "@supabase/supabase-js";

export type RelinkCode = "no_consent" | "invalid" | "wrong_account" | "not_client" | "other_trainer" | "capacity" | "error";
export type RelinkResult = { ok: true; trainerId: string } | { ok: false; code: RelinkCode };
export interface RelinkInput { userId: string; userEmail: string; tokenHash: string; consents: { personal_data: boolean; health_data: boolean; share_with_trainer: boolean } }
export const RELINK_MESSAGE: Record<RelinkCode, string> = {
  no_consent: "Debes aceptar los tres consentimientos para vincularte.",
  invalid: "Invitación inválida, caducada o ya utilizada.",
  wrong_account: "Esta invitación es para otra cuenta. Cierra sesión e inicia con el correo al que fue enviada.",
  not_client: "Esta invitación es para una cuenta que no es de alumno.",
  other_trainer: "Ya tienes un entrenador activo. Termina esa relación en Privacidad antes de aceptar esta invitación.",
  capacity: "Tu entrenador alcanzó su límite de alumnos. Pídele que libere un cupo.",
  error: "No se pudo completar la vinculación. Inténtalo de nuevo.",
};

/**
 * An EXISTING client accepts an invitation. The token alone proves nothing about who is holding it, so the caller must pass the identity
 * of the signed-in session (never a value taken from the form) and it has to be the owner of the invited e-mail. Every check happens before
 * the invitation is consumed; once consumed, any later failure releases it so the client can try again.
 * Uses the service role on purpose (relationships are not writable by users since SEC-001), so the identity check above is the whole authorisation.
 */
export async function relinkExistingClient(admin: SupabaseClient, i: RelinkInput): Promise<RelinkResult> {
  const fail = (code: RelinkCode): RelinkResult => ({ ok: false, code });
  if (!i.consents.personal_data || !i.consents.health_data || !i.consents.share_with_trainer) return fail("no_consent");
  const { data: rows } = await admin.rpc("invitation_context", { p_hash: i.tokenHash });
  const ctx = (rows as { invitation_id: string; email: string; trainer_id: string; usable: boolean; account_id: string | null; account_role: string | null }[] | null)?.[0];
  if (!ctx || !ctx.usable) return fail("invalid");
  if (!ctx.account_id || ctx.account_id !== i.userId || ctx.email.toLowerCase() !== i.userEmail.toLowerCase()) return fail("wrong_account");
  if (ctx.account_role !== "client") return fail("not_client");
  const { data: others } = await admin.from("trainer_client_relationships").select("id").eq("client_id", i.userId).eq("status", "active").neq("trainer_id", ctx.trainer_id).limit(1);
  if (others?.length) return fail("other_trainer");

  const { data: claimed } = await admin.rpc("claim_invitation", { p_hash: i.tokenHash });
  if (!claimed?.id) return fail("invalid");
  const release = async (code: RelinkCode) => { await admin.rpc("release_invitation", { p_id: claimed.id }); return fail(code); };

  const { data: existing } = await admin.from("trainer_client_relationships").select("id").eq("trainer_id", ctx.trainer_id).eq("client_id", i.userId).maybeSingle();
  const w = existing
    ? await admin.from("trainer_client_relationships").update({ status: "active", archived_by: null }).eq("id", existing.id)
    : await admin.from("trainer_client_relationships").insert({ trainer_id: ctx.trainer_id, client_id: i.userId });
  if (w.error) return release(/capacity/.test(w.error.message) ? "capacity" : "error");

  const now = new Date().toISOString();
  const c = await admin.from("consents").upsert(["personal_data", "health_data", "share_with_trainer"].map((type) => ({ user_id: i.userId, type, granted_at: now, revoked_at: null })), { onConflict: "user_id,type" });
  if (c.error) return release("error");
  await admin.from("invitations").update({ accepted_by: i.userId }).eq("id", claimed.id);
  return { ok: true, trainerId: ctx.trainer_id };
}
