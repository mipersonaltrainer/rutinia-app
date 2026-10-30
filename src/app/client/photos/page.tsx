import { requireUser } from "@/lib/session";
import { ActionForm, fieldCls } from "@/components/ActionForm";
import { PHOTO_BUCKET } from "@/lib/privacy/erase";
import { SCHEDULE_LABEL, nextPhotoDue, type ScheduleKind } from "@/lib/photos/validate";
import { PrivateImg } from "@/components/photos/PrivateImg";
import { setConsent } from "../privacy/actions";
import { deletePhoto, uploadPhoto } from "./actions";

const POSE: Record<string, string> = { front: "Frente", side: "Lado", back: "Espalda", other: "Otra" };

export default async function Photos() {
  const { supabase, profile } = await requireUser("client");
  const [{ data: consent }, { data: photos }, { data: sched }] = await Promise.all([
    supabase.from("consents").select("id").eq("user_id", profile.id).eq("type", "photos").is("revoked_at", null).maybeSingle(),
    supabase.from("progress_photos").select("id,taken_on,pose,storage_path,notes, photo_reviews(comment,created_at)").eq("client_id", profile.id).order("taken_on", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("photo_schedules").select("kind,custom_days,anchor_on").eq("client_id", profile.id).maybeSingle(),
  ]);
  const list = photos ?? [];
  const signed = list.length ? await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(list.map((p) => p.storage_path), 120) : { data: [] as { path: string | null; signedUrl: string }[] };
  const url = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));
  const today = new Date().toISOString().slice(0, 10);
  const due = sched ? nextPhotoDue(sched.kind as ScheduleKind, sched.custom_days, sched.anchor_on, list[0]?.taken_on ?? null) : null;
  const card = "rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5";
  return (
    <section className="space-y-6"><h1 className="text-2xl font-semibold">Fotos de progreso</h1>
      <p className="text-sm text-[var(--muted)]">Tus fotos son privadas: solo tú y, si lo permites, tu entrenador pueden verlas. No se usan para publicidad ni para entrenar modelos. Quitamos los datos ocultos de la imagen (ubicación, fecha de cámara) al guardarla.</p>
      {sched && <p className={`${card} text-sm`}>Tu entrenador pidió fotos: <b>{SCHEDULE_LABEL[sched.kind as ScheduleKind]}</b>. Próxima fecha sugerida: <b>{new Date(due + "T12:00:00").toLocaleDateString("es-CO")}</b>{due! <= today && <span className="ml-2 text-[var(--accent)]">(ya toca)</span>}.</p>}
      {!consent ? (
        <div className={card}><p className="text-sm">Para subir fotos necesitas activar el consentimiento de fotos de progreso.</p><form action={setConsent.bind(null, "photos", true)} className="mt-3"><button className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black">Activar consentimiento de fotos</button></form></div>
      ) : (
        <ActionForm action={uploadPhoto} submitLabel="Subir foto">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">Fecha<input name="taken_on" type="date" defaultValue={today} max={today} required className={fieldCls} /></label>
            <label className="text-sm">Pose<select name="pose" className={fieldCls}>{Object.entries(POSE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="text-sm">Foto (JPG, PNG o WebP, máx. 8 MB)<input name="file" type="file" accept="image/jpeg,image/png,image/webp" required className={fieldCls} /></label></div>
          <label className="block text-sm">Nota (opcional)<input name="notes" maxLength={300} className={fieldCls} /></label></ActionForm>)}
      {list.length === 0 ? <p className="text-sm text-[var(--muted)]">Aún no has subido fotos.</p> : (
        <ul className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">{list.map((p) => (
          <li key={p.id} className={`${card} space-y-2 p-3`}>
            <PrivateImg src={url.get(p.storage_path)} alt={`Foto de progreso (${POSE[p.pose]}) del ${p.taken_on}`} />
            <p className="text-sm font-medium">{new Date(p.taken_on + "T12:00:00").toLocaleDateString("es-CO")} · {POSE[p.pose]}</p>{p.notes && <p className="text-xs text-[var(--muted)]">{p.notes}</p>}
            {((p.photo_reviews ?? []) as { comment: string | null }[]).filter((r) => r.comment).map((r, i) => <p key={i} className="rounded-lg bg-[var(--bg)] p-2 text-xs"><b>Tu entrenador:</b> {r.comment}</p>)}
            <details><summary className="cursor-pointer text-xs text-[var(--warn)]">Eliminar</summary><form action={deletePhoto.bind(null, p.id)} className="mt-2"><button className="rounded-lg border border-[var(--warn)] px-3 py-1.5 text-xs text-[var(--warn)]">Confirmar: eliminar esta foto</button></form></details></li>))}</ul>)}
    </section>
  );
}
