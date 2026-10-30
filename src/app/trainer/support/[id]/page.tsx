import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { SupportThread } from "@/components/support/SupportThread";
import { setSupportStatus } from "@/app/support-actions";
import { STATUS_LABEL, categoryLabel, type ThreadStatus } from "@/lib/support/schema";

export const metadata = { title: "Conversación con soporte" };

export default async function SupportThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser("trainer");
  const { data: t } = await supabase.from("support_threads").select("id,category,subject,status").eq("id", id).maybeSingle();   // RLS: only the trainer's own conversations
  if (!t) notFound();
  await supabase.rpc("support_mark_read", { p_thread: id, p_as_staff: false });
  const closed = t.status === "closed";
  return (
    <section className="max-w-3xl space-y-5">
      <p className="text-sm"><Link href="/trainer/support" className="text-[var(--accent)] underline">← Soporte</Link></p>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">{t.subject}</h1><p className="text-sm text-[var(--muted)]">{categoryLabel(t.category)} · {STATUS_LABEL[t.status as ThreadStatus]}</p></div>
        <form action={setSupportStatus.bind(null, id, closed ? "open" : "closed")}><button className="btn btn-secondary">{closed ? "Reabrir" : "Marcar como resuelta"}</button></form>
      </div>
      <SupportThread supabase={supabase} threadId={id} viewer="trainer" closed={closed} />
    </section>
  );
}
