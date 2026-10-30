import { requireUser } from "@/lib/session";
import { ActionForm } from "@/components/ActionForm";
import { MeasurementFields } from "@/components/MeasurementFields";
import { MeasurementsView } from "@/components/MeasurementsView";
import { addOwnMeasurement } from "../actions";

export default async function Measurements() {
  const { profile, supabase } = await requireUser("client");
  const [{ data: rows }, { data: results }] = await Promise.all([
    supabase.from("anthropometric_measurements").select("*").eq("client_id", profile.id).order("measured_on", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("calculation_results").select("*").eq("client_id", profile.id),
  ]);
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">Medidas corporales</h1>
      <ActionForm action={addOwnMeasurement} submitLabel="Guardar medición"><h2 className="font-semibold">Nueva medición</h2><MeasurementFields /></ActionForm>
      <MeasurementsView rows={(rows ?? []) as never} results={(results ?? []) as never} />
    </section>
  );
}
