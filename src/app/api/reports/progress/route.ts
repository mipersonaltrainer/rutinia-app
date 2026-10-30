import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildReportData } from "@/lib/reports/data";
import { renderReportPdf } from "@/lib/reports/pdf";
import { loadReportInput } from "@/lib/reports/load";

export const dynamic = "force-dynamic";
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const schema = z.object({ client_id: z.uuid().optional(), from: date, to: date, observations: z.string().max(3000).optional(), next_goals: z.string().max(2000).optional() })
  .refine((d) => d.from <= d.to, "El periodo es inválido").refine((d) => (new Date(d.to).getTime() - new Date(d.from).getTime()) / 86400000 <= 366, "El periodo máximo es de un año");

export async function POST(req: Request) {
  const origin = req.headers.get("origin"); const host = req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return NextResponse.json({ error: "forbidden" }, { status: 403 });   // CSRF: same-origin only
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(Object.fromEntries(await req.formData()));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const f = parsed.data;
  const { data: me } = await supabase.from("profiles").select("role,full_name").eq("id", user.id).single();
  const isTrainer = me?.role === "trainer"; const clientId = isTrainer ? f.client_id : user.id;
  if (!clientId) return NextResponse.json({ error: "Falta el alumno" }, { status: 400 });
  if (isTrainer) { const { data: ok } = await supabase.rpc("can_access_client", { c: clientId }); if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 }); }

  if (isTrainer) await createAdminClient().from("access_audit").insert({ actor_id: user.id, client_id: clientId, resource: "progress_report" });
  const input = await loadReportInput(supabase, { clientId, from: f.from, to: f.to, trainerName: isTrainer ? me?.full_name ?? null : null, observations: isTrainer ? f.observations?.trim() || null : null, nextGoals: isTrainer ? f.next_goals?.trim() || null : null });
  if (!input) return NextResponse.json({ error: "not found" }, { status: 404 });
  const data = buildReportData(input);
  const pdf = await renderReportPdf(data);
  await supabase.from("progress_reports").insert({ client_id: clientId, generated_by: user.id, period_start: f.from, period_end: f.to, observations: data.observations, next_goals: data.nextGoals, summary: { sessions: data.sessions, overallAdherencePct: data.overallAdherencePct, measurementCount: data.measurements.count } });
  const slug = data.clientName.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "alumno";
  return new NextResponse(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="informe-${slug}-${f.from}_${f.to}.pdf"`, "Cache-Control": "no-store" } });
}
