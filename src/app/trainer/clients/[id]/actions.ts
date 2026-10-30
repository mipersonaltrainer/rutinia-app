"use server";
import { revalidatePath } from "next/cache";
import { recordMeasurement } from "@/lib/measurements/service";
import { createClient } from "@/lib/supabase/server";

export async function addMeasurementForClient(clientId: string, _: unknown, fd: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada" };
  // RLS (can_access_client) is the authority; a forged clientId is rejected by the database.
  const r = await recordMeasurement(supabase, { clientId, enteredBy: user.id, takenBy: "trainer", form: fd });
  revalidatePath(`/trainer/clients/${clientId}`);
  return r;
}
