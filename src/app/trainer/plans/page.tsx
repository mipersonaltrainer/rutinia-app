import Link from "next/link";
import { requireUser } from "@/lib/session";
import { ActionForm, fieldCls } from "@/components/ActionForm";
import { assignTemplate } from "./actions";

export default async function Plans() {
  const { supabase, profile } = await requireUser("trainer");
  const [{ data: plans }, { data: rels }] = await Promise.all([
    supabase.from("training_plans").select("id,title,is_template,client_id,current_version_id,client:profiles!training_plans_client_id_fkey(full_name), plan_versions!plan_versions_plan_id_fkey(version_no,status)").eq("trainer_id", profile.id).order("created_at", { ascending: false }),
    supabase.from("trainer_client_relationships").select("client_id, client:profiles!trainer_client_relationships_client_id_fkey(full_name)").eq("trainer_id", profile.id).eq("status", "active"),
  ]);
  const state = (p: NonNullable<typeof plans>[number]) => { const vs = p.plan_versions ?? []; const pub = vs.filter((v) => v.status === "published").length; const draft = vs.some((v) => v.status === "draft"); return `${pub ? `v${Math.max(...vs.filter((v) => v.status === "published").map((v) => v.version_no))} publicada` : "sin publicar"}${draft ? " · borrador en edición" : ""}`; };
  const templates = (plans ?? []).filter((p) => p.is_template); const mine = (plans ?? []).filter((p) => !p.is_template);
  const card = "rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5";
  return (
    <section className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between"><h1 className="text-3xl font-semibold">Planes</h1><Link href="/trainer/plans/new" className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-black">Nuevo plan</Link></div>
      <div className={card}><h2 className="mb-3 font-semibold">Planes de alumnos</h2>
        {mine.length === 0 ? <p className="text-sm text-[var(--muted)]">Aún no hay planes de alumnos.</p> : <ul className="divide-y divide-[var(--border)] text-sm">{mine.map((p) => <li key={p.id} className="py-2"><Link className="underline" href={`/trainer/plans/${p.id}`}>{p.title}</Link> · {(p.client as unknown as { full_name: string } | null)?.full_name} <span className="text-[var(--muted)]">({state(p)})</span></li>)}</ul>}</div>
      <div className={card}><h2 className="mb-3 font-semibold">Plantillas</h2>
        {templates.length === 0 ? <p className="text-sm text-[var(--muted)]">Sin plantillas. Crea un plan de tipo “plantilla”.</p> : <ul className="divide-y divide-[var(--border)] text-sm">{templates.map((p) => <li key={p.id} className="py-2"><Link className="underline" href={`/trainer/plans/${p.id}`}>{p.title}</Link> <span className="text-[var(--muted)]">({state(p)})</span></li>)}</ul>}</div>
      {templates.length > 0 && (rels ?? []).length > 0 && (
        <ActionForm action={assignTemplate} submitLabel="Asignar copia">
          <h2 className="font-semibold">Asignar plantilla a un alumno</h2>
          <p className="text-xs text-[var(--muted)]">Se crea una copia independiente: cambios futuros de la plantilla no alteran el plan del alumno.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Plantilla (publicada)<select name="template" className={fieldCls}>{templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
            <label className="text-sm">Alumno<select name="client" className={fieldCls}>{(rels ?? []).map((r) => <option key={r.client_id} value={r.client_id}>{(r.client as unknown as { full_name: string }).full_name}</option>)}</select></label>
          </div>
        </ActionForm>)}
    </section>
  );
}
