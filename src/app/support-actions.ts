"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyStaffOfMessage, notifyTrainerOfReply } from "@/lib/support/notify";
import { notifySupportTeam } from "@/lib/support/alert";
import { openThreadSchema, sendSchema, supportError } from "@/lib/support/schema";

type State = { error?: string; ok?: string } | undefined;

async function trainerContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("auth");
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
  return { supabase, name: profile?.full_name ?? "Entrenador" };
}

/** A trainer opens a conversation. The team is alerted (webhook) without the message text; a failing webhook never blocks the trainer. */
export async function openSupportThread(_: State, fd: FormData): Promise<State> {
  const p = openThreadSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const { supabase, name } = await trainerContext();
  const { data: id, error } = await supabase.rpc("support_open_thread", { p_category: p.data.category, p_subject: p.data.subject, p_body: p.data.body });
  if (error || !id) return { error: supportError(error?.message) };
  const notice = { threadId: id as string, trainerName: name, category: p.data.category, subject: p.data.subject, reply: false };
  after(async () => { await Promise.allSettled([notifySupportTeam(notice), notifyStaffOfMessage(createAdminClient(), notice)]); });          // after the response: the trainer never waits for a notification
  revalidatePath("/trainer/support");
  redirect(`/trainer/support/${id}`);
}

/** The trainer writes in their conversation. Only the first message nobody has answered yet alerts the team (not every line of a burst). */
export async function sendSupportMessage(threadId: string, _: State, fd: FormData): Promise<State> {
  const p = sendSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const { supabase, name } = await trainerContext();
  const { data, error } = await supabase.rpc("support_send", { p_thread: threadId, p_body: p.data.body, p_as_staff: false });
  if (error) return { error: supportError(error.message) };
  if ((data as { first_unanswered?: boolean } | null)?.first_unanswered) {
    const { data: t } = await supabase.from("support_threads").select("category,subject").eq("id", threadId).maybeSingle();
    if (t) { const notice = { threadId, trainerName: name, category: t.category, subject: t.subject, reply: true }; after(async () => { await Promise.allSettled([notifySupportTeam(notice), notifyStaffOfMessage(createAdminClient(), notice)]); }); }
  }
  revalidatePath(`/trainer/support/${threadId}`); revalidatePath("/trainer/support");
  return { ok: "Enviado" };
}

export async function setSupportStatus(threadId: string, status: "open" | "closed") {
  const supabase = await createClient();
  await supabase.rpc("support_set_status", { p_thread: threadId, p_status: status, p_as_staff: false });
  revalidatePath(`/trainer/support/${threadId}`); revalidatePath("/trainer/support");
}

// ---- the team ----
export async function staffReply(threadId: string, _: State, fd: FormData): Promise<State> {
  const p = sendSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.rpc("support_send", { p_thread: threadId, p_body: p.data.body, p_as_staff: true });
  if (error) return { error: supportError(error.message) };
  await supabase.rpc("staff_log_access", { p_action: "reply_thread", p_ref: threadId });
  const { data: th } = await supabase.from("support_threads").select("trainer_id").eq("id", threadId).maybeSingle();
  if (th) after(async () => { await notifyTrainerOfReply(createAdminClient(), { trainerId: th.trainer_id as string, threadId }); });
  revalidatePath(`/staff/soporte/${threadId}`); revalidatePath("/staff/soporte"); revalidatePath("/staff");
  return { ok: "Respuesta enviada" };
}

export async function staffSetStatus(threadId: string, status: "open" | "closed") {
  const supabase = await createClient();
  const { error } = await supabase.rpc("support_set_status", { p_thread: threadId, p_status: status, p_as_staff: true });
  if (!error) await supabase.rpc("staff_log_access", { p_action: "close_thread", p_ref: `${threadId}:${status}` });
  revalidatePath(`/staff/soporte/${threadId}`); revalidatePath("/staff/soporte"); revalidatePath("/staff");
}
