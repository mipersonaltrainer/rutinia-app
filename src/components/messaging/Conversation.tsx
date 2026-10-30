import type { SupabaseClient } from "@supabase/supabase-js";
import { ActionForm } from "@/components/ActionForm";
import { sendMessageAction, scheduleCallAction, cancelCallAction } from "@/app/messages-actions";
import { CALL_HOSTS } from "@/lib/messaging/links";

type Msg = { id: string; sender_id: string; kind: string; body: string; call_id: string | null; created_at: string; read_at: string | null };
type Call = { id: string; url: string; scheduled_at: string; note: string | null; status: string };
const fmt = (s: string) => new Date(s).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" });

export async function Conversation({ supabase, me, peer, role }: { supabase: SupabaseClient; me: string; peer: string; role: "trainer" | "client" }) {
  const col = role === "trainer" ? { t: me, c: peer } : { t: peer, c: me };
  const [{ data: msgs }, { data: calls }] = await Promise.all([
    supabase.from("messages").select("id,sender_id,kind,body,call_id,created_at,read_at").eq("trainer_id", col.t).eq("client_id", col.c).order("created_at", { ascending: false }).limit(100),
    supabase.from("video_calls").select("id,url,scheduled_at,note,status").eq("trainer_id", col.t).eq("client_id", col.c),
  ]);
  const callById = new Map(((calls ?? []) as Call[]).map((c) => [c.id, c]));
  const list = ((msgs ?? []) as Msg[]).slice().reverse();
  return (
    <div className="space-y-6">
      <ul className="max-h-[28rem] space-y-2 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4" aria-label="Mensajes">
        {list.length === 0 && <li className="text-sm text-[var(--muted)]">Aún no hay mensajes.</li>}
        {list.map((m) => {
          const mine = m.sender_id === me; const call = m.call_id ? callById.get(m.call_id) : undefined;
          return (
            <li key={m.id} className={`max-w-[85%] rounded-xl p-3 text-sm ${mine ? "ml-auto bg-[var(--accent)]/15" : "bg-black/30"}`}>
              {/* Message bodies are rendered as plain text (React escapes); links are never auto-activated. */}
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              {call && (
                <div className="mt-2 rounded-lg border border-[var(--border)] p-2">
                  {call.status === "canceled" ? <p className="text-[var(--warn)]">Cancelada</p> : (
                    <><p>{call.note}</p><a className="font-semibold text-[var(--accent)] underline" href={call.url} target="_blank" rel="noopener noreferrer">Unirme a la videollamada</a>
                      <p className="text-xs text-[var(--muted)]">Se abre en {new URL(call.url).hostname}. Comprueba que el enlace sea de un proveedor que conoces.</p>
                      {role === "trainer" && <form action={cancelCallAction.bind(null, peer, call.id)}><button className="mt-1 text-xs text-[var(--warn-text)] underline">Cancelar</button></form>}</>)}
                </div>)}
              <p className="mt-1 text-[10px] text-[var(--muted)]">{fmt(m.created_at)}{mine && (m.read_at ? " · leído" : " · enviado")}</p>
            </li>);
        })}
      </ul>
      <ActionForm action={sendMessageAction.bind(null, peer, role)} submitLabel="Enviar" resetOnOk>
        <label className="block text-sm">Mensaje<textarea name="body" required maxLength={2000} rows={3} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent p-2" /></label>
        <p className="text-xs text-[var(--muted)]">Para urgencias médicas no uses este chat: llama al 123. Esto no es atención médica.</p>
      </ActionForm>
      {role === "trainer" && (
        <ActionForm action={scheduleCallAction.bind(null, peer)} submitLabel="Programar videollamada" resetOnOk>
          <h2 className="font-semibold">Programar videollamada</h2>
          <label className="block text-sm">Fecha y hora (hora local)<input type="datetime-local" name="when" required className="mt-1 block rounded-lg border border-[var(--border)] bg-transparent p-2" /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="generate" /> Generar una sala de Jitsi nueva (sin cuenta)</label>
          <label className="block text-sm">…o pega un enlace ({CALL_HOSTS.join(", ")})<input name="url" type="url" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent p-2" placeholder="https://meet.google.com/…" /></label>
          <label className="block text-sm">Nota (opcional)<input name="note" maxLength={300} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent p-2" /></label>
        </ActionForm>)}
    </div>
  );
}
