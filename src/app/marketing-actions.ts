"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/support/staff";
import { emailsById } from "@/lib/staff/data";
import { campaignSchema, type Channel } from "@/lib/marketing/schema";
import { previewReach, sendBirthdayGreetings, sendCampaign } from "@/lib/marketing/send";

type State = { error?: string; ok?: string } | undefined;
const COL = "-05:00";   // Colombia has no daylight saving: a datetime-local typed by the team means UTC-5

/** Saves a draft. Nothing is sent from here: the next screen shows the preview and the number of people before anyone confirms. */
export async function createCampaign(_: State, fd: FormData): Promise<State> {
  const { userId } = await requireStaff();
  const p = campaignSchema.safeParse({ ...Object.fromEntries(fd), channels: fd.getAll("channels") });
  if (!p.success) return { error: p.error.issues[0].message };
  const admin = createAdminClient(); let audienceUser: string | null = null;
  if (p.data.audience === "uno") {
    const email = (p.data.audienceEmail ?? "").toLowerCase(); if (!email) return { error: "Escribe el correo del entrenador de prueba." };
    const emails = await emailsById(admin); audienceUser = [...emails].find(([, e]) => e.toLowerCase() === email)?.[0] ?? null;
    if (!audienceUser) return { error: "No hay ninguna cuenta con ese correo." };
    const { data: pr } = await admin.from("profiles").select("role").eq("id", audienceUser).maybeSingle(); if (pr?.role !== "trainer") return { error: "Esa cuenta no es de un entrenador." };
  }
  let scheduledAt: string | null = null;
  if (p.data.scheduledAt) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(p.data.scheduledAt)) return { error: "Elige una fecha y hora válidas." };
    const when = new Date(`${p.data.scheduledAt}:00${COL}`); if (isNaN(+when) || +when < Date.now() + 60_000) return { error: "La fecha de envío debe ser futura." };
    scheduledAt = when.toISOString();
  }
  const { data, error } = await admin.from("marketing_campaigns").insert({ kind: p.data.kind, title: p.data.title, body: p.data.body, link: p.data.link ?? null, channels: p.data.channels as Channel[], audience: p.data.audience, audience_user: audienceUser, scheduled_at: scheduledAt, created_by: userId }).select("id").single();
  if (error || !data) return { error: "No se pudo guardar el borrador." };
  revalidatePath("/staff/marketing");
  redirect(`/staff/marketing/${data.id}`);
}

/** The real send. The team must tick the confirmation, which names how many people will receive it. */
export async function sendCampaignNow(id: string, _: State, fd: FormData): Promise<State> {
  const { supabase } = await requireStaff();
  if (fd.get("confirm") !== "on") return { error: "Marca la casilla para confirmar el envío." };
  await supabase.rpc("staff_log_access", { p_action: "send_campaign", p_ref: id });
  const admin = createAdminClient();
  const res = await sendCampaign(admin, id);
  revalidatePath(`/staff/marketing/${id}`); revalidatePath("/staff/marketing");
  if (!res.ok) return { error: res.reason === "not_sendable" ? "Esta campaña ya se envió o no se puede enviar." : "El envío falló. Revisa el resultado en el detalle." };
  redirect(`/staff/marketing/${id}`);
}

export async function scheduleCampaign(id: string) {
  await requireStaff(); const admin = createAdminClient();
  await admin.from("marketing_campaigns").update({ status: "scheduled" }).eq("id", id).eq("status", "draft").gt("scheduled_at", new Date().toISOString());
  revalidatePath(`/staff/marketing/${id}`); revalidatePath("/staff/marketing");
}
export async function cancelCampaign(id: string) {
  await requireStaff(); const admin = createAdminClient();
  await admin.from("marketing_campaigns").update({ status: "canceled" }).eq("id", id).in("status", ["draft", "scheduled"]);
  revalidatePath(`/staff/marketing/${id}`); revalidatePath("/staff/marketing");
}

export async function saveBirthdaySettings(_: State, fd: FormData): Promise<State> {
  await requireStaff();
  const channels = fd.getAll("channels").map(String).filter((c) => ["in_app", "push", "email"].includes(c)); if (!channels.length) return { error: "Elige al menos un canal." };
  const title = String(fd.get("title") ?? "").trim(), body = String(fd.get("body") ?? "").trim();
  if (title.length < 3 || title.length > 80) return { error: "El título debe tener entre 3 y 80 caracteres." };
  if (body.length < 1 || body.length > 600) return { error: "El mensaje debe tener entre 1 y 600 caracteres." };
  const { error } = await createAdminClient().from("marketing_settings").update({ birthday_auto: fd.get("auto") === "on", birthday_title: title, birthday_body: body, birthday_channels: channels, updated_at: new Date().toISOString() }).eq("id", true);
  if (error) return { error: "No se pudo guardar." };
  revalidatePath("/staff/marketing/cumpleanos"); return { ok: "Guardado" };
}

export async function greetBirthdaysNow(_: State, fd: FormData): Promise<State> {
  const { userId } = await requireStaff();
  if (fd.get("confirm") !== "on") return { error: "Marca la casilla para confirmar." };
  const r = await sendBirthdayGreetings(createAdminClient(), { auto: false, createdBy: userId });
  revalidatePath("/staff/marketing/cumpleanos"); revalidatePath("/staff/marketing");
  if (r.skipped === "nobody") return { ok: "Hoy no cumple años ningún entrenador con fecha registrada." };
  if (r.skipped === "already_greeted") return { ok: "Todos los cumpleañeros de hoy ya fueron felicitados." };
  return r.greeted ? { ok: `Felicitaste a ${r.greeted} entrenador${r.greeted === 1 ? "" : "es"}.` } : { error: "No se pudo enviar la felicitación." };
}

export async function reachFor(id: string) {
  await requireStaff(); const admin = createAdminClient();
  const { data: c } = await admin.from("marketing_campaigns").select("kind,audience,audience_user,channels").eq("id", id).maybeSingle();
  return c ? previewReach(admin, c as never) : null;
}
