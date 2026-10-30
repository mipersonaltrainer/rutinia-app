import type { SupabaseClient } from "@supabase/supabase-js";
import { ActionForm, fieldCls } from "@/components/ActionForm";
import { PrivateImg } from "./PrivateImg";
import { PHOTO_BUCKET } from "@/lib/privacy/erase";
import { SCHEDULE_LABEL, nextPhotoDue, type ScheduleKind } from "@/lib/photos/validate";
import { createAdminClient } from "@/lib/supabase/admin";
import { reviewPhoto, saveSchedule } from "@/app/trainer/clients/[id]/photo-actions";

const POSE: Record<string, string> = { front: "Frente", side: "Lado", back: "Espalda", other: "Otra" };

export async function TrainerPhotos({ supabase, clientId, trainerId, a, b }: { supabase: SupabaseClient; clientId: string; trainerId: string; a?: string; b?: string }) {
  const [{ data: photos }, { data: sched }] = await Promise.all([
    supabase.from("progress_photos").select("id,taken_on,pose,storage_path,notes, photo_reviews(trainer_id,comment)").eq("client_id", clientId).order("taken_on", { ascending: false }).limit(60),
    supabase.from("photo_schedules").select("kind,custom_days,anchor_on").eq("client_id", clientId).maybeSingle(),
  ]);
  const list = photos ?? [];
  const signed = list.length ? await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(list.map((p) => p.storage_path), 90) : { data: [] as { path: string | null; signedUrl: string }[] };
  const url = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));
  if (list.length) await createAdminClient().from("access_audit").insert({ actor_id: trainerId, client_id: clientId, resource: "progress_photos_view" });   // every viewing is traceable
  const due = sched ? nextPhotoDue(sched.kind as ScheduleKind, sched.custom_days, sched.anchor_on, list[0]?.taken_on ?? null) : null;
  const pa = list.find((p) => p.id === a), pb = list.find((p) => p.id === b);
  const card = "rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5";
  const mine = (p: (typeof list)[number]) => ((p.photo_reviews ?? []) as { trainer_id: string; comment: string | null }[]).find((r) => r.trainer_id === trainerId);
  return (
    <section id="fotos" className="space-y-4" aria-labelledby="fotos-h">
      <h2 id="fotos-h" className="pt-4 text-2xl font-semibold">Fotos de progreso</h2>
      <ActionForm action={saveSchedule.bind(null, clientId)} submitLabel="Guardar frecuencia">
        <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">Frecuencia solicitada<select name="kind" defaultValue={sched?.kind ?? "four_weeks"} className={fieldCls}>{Object.entries(SCHEDULE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="text-sm">Días (solo personalizada, 7–120)<input name="custom_days" type="number" min="7" max="120" defaultValue={sched?.custom_days ?? ""} className={fieldCls} /></label></div>
        <p className="text-xs text-[var(--muted)]">{due ? `Próxima foto sugerida: ${new Date(due + "T12:00:00").toLocaleDateString("es-CO")}. ` : ""}El alumno recibe recordatorios solo si activó las comunicaciones.</p></ActionForm>
      {list.length === 0 ? <p className={`${card} text-sm text-[var(--muted)]`}>No hay fotos visibles. El alumno puede no haber subido ninguna, o no haber activado (o haber retirado) los consentimientos de fotos y de compartir con su entrenador.</p> : (<>
        {pa && pb && (<div className={card}><h3 className="mb-3 font-semibold">Comparación opcional</h3><div className="grid grid-cols-2 gap-3">{[pa, pb].map((p) => <figure key={p.id}><PrivateImg src={url.get(p.storage_path)} alt={`Foto ${POSE[p.pose]} del ${p.taken_on}`} /><figcaption className="mt-1 text-xs text-[var(--muted)]">{new Date(p.taken_on + "T12:00:00").toLocaleDateString("es-CO")} · {POSE[p.pose]}</figcaption></figure>)}</div>
          <p className="mt-2 text-xs text-[var(--muted)]">La comparación visual es solo una referencia: no sustituye mediciones fiables y no emite juicios estéticos.</p></div>)}
        <ul className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">{list.map((p) => { const r = mine(p); return (
          <li key={p.id} className={`${card} space-y-2 p-3`}><PrivateImg src={url.get(p.storage_path)} alt={`Foto ${POSE[p.pose]} del ${p.taken_on}`} />
            <p className="text-sm font-medium">{new Date(p.taken_on + "T12:00:00").toLocaleDateString("es-CO")} · {POSE[p.pose]} {r ? <span className="ml-1 rounded-full border border-[var(--accent)]/50 px-2 text-[10px] text-[var(--accent)]">revisada</span> : <span className="ml-1 rounded-full border border-[var(--warn)]/60 px-2 text-[10px] text-[var(--warn)]">pendiente</span>}</p>
            {p.notes && <p className="text-xs text-[var(--muted)]">Nota del alumno: {p.notes}</p>}
            <details><summary className="cursor-pointer text-xs text-[var(--accent)]">{r ? "Editar comentario" : "Marcar como revisada"}</summary>
              <ActionForm action={reviewPhoto.bind(null, p.id, clientId)} submitLabel="Guardar revisión" className="mt-2 border-0 bg-transparent p-0"><label className="block text-xs">Comentario (visible para el alumno)<textarea name="comment" rows={2} maxLength={1000} defaultValue={r?.comment ?? ""} className={fieldCls} /></label></ActionForm></details>
            <div className="flex gap-3 text-xs"><a className="underline" href={`?a=${p.id}${pb ? `&b=${pb.id}` : ""}#fotos`}>Comparar como A</a><a className="underline" href={`?${pa ? `a=${pa.id}&` : ""}b=${p.id}#fotos`}>como B</a></div></li>); })}</ul></>)}
    </section>
  );
}
