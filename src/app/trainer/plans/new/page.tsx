import { requireUser } from "@/lib/session";
import { ActionForm, fieldCls } from "@/components/ActionForm";
import { createPlan } from "../actions";

export default async function NewPlan({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { client } = await searchParams;
  const { supabase, profile } = await requireUser("trainer");
  const { data: rels } = await supabase.from("trainer_client_relationships").select("client_id, client:profiles!trainer_client_relationships_client_id_fkey(full_name)").eq("trainer_id", profile.id).eq("status", "active");
  return (
    <section className="max-w-xl space-y-4"><h1 className="text-3xl font-semibold">Nuevo plan</h1>
      <ActionForm action={createPlan} submitLabel="Crear plan">
        <label className="block text-sm">Título<input name="title" required minLength={2} className={fieldCls} /></label>
        <label className="block text-sm">Objetivo<input name="goal" maxLength={200} className={fieldCls} /></label>
        <label className="block text-sm">Nivel<select name="level" className={fieldCls}><option value="beginner">Principiante</option><option value="intermediate">Intermedio</option><option value="advanced">Avanzado</option></select></label>
        <label className="block text-sm">Para
          <select name="clientId" defaultValue={(rels ?? []).some((r) => r.client_id === client) ? client : ""} className={fieldCls}><option value="">Plantilla reutilizable (sin alumno)</option>{(rels ?? []).map((r) => <option key={r.client_id} value={r.client_id}>{(r.client as unknown as { full_name: string }).full_name}</option>)}</select></label>
      </ActionForm>
    </section>
  );
}
