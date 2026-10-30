import type { SupabaseClient } from "@supabase/supabase-js";
import { ActionForm } from "@/components/ActionForm";
import { sendSupportMessage, staffReply } from "@/app/support-actions";

type Msg = { id: string; sender_kind: "trainer" | "staff" | "agent"; body: string; created_at: string };
const fmt = (s: string) => new Date(s).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" });

/** One support conversation. `viewer` decides whose messages sit on the right and which action sends the reply. Bodies are plain text (React escapes; links are not activated). */
export async function SupportThread({ supabase, threadId, viewer, closed }: { supabase: SupabaseClient; threadId: string; viewer: "trainer" | "staff"; closed: boolean }) {
  const { data } = await supabase.from("support_messages").select("id,sender_kind,body,created_at").eq("thread_id", threadId).order("created_at", { ascending: true }).limit(200);
  const msgs = (data ?? []) as Msg[];
  const mine = (k: Msg["sender_kind"]) => (viewer === "trainer" ? k === "trainer" : k !== "trainer");
  const who = (k: Msg["sender_kind"]) => (k === "trainer" ? (viewer === "trainer" ? "Tú" : "Entrenador") : k === "agent" ? "Asistente de Rutinia" : viewer === "staff" ? "Equipo" : "Equipo de Rutinia");
  return (
    <div className="space-y-4">
      <ul className="stagger max-h-[30rem] space-y-2 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4" aria-label="Mensajes de la conversación">
        {msgs.map((m) => (
          <li key={m.id} className={`max-w-[85%] rounded-xl p-3 text-sm ${mine(m.sender_kind) ? "ml-auto bg-[var(--accent)]/15" : "bg-black/30"}`}>
            <p className="mb-1 text-[11px] font-medium text-[var(--muted)]">{who(m.sender_kind)}</p>
            <p className="whitespace-pre-wrap break-words">{m.body}</p>
            <p className="mt-1 text-[10px] text-[var(--muted)]">{fmt(m.created_at)}</p>
          </li>))}
      </ul>
      <ActionForm action={viewer === "trainer" ? sendSupportMessage.bind(null, threadId) : staffReply.bind(null, threadId)} submitLabel={viewer === "trainer" ? (closed ? "Reabrir y enviar" : "Enviar") : "Responder"} resetOnOk>
        <label className="block text-sm">{viewer === "trainer" ? "Tu mensaje" : "Respuesta"}<textarea name="body" required maxLength={4000} rows={4} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent p-2" /></label>
        {viewer === "trainer" && <p className="text-xs text-[var(--muted)]">No escribas contraseñas ni datos completos de tu tarjeta: nunca te los pediremos.</p>}
      </ActionForm>
    </div>
  );
}
