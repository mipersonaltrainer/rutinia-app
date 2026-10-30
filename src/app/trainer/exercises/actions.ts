"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/exercises/slug";
import { MUSCLE_LABEL, EQUIPMENT_LABEL, LEVEL_LABEL, PATTERN_LABEL } from "@/lib/exercises/labels";

type State = { error?: string; ok?: string } | undefined;
const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

const schema = z.object({
  name_es: z.string().min(3, "Nombre requerido").max(120),
  primary_muscle: z.enum(Object.keys(MUSCLE_LABEL) as [string, ...string[]]),
  equipment: z.enum(Object.keys(EQUIPMENT_LABEL) as [string, ...string[]]),
  difficulty: z.enum(Object.keys(LEVEL_LABEL) as [string, ...string[]]),
  movement_pattern: z.enum(Object.keys(PATTERN_LABEL) as [string, ...string[]]),
  instructions: z.string().min(10, "Escribe al menos un paso de instrucciones").max(2000),
  safety_notes: z.string().max(1000).optional().default(""),
});

export async function createCustomExercise(_: State, fd: FormData): Promise<State> {
  const p = schema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada" };
  const d = p.data;
  const { data, error } = await supabase.from("exercises").insert({
    owner_id: user.id, slug: slugify(d.name_es), name_es: d.name_es, primary_muscle: d.primary_muscle, equipment: d.equipment, difficulty: d.difficulty, movement_pattern: d.movement_pattern,
    exercise_type: "strength", instructions: lines(d.instructions), safety_notes: lines(d.safety_notes), tags: [d.primary_muscle, d.equipment, "propio"],
    home_friendly: ["bodyweight", "band", "dumbbell", "kettlebell", "suspension"].includes(d.equipment), source: "Ejercicio creado por el entrenador", review_status: "draft",
  }).select("id").single();
  if (error) return { error: error.code === "23505" ? "Ya tienes un ejercicio con ese nombre" : "No se pudo crear el ejercicio" };
  redirect(`/trainer/exercises/${data.id}`);
}

export async function addExerciseMedia(exerciseId: string, _: State, fd: FormData): Promise<State> {
  const p = z.object({ url: z.url().refine((u) => u.startsWith("https://"), "Solo enlaces https"), provenance: z.string().min(3, "Indica la procedencia/licencia") }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada" };
  const { error } = await supabase.from("exercise_media").insert({ exercise_id: exerciseId, owner_id: user.id, kind: "video", url: p.data.url, provenance: p.data.provenance });
  if (error) return { error: "No se pudo añadir (solo puedes añadir multimedia a tus propios ejercicios)" };
  await supabase.from("exercises").update({ media_status: "available" }).eq("id", exerciseId);
  revalidatePath(`/trainer/exercises/${exerciseId}`);
  return { ok: "Enlace añadido" };
}
