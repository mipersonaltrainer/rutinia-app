import type { SupabaseClient } from "@supabase/supabase-js";
import { PHOTO_BUCKET } from "./erase";

const rows = <T,>(r: { data: T[] | null }) => r.data ?? [];

/** Everything the platform holds about a client, read through the client's own session (RLS decides what is theirs). */
export async function buildClientExport(supabase: SupabaseClient, userId: string) {
  const [profile, consents, assessments, measurements, results, logs, photos, schedule, reports, notifications, messages, calls, plans, nutrition, audit, aiAboutMe] = await Promise.all([
    supabase.from("profiles").select("id,full_name,role,created_at").eq("id", userId).single(),
    supabase.from("consents").select("type,granted_at,revoked_at").eq("user_id", userId),
    supabase.from("assessments").select("kind,status,data,risk_level,risk_reasons,submitted_at,created_at").eq("client_id", userId).order("created_at"),
    supabase.from("anthropometric_measurements").select("*").eq("client_id", userId).order("measured_on"),
    supabase.from("calculation_results").select("measurement_id,indicator,value,unit,formula,formula_version,provenance,inputs,created_at").eq("client_id", userId),
    supabase.from("workout_logs").select("id,status,started_at,finished_at,recovery_rating,session_rpe,pain_level,pain_notes,notes,planned_sets,logged_work_sets, logged_sets(kind,set_number,reps,load_kg,duration_sec,rpe,rir,note,exercise:exercises!prescribed_exercises_exercise_id_fkey(name_es)), exercise_discomforts(severity,area,note,exercise:exercises!prescribed_exercises_exercise_id_fkey(name_es))").eq("client_id", userId).order("started_at"),
    supabase.from("progress_photos").select("id,taken_on,pose,content_type,size_bytes,notes,storage_path,created_at, photo_reviews(comment,created_at)").eq("client_id", userId).order("taken_on"),
    supabase.from("photo_schedules").select("kind,custom_days,anchor_on").eq("client_id", userId).maybeSingle(),
    supabase.from("progress_reports").select("period_start,period_end,summary,created_at").eq("client_id", userId),
    supabase.from("notifications").select("kind,title,body,created_at,read_at").eq("user_id", userId),
    supabase.from("messages").select("sender_id,kind,body,created_at,read_at").eq("client_id", userId).order("created_at"),
    supabase.from("video_calls").select("scheduled_at,status,note,url").eq("client_id", userId).order("scheduled_at"),
    supabase.from("training_plans").select("title,goal,level,created_at, plan_versions!plan_versions_plan_id_fkey(version_no,status,change_note,published_at, plan_sessions(name,weekday,warmup_notes, prescribed_exercises(position,sets,reps_min,reps_max,duration_sec,load_kg,rest_sec,client_notes, exercise:exercises!prescribed_exercises_exercise_id_fkey(name_es))))").eq("client_id", userId),
    supabase.from("nutrition_plans").select("title,status,kcal_target,protein_g,carbs_g,fat_g,notes,published_at, nutrition_meals(name,position,note, nutrition_items(grams, food:foods(name_es)))").eq("client_id", userId),
    supabase.from("access_audit").select("actor_id,resource,at").eq("client_id", userId).order("at"),
    supabase.rpc("my_ai_interactions_about_me"),
  ]);
  // who looked at the data: names the client may already see (their own trainers); anything else stays an opaque id
  const actorIds = [...new Set(((audit.data ?? []) as { actor_id: string }[]).map((a) => a.actor_id))];
  const actors = actorIds.length ? ((await supabase.from("profiles").select("id,full_name").in("id", actorIds)).data ?? []) : [];
  const actorName = new Map(actors.map((a) => [a.id as string, a.full_name as string]));
  const photoRows = rows(photos) as unknown as { id: string; storage_path: string }[];
  const signed = photoRows.length ? await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(photoRows.map((p) => p.storage_path), 600) : { data: [] as { path: string | null; signedUrl: string }[] };
  const urlBy = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));
  return {
    format_version: 1, exported_at: new Date().toISOString(), subject: "client",
    note: "Los enlaces de las fotos caducan a los 10 minutos de generar esta exportación.",
    profile: profile.data, consents: rows(consents), assessments: rows(assessments), measurements: rows(measurements), calculation_results: rows(results),
    workouts: rows(logs), progress_photos: (photoRows as unknown as Record<string, unknown>[]).map(({ storage_path, ...p }) => ({ ...p, download_url: urlBy.get(storage_path as string) ?? null })),
    photo_schedule: schedule.data ?? null, progress_reports: rows(reports), notifications: rows(notifications), messages: rows(messages), video_calls: rows(calls),
    training_plans: rows(plans), nutrition_plans: rows(nutrition), ai_drafts_about_you: rows(aiAboutMe), access_log: ((audit.data ?? []) as { actor_id: string; resource: string; at: string }[]).map((a) => ({ resource: a.resource, at: a.at, by: actorName.get(a.actor_id) ?? "profesional (cuenta cerrada o ya sin relación)" })),
  };
}

/** Trainer account data (not their clients' health data, which belongs to the clients). */
export async function buildTrainerExport(supabase: SupabaseClient, userId: string) {
  const [profile, sub, clients, plans, exercises, invitations, purchases, payments, audit, recs, aiPurchases, prefs, devices, threads, aiUsage] = await Promise.all([
    supabase.from("profiles").select("id,full_name,role,created_at").eq("id", userId).single(),
    supabase.from("trainer_subscriptions").select("status,trial_started_at,trial_ends_at,provider,current_period_end,updated_at").eq("trainer_id", userId).maybeSingle(),
    supabase.from("trainer_client_relationships").select("status,created_at,client:profiles!trainer_client_relationships_client_id_fkey(full_name)").eq("trainer_id", userId),
    supabase.from("training_plans").select("id,title,goal,level,is_template,created_at,archived_at, plan_versions!plan_versions_plan_id_fkey(version_no,status,change_note,published_at, plan_sessions(name,weekday,warmup_notes, prescribed_exercises(position,sets,reps_min,reps_max,load_kg,rpe,rir,rest_sec,tempo,client_notes, exercise:exercises!prescribed_exercises_exercise_id_fkey(name_es))))").eq("trainer_id", userId),
    supabase.from("exercises").select("name_es,alt_names,primary_muscle,equipment,difficulty,instructions,safety_notes,created_at").eq("owner_id", userId),
    supabase.from("invitations").select("email,full_name,status,created_at,expires_at").eq("trainer_id", userId),
    supabase.from("slot_purchases").select("created_at,provider,quantity,unit_price_cents,total_cents,currency,charged_amount_cents,charged_currency,status,provider_reference").eq("trainer_id", userId),
    supabase.from("subscription_payments").select("created_at,provider,amount_usd_cents,charged_amount_cents,charged_currency,status,period_start,period_end,snapshot").eq("trainer_id", userId),
    supabase.from("billing_audit_events").select("kind,detail,created_at").eq("trainer_id", userId),
    supabase.from("coach_recommendations").select("type,severity,title,status,created_at, recommendation_decisions(decision,reason,created_at)").eq("trainer_id", userId),
    supabase.from("ai_credit_purchases").select("created_at,provider,pack,credits,total_cents,currency,charged_amount_cents,charged_currency,status,provider_reference").eq("trainer_id", userId),
    supabase.from("profiles").select("birth_date,marketing_in_app,marketing_email").eq("id", userId).single(),
    supabase.from("push_subscriptions").select("user_agent,created_at").eq("user_id", userId),          // device keys and endpoints are credentials, not data: left out on purpose
    supabase.from("support_threads").select("category,subject,status,created_at, support_messages(sender_kind,body,created_at)").eq("trainer_id", userId).order("created_at"),
    supabase.from("ai_usage").select("kind,status,provider,model,input_tokens,output_tokens,created_at").eq("user_id", userId).order("created_at"),
  ]);
  return { format_version: 1, exported_at: new Date().toISOString(), subject: "trainer", profile: { ...profile.data, ...(prefs.data ?? {}) }, push_devices: rows(devices), support_conversations: rows(threads), ai_usage: rows(aiUsage), subscription: sub.data ?? null, clients: rows(clients), plans: rows(plans), custom_exercises: rows(exercises), invitations: rows(invitations), slot_purchases: rows(purchases), ai_credit_purchases: rows(aiPurchases), subscription_payments: rows(payments), billing_events: rows(audit), progression_proposals: rows(recs) };
}
