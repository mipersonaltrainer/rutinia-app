"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateInviteToken, hashInviteToken } from "@/lib/invitations";

type State = { error?: string; link?: string } | undefined;

const inviteSchema = z.object({
  email: z.email("Correo inválido"),
  fullName: z.string().min(2, "Nombre requerido"),
  expiresDays: z.coerce.number().int().min(0).max(90),
});

export async function createInvitation(_: State, form: FormData): Promise<State> {
  const parsed = inviteSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada" };
  const token = generateInviteToken();
  const { email, fullName, expiresDays } = parsed.data;
  const { error } = await supabase.from("invitations").insert({
    trainer_id: user.id, email: email.toLowerCase(), full_name: fullName, token_hash: hashInviteToken(token),
    expires_at: expiresDays > 0 ? new Date(Date.now() + expiresDays * 86400000).toISOString() : null,
  });
  if (error) return { error: error.code === "23505" ? "Ya hay una invitación pendiente para ese correo" : "No se pudo crear la invitación (¿suscripción activa?)" };
  revalidatePath("/trainer/clients");
  // The raw token is shown once and never stored. Email delivery adapter is pending.
  return { link: `${process.env.APPLICATION_BASE_URL}/invite/${token}` };
}

export async function revokeInvitation(id: string) {
  const supabase = await createClient();
  await supabase.from("invitations").update({ status: "revoked" }).eq("id", id);
  revalidatePath("/trainer/clients");
}

/** Archive / reactivate go through a database function (relationships are no longer writable by trainers directly: SEC-001). */
export async function setClientStatus(relId: string, status: "active" | "archived"): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_client_relationship_status", { p_rel: relId, p_status: status });
  revalidatePath("/trainer/clients");
  if (error) {
    const m = error.message;
    redirect(`/trainer/clients?aviso=${/ended by the client/.test(m) ? "terminada" : /another active trainer/.test(m) ? "otro" : /workspace/.test(m) ? "suscripcion" : /capacity/.test(m) ? "cupo" : "error"}`);
  }
}
