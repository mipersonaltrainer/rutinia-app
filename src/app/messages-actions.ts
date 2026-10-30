"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { cleanMessage, isAllowedCallUrl, newJitsiLink } from "@/lib/messaging/links";

type State = { error?: string; ok?: string } | undefined;
const MAP: Record<string, string> = { "rate limited": "Estás enviando demasiado rápido. Espera un momento.", forbidden: "No puedes escribir a este usuario (relación inactiva o sin consentimiento).", "workspace inactive": "Tu espacio de trabajo está inactivo; revisa Facturación.", "link not allowed": "Ese enlace no es de un proveedor permitido.", "invalid date": "Fecha inválida." };
const fail = (m: string) => ({ error: Object.entries(MAP).find(([k]) => m.includes(k))?.[1] ?? "No se pudo completar la acción." });
const paths = (peer: string, role: "trainer" | "client") => revalidatePath(role === "client" ? "/client/messages" : `/trainer/clients/${peer}/messages`);

export async function sendMessageAction(peer: string, role: "trainer" | "client", _: unknown, fd: FormData): Promise<State> {
  const c = cleanMessage(String(fd.get("body") ?? ""));
  if (!c.ok) return { error: c.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("send_message", { p_peer: peer, p_body: c.body });
  if (error) return fail(error.message);
  paths(peer, role); return { ok: "Enviado" };
}

export async function scheduleCallAction(client: string, _: unknown, fd: FormData): Promise<State> {
  const generate = fd.get("generate") === "on";
  const url = generate ? newJitsiLink() : String(fd.get("url") ?? "").trim();
  if (!isAllowedCallUrl(url)) return { error: "Usa un enlace https de Google Meet, Zoom, Teams, Jitsi o Whereby (o marca «generar sala»)." };
  // datetime-local carries no zone; the product is Colombia-only (UTC-5, no DST), so it must not depend on the server clock
  const raw = String(fd.get("when") ?? "");
  const when = new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw) ? `${raw}:00-05:00` : NaN);
  if (isNaN(+when)) return { error: "Elige fecha y hora." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("schedule_call", { p_client: client, p_url: url, p_when: when.toISOString(), p_note: String(fd.get("note") ?? "").slice(0, 300) });
  if (error) return fail(error.message);
  paths(client, "trainer"); return { ok: "Videollamada programada y enviada al alumno" };
}

export async function cancelCallAction(client: string, callId: string) {
  const supabase = await createClient();
  await supabase.rpc("cancel_call", { p_call: callId });
  paths(client, "trainer");
}

export async function markReadAction(peer: string) {
  const supabase = await createClient();
  await supabase.rpc("mark_conversation_read", { p_peer: peer });
}
