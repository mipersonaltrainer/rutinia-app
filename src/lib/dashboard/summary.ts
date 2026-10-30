import { ATTENTION_THRESHOLD, localDate, weekBounds } from "@/lib/training/metrics";

// Pure summary of a trainer's workspace for the home panel. Everything comes from rows the trainer is already allowed to read.
export interface DClient { id: string; name: string }
export interface DPlan { client_id: string; version_id: string }
export interface DLog { client_id: string; session_id: string; session_name: string; finished_at: string; pain_level: number | null; session_rpe: number | null }
export type Status = "review" | "no_plan" | "inactive" | "ok";
export interface ClientRow { id: string; name: string; status: Status; reason: string; done: number; planned: number }
export interface Summary {
  adherence: { pct: number | null; completed: number; planned: number };
  clients: ClientRow[]; weekly: { label: string; count: number }[];
  today: { count: number; recent: { client: string; session: string; at: string }[] };
}
const DAY = 86400000;
export const INACTIVE_DAYS = 10;

export function buildSummary(i: { now: Date; clients: DClient[]; plans: DPlan[]; sessionsPerVersion: Record<string, number>; logs: DLog[]; proRecommendationClients: Set<string> }): Summary {
  const { start, end } = weekBounds(i.now);
  const planOf = new Map(i.plans.map((p) => [p.client_id, p]));
  const clients: ClientRow[] = i.clients.map((c) => {
    const plan = planOf.get(c.id); const planned = plan ? i.sessionsPerVersion[plan.version_id] ?? 0 : 0;
    const mine = i.logs.filter((l) => l.client_id === c.id);
    const done = new Set(mine.filter((l) => new Date(l.finished_at) >= start && new Date(l.finished_at) < end).map((l) => l.session_id)).size;
    const recent = mine.filter((l) => i.now.getTime() - new Date(l.finished_at).getTime() <= 14 * DAY);
    const hard = recent.find((l) => (l.pain_level ?? 0) >= ATTENTION_THRESHOLD);
    const last = mine.reduce((m, l) => Math.max(m, new Date(l.finished_at).getTime()), 0);
    let status: Status = "ok", reason = "Al día";
    if (i.proRecommendationClients.has(c.id)) { status = "review"; reason = "Propuesta que requiere atención profesional"; }
    else if (hard) { status = "review"; reason = `Dolor ${hard.pain_level}/10 reportado`; }
    else if (!plan) { status = "no_plan"; reason = "Sin plan publicado"; }
    else if (!last || i.now.getTime() - last > INACTIVE_DAYS * DAY) { status = "inactive"; reason = `Sin entrenar en ${INACTIVE_DAYS}+ días`; }
    return { id: c.id, name: c.name, status, reason, done: Math.min(done, planned || done), planned };
  });
  const planned = clients.reduce((a, c) => a + c.planned, 0), completed = clients.reduce((a, c) => a + (c.planned ? Math.min(c.done, c.planned) : 0), 0);
  const weekly = Array.from({ length: 8 }, (_, k) => {
    const s = new Date(start.getTime() - (7 - k) * 7 * DAY), e = new Date(s.getTime() + 7 * DAY);
    const count = i.logs.filter((l) => { const t = new Date(l.finished_at); return t >= s && t < e; }).length;
    return { label: new Date(s.getTime() - 5 * 3600000).toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "UTC" }), count };
  });
  const todayKey = localDate(i.now.toISOString());
  const nameOf = new Map(i.clients.map((c) => [c.id, c.name]));
  const sorted = [...i.logs].sort((a, b) => b.finished_at.localeCompare(a.finished_at));
  return {
    adherence: { pct: planned > 0 ? Math.round((completed / planned) * 100) : null, completed, planned },
    clients: clients.sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name)), weekly,
    today: { count: i.logs.filter((l) => localDate(l.finished_at) === todayKey).length, recent: sorted.slice(0, 5).map((l) => ({ client: nameOf.get(l.client_id) ?? "Alumno", session: l.session_name, at: l.finished_at })) },
  };
}
const ORDER: Record<Status, number> = { review: 0, inactive: 1, no_plan: 2, ok: 3 };
export const agoEs = (iso: string, now: Date) => { const m = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000)); return m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; };
