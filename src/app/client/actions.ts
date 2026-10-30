"use server";
import { revalidatePath } from "next/cache";
import { assessmentSchema } from "@/lib/assessment/schema";
import { formToAssessment } from "@/lib/assessment/fromForm";
import { screenRisk } from "@/lib/assessment/risk";
import { recordMeasurement } from "@/lib/measurements/service";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type State = { error?: string; ok?: string } | undefined;

export async function submitAssessment(_: State, fd: FormData): Promise<State> {
  const parsed = assessmentSchema.safeParse(formToAssessment(fd));
  if (!parsed.success) { const i = parsed.error.issues[0]; return { error: `${i.path.join(".")}: ${i.message}` }; }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada" };
  const { count } = await supabase.from("assessments").select("id", { count: "exact", head: true }).eq("client_id", user.id).eq("status", "submitted");
  const risk = screenRisk(parsed.data);   // computed on the server, never trusted from the browser
  // Users cannot write assessments through the public API (SEC-003): the server stores it, with the risk it computed and the identity of the session.
  const { error } = await createAdminClient().from("assessments").insert({
    client_id: user.id, kind: count ? "reassessment" : "initial", status: "submitted", data: parsed.data,
    risk_level: risk.level, risk_reasons: risk.reasons, submitted_at: new Date().toISOString(),
  });
  if (error) return { error: "No se pudo guardar la evaluación" };
  revalidatePath("/client/assessment");
  return { ok: "Evaluación enviada a tu entrenador" };
}

export async function addOwnMeasurement(_: State, fd: FormData): Promise<State> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada" };
  const r = await recordMeasurement(supabase, { clientId: user.id, enteredBy: user.id, takenBy: "self", form: fd });
  revalidatePath("/client/measurements");
  return r;
}
