import type { SupabaseClient } from "@supabase/supabase-js";
import { monthBounds, type Month, type SaleRow } from "./sales";
import { countBuckets, groupCount, summarizePayments, subscriptionBucket, type Bucket, type PayRow, type SubRow } from "./summary";

type Admin = SupabaseClient;
const ago = (now: Date, ms: number) => new Date(now.getTime() - ms).toISOString();
const DAY = 86400000;
const head = (admin: Admin, table: string) => admin.from(table).select("*", { count: "exact", head: true });

/** E-mail by user id. The auth API is paged (200); capped so a very large base cannot make a page slow. */
export async function emailsById(admin: Admin, cap = 2000): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let page = 1; out.size < cap; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    for (const u of data.users) if (u.email) out.set(u.id, u.email);
    if (data.users.length < 200) break;
  }
  return out;
}

export type TrainerRow = { id: string; name: string; email: string; bucket: Bucket; status: string; until: string | null; clients: number; created_at: string };

export async function loadTrainers(admin: Admin, now: Date): Promise<TrainerRow[]> {
  const [{ data: profs }, { data: subs }, { data: rels }, emails] = await Promise.all([
    admin.from("profiles").select("id,full_name,created_at").eq("role", "trainer").order("created_at", { ascending: false }).limit(2000),
    admin.from("trainer_subscriptions").select("trainer_id,status,trial_ends_at,current_period_end"),
    admin.from("trainer_client_relationships").select("trainer_id").eq("status", "active"),
    emailsById(admin),
  ]);
  const subBy = new Map((subs ?? []).map((s) => [s.trainer_id as string, s as SubRow & { trainer_id: string }]));
  const clients = groupCount(rels ?? [], (r) => r.trainer_id as string);
  return (profs ?? []).map((p) => {
    const s = subBy.get(p.id as string);
    return { id: p.id as string, name: p.full_name as string, email: emails.get(p.id as string) ?? "—", bucket: subscriptionBucket(s, now), status: s?.status ?? "—", until: s ? (s.current_period_end ?? s.trial_ends_at) : null, clients: clients[p.id as string] ?? 0, created_at: p.created_at as string };
  });
}

export async function loadOverview(admin: Admin, now: Date) {
  const d1 = ago(now, DAY), d7 = ago(now, 7 * DAY), d30 = ago(now, 30 * DAY), min10 = ago(now, 600_000);
  const [subs, trainers, clients, newTrainers, sessions7, openThreads, unanswered, latest, slots, subPays, aiPays, hooks, hooksStuck, audit, ai] = await Promise.all([
    admin.from("trainer_subscriptions").select("status,trial_ends_at,current_period_end"),
    head(admin, "profiles").eq("role", "trainer"),
    head(admin, "trainer_client_relationships").eq("status", "active"),
    head(admin, "profiles").eq("role", "trainer").gte("created_at", d7),
    head(admin, "workout_logs").eq("status", "completed").gte("finished_at", d7),
    head(admin, "support_threads").neq("status", "closed"),
    head(admin, "support_threads").gt("staff_unread", 0),
    admin.from("support_threads").select("id,subject,category,last_message_at,staff_unread,trainer:profiles!support_threads_trainer_id_fkey(full_name)").gt("staff_unread", 0).order("last_message_at", { ascending: true }).limit(5),
    admin.from("slot_purchases").select("status,provider,charged_amount_cents,charged_currency,created_at").gte("created_at", d30).limit(2000),
    admin.from("subscription_payments").select("status,provider,charged_amount_cents,charged_currency,created_at").gte("created_at", d30).limit(2000),
    admin.from("ai_credit_purchases").select("status,provider,charged_amount_cents,charged_currency,created_at").gte("created_at", d30).limit(2000),
    head(admin, "provider_webhook_events").gte("received_at", d1),
    head(admin, "provider_webhook_events").is("processed_at", null).lt("received_at", min10),
    admin.from("billing_audit_events").select("kind").gte("created_at", d7).limit(2000),
    admin.from("ai_usage").select("status,input_tokens,output_tokens").gte("created_at", d1).limit(5000),
  ]);
  const payRows = [...(slots.data ?? []), ...(subPays.data ?? []), ...(aiPays.data ?? [])] as PayRow[];
  const aiRows = ai.data ?? [];
  return {
    people: { trainers: trainers.count ?? 0, buckets: countBuckets((subs.data ?? []) as SubRow[], now), activeClients: clients.count ?? 0, newTrainers7d: newTrainers.count ?? 0, sessions7d: sessions7.count ?? 0 },
    support: { open: openThreads.count ?? 0, unanswered: unanswered.count ?? 0, waiting: (latest.data ?? []) as unknown as { id: string; subject: string; category: string; last_message_at: string; staff_unread: number; trainer: { full_name: string } | null }[] },
    payments: summarizePayments(payRows, now),
    system: {
      webhooks24h: hooks.count ?? 0, webhooksStuck: hooksStuck.count ?? 0, audit7d: groupCount(audit.data ?? [], (r) => r.kind as string),
      ai24h: { calls: aiRows.length, byStatus: groupCount(aiRows, (r) => r.status as string), tokens: aiRows.reduce((n, r) => n + (r.input_tokens ?? 0) + (r.output_tokens ?? 0), 0) },
    },
  };
}

export type SaleKind = "subscription" | "slots" | "ai";
export type SaleDetail = SaleRow & { kind: SaleKind };

/** Approved payments confirmed inside the Colombian month, from the three kinds of sale (subscription, student slots, AI credits). */
export async function loadSales(admin: Admin, mo: Month): Promise<SaleDetail[]> {
  const { from, to } = monthBounds(mo);
  const q = (table: string) => admin.from(table).select("verified_at,charged_amount_cents,charged_currency").eq("status", "approved").gte("verified_at", from).lt("verified_at", to).limit(5000);
  const [subs, slots, ai] = await Promise.all([q("subscription_payments"), q("slot_purchases"), q("ai_credit_purchases")]);
  const map = (rows: { verified_at: string | null; charged_amount_cents: number; charged_currency: string }[] | null, kind: SaleKind): SaleDetail[] =>
    (rows ?? []).filter((r) => r.verified_at).map((r) => ({ when: r.verified_at as string, cents: r.charged_amount_cents, currency: r.charged_currency, kind }));
  return [...map(subs.data, "subscription"), ...map(slots.data, "slots"), ...map(ai.data, "ai")];
}
