"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hashInviteToken } from "@/lib/invitations";
import { checkPassword, PASSWORD_MAX } from "@/lib/auth/password";
import { RELINK_MESSAGE, relinkExistingClient } from "@/lib/invitations/relink";

const schema = z.object({
  password: z.string().max(PASSWORD_MAX * 2, "Contraseña demasiado larga"),
  personal_data: z.literal("on", { error: "Debes aceptar el tratamiento de datos personales" }),
  health_data: z.literal("on", { error: "Debes aceptar el tratamiento de datos de salud" }),
  share_with_trainer: z.literal("on", { error: "Debes aceptar compartir tus datos con tu entrenador" }),
});

export async function acceptInvitation(token: string, _: unknown, form: FormData): Promise<{ error?: string }> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const admin = createAdminClient();
  const pwCheck = checkPassword(parsed.data.password);
  if (!pwCheck.ok) return { error: pwCheck.error };
  const { data: inv } = await admin.rpc("claim_invitation", { p_hash: hashInviteToken(token) });
  if (!inv?.id) return { error: "Invitación inválida, caducada o ya utilizada" };

  const fail = async (msg: string) => { await admin.rpc("release_invitation", { p_id: inv.id }); return { error: msg }; };
  const { data: created, error: uErr } = await admin.auth.admin.createUser({
    email: inv.email, password: parsed.data.password, email_confirm: true,
    app_metadata: { role: "client" }, user_metadata: { full_name: inv.full_name },
  });
  if (uErr || !created.user) return fail("No se pudo crear la cuenta (¿ya existe ese correo?)");
  const uid = created.user.id;

  const { error: rErr } = await admin.from("trainer_client_relationships").insert({ trainer_id: inv.trainer_id, client_id: uid });
  if (rErr) {
    await admin.auth.admin.deleteUser(uid);
    return fail(rErr.message.includes("capacity") ? "Tu entrenador alcanzó su límite de alumnos. Pídele que libere un cupo." : "No se pudo vincular con tu entrenador");
  }
  await admin.from("invitations").update({ accepted_by: uid }).eq("id", inv.id);
  await admin.from("consents").insert(["personal_data", "health_data", "share_with_trainer"].map((type) => ({ user_id: uid, type })));

  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email: inv.email, password: parsed.data.password });
  redirect("/client");
}

/** An existing client accepts a NEW invitation. Identity comes from the signed-in session, never from the form or the token. */
export async function linkExistingClient(token: string, _: unknown, form: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Inicia sesión con tu cuenta para vincularte." };
  const r = await relinkExistingClient(createAdminClient(), {
    userId: user.id, userEmail: user.email, tokenHash: hashInviteToken(token),
    consents: { personal_data: form.get("personal_data") === "on", health_data: form.get("health_data") === "on", share_with_trainer: form.get("share_with_trainer") === "on" },
  });
  if (!r.ok) return { error: RELINK_MESSAGE[r.code] };
  redirect("/client");
}
