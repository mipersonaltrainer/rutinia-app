import type { SupabaseClient } from "@supabase/supabase-js";
import type webpush from "web-push";
import { emailsById } from "@/lib/staff/data";
import { colombiaToday, isBirthdayToday } from "./birthday";
import { reach, type Candidate } from "./audience";
import { emailConfig, sendEmail } from "./email";
import { pushConfig, sendPush } from "./push";
import { firstName, render, type Audience, type Channel, type Kind } from "./schema";
import type { SubRow } from "@/lib/staff/summary";

type Admin = SupabaseClient;
export type Deps = { now?: Date; env?: Record<string, string | undefined>; fetchImpl?: typeof fetch; push?: Pick<typeof webpush, "sendNotification"> };
export type CampaignRow = { id: string; kind: Kind; title: string; body: string; link: string | null; channels: Channel[]; audience: Audience; audience_user: string | null; status: string; scheduled_at: string | null };
export type SendStats = { recipients: number; in_app?: number; push_sent?: number; push_failed?: number; push_removed?: number; push_skipped?: string; email_sent?: number; email_failed?: number; email_skipped?: string };

const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
/** Runs `fn` over the items a few at a time, so a big audience does not open hundreds of connections at once. */
async function pool<T>(items: T[], size: number, fn: (x: T) => Promise<void>) { for (const c of chunks(items, size)) await Promise.all(c.map(fn)); }

export async function loadCandidates(admin: Admin): Promise<Candidate[]> {
  const [{ data: profs }, { data: subs }] = await Promise.all([
    admin.from("profiles").select("id,full_name,birth_date,marketing_in_app,marketing_email").eq("role", "trainer").limit(5000),
    admin.from("trainer_subscriptions").select("trainer_id,status,trial_ends_at,current_period_end"),
  ]);
  const by = new Map((subs ?? []).map((s) => [s.trainer_id as string, s as unknown as SubRow]));
  return (profs ?? []).map((p) => ({ id: p.id as string, name: p.full_name as string, birth_date: p.birth_date as string | null, marketing_in_app: p.marketing_in_app as boolean, marketing_email: p.marketing_email as boolean, sub: by.get(p.id as string) ?? null }));
}

/** How many people each channel would reach, with the same rules as the real send (used for the preview and the confirmation). */
export async function previewReach(admin: Admin, c: Pick<CampaignRow, "kind" | "audience" | "audience_user" | "channels">, now = new Date()) {
  const r = reach(await loadCandidates(admin), c.kind, c.audience, now, c.audience_user);
  let push = 0;
  if (c.channels.includes("push") && r.inApp.length) {
    const ids = new Set<string>(); for (const part of chunks(r.inApp.map((x) => x.id), 200)) { const { data } = await admin.from("push_subscriptions").select("user_id").in("user_id", part); for (const s of data ?? []) ids.add(s.user_id as string); }
    push = ids.size;
  }
  const people = new Set<string>([...(c.channels.includes("in_app") ? r.inApp : []), ...(c.channels.includes("email") ? r.email : [])].map((x) => x.id));
  return { recipients: people.size, in_app: c.channels.includes("in_app") ? r.inApp.length : 0, push, email: c.channels.includes("email") ? r.email.length : 0 };
}

/**
 * Sends a campaign once. The status change draft/scheduled → sending is the claim: two overlapping runs (a double click, the cron and a
 * person) cannot both send. In-app delivery is also idempotent per person through the notification's dedupe key.
 * `onlyIds` / `dedupeKey` are for birthday greetings (restrict to people not yet greeted this year, one notification per person per year).
 */
export async function sendCampaign(admin: Admin, id: string, opts: { onlyIds?: Set<string>; dedupeKey?: string } = {}, deps: Deps = {}): Promise<{ ok: boolean; reason?: string; stats?: SendStats }> {
  const now = deps.now ?? new Date(), env = deps.env ?? process.env;
  const { data: claimed } = await admin.from("marketing_campaigns").update({ status: "sending" }).eq("id", id).in("status", ["draft", "scheduled"]).select("id,kind,title,body,link,channels,audience,audience_user,status,scheduled_at").maybeSingle();
  if (!claimed) return { ok: false, reason: "not_sendable" };
  const c = claimed as unknown as CampaignRow;
  const stats: SendStats = { recipients: 0 };
  try {
    const cands = await loadCandidates(admin);
    const r = reach(cands, c.kind, c.audience, now, c.audience_user);
    const keep = <T extends { id: string }>(xs: T[]) => (opts.onlyIds ? xs.filter((x) => opts.onlyIds!.has(x.id)) : xs);
    const inApp = keep(r.inApp), mail = keep(r.email);
    stats.recipients = new Set([...(c.channels.includes("in_app") ? inApp : []), ...(c.channels.includes("email") ? mail : [])].map((x) => x.id)).size;
    const dedupe = opts.dedupeKey ?? `camp:${c.id}`;

    if (c.channels.includes("in_app")) {
      let n = 0;
      for (const part of chunks(inApp, 500)) {
        const { data } = await admin.from("notifications").upsert(part.map((p) => ({ user_id: p.id, kind: "marketing", title: render(c.title, firstName(p.name)), body: render(c.body, firstName(p.name)), link: c.link, dedupe_key: dedupe })), { onConflict: "user_id,dedupe_key", ignoreDuplicates: true }).select("id");
        n += data?.length ?? 0;
      }
      stats.in_app = n;
    }

    if (c.channels.includes("push")) {
      const cfg = pushConfig(env);
      if (!cfg) stats.push_skipped = "not_configured";
      else {
        stats.push_sent = 0; stats.push_failed = 0; stats.push_removed = 0;
        const nameOf = new Map(inApp.map((p) => [p.id, firstName(p.name)]));
        for (const part of chunks(inApp.map((p) => p.id), 200)) {
          const { data: subs } = await admin.from("push_subscriptions").select("user_id,endpoint,p256dh,auth").in("user_id", part);
          await pool(subs ?? [], 8, async (s) => {
            const nombre = nameOf.get(s.user_id as string) ?? "";
            const res = await sendPush(cfg, { endpoint: s.endpoint as string, p256dh: s.p256dh as string, auth: s.auth as string }, { title: render(c.title, nombre), body: render(c.body, nombre), url: c.link ?? "/trainer/notifications" }, deps.push);
            if (res.ok) stats.push_sent!++; else { stats.push_failed!++; if (res.gone) { await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint as string); stats.push_removed!++; } }
          });
        }
      }
    }

    if (c.channels.includes("email")) {
      const cfg = emailConfig(env);
      if (!cfg) stats.email_skipped = "not_configured";
      else {
        stats.email_sent = 0; stats.email_failed = 0;
        const emails = await emailsById(admin); const base = env.APPLICATION_BASE_URL?.trim() || "https://rutinia-beta.vercel.app";
        await pool(mail, 5, async (p) => {
          const to = emails.get(p.id); if (!to) { stats.email_failed!++; return; }
          const nombre = firstName(p.name);
          const res = await sendEmail(cfg, { to, subject: render(c.title, nombre), text: render(c.body, nombre), link: c.link ?? undefined, unsubscribeUrl: `${base.replace(/\/+$/, "")}/trainer/account` }, base, deps.fetchImpl);
          if (res.ok) stats.email_sent!++; else stats.email_failed!++;
        });
      }
    }
    const delivered = (stats.in_app ?? 0) + (stats.push_sent ?? 0) + (stats.email_sent ?? 0);
    const failed = (stats.push_failed ?? 0) + (stats.email_failed ?? 0);
    await admin.from("marketing_campaigns").update({ status: delivered === 0 && failed > 0 ? "failed" : "sent", sent_at: now.toISOString(), stats }).eq("id", id);
    return { ok: true, stats };
  } catch (e) {
    await admin.from("marketing_campaigns").update({ status: "failed", stats: { ...stats, error: (e as Error).message.slice(0, 200) } }).eq("id", id);
    return { ok: false, reason: "error", stats };
  }
}

/** Sends every scheduled campaign whose time has come. Called by the daily cron. */
export async function runDueCampaigns(admin: Admin, deps: Deps = {}) {
  const now = deps.now ?? new Date();
  const { data } = await admin.from("marketing_campaigns").select("id").eq("status", "scheduled").lte("scheduled_at", now.toISOString()).order("scheduled_at").limit(20);
  const out: { id: string; ok: boolean }[] = [];
  for (const c of data ?? []) { const r = await sendCampaign(admin, c.id as string, {}, deps); out.push({ id: c.id as string, ok: r.ok }); }
  return out;
}

/**
 * Greets the trainers whose birthday is today (Colombia), once per year each. `auto` = called by the cron: does nothing unless the team turned the
 * automatic greeting on. The manual button passes auto=false. Returns how many people were greeted.
 */
export async function sendBirthdayGreetings(admin: Admin, opts: { auto: boolean; createdBy?: string | null }, deps: Deps = {}): Promise<{ greeted: number; skipped?: string; campaignId?: string }> {
  const now = deps.now ?? new Date();
  const { data: st } = await admin.from("marketing_settings").select("birthday_auto,birthday_title,birthday_body,birthday_channels").eq("id", true).maybeSingle();
  if (!st) return { greeted: 0, skipped: "no_settings" };
  if (opts.auto && !st.birthday_auto) return { greeted: 0, skipped: "auto_off" };
  const year = colombiaToday(now).y;
  const cands = (await loadCandidates(admin)).filter((c) => isBirthdayToday(c.birth_date, now));
  if (!cands.length) return { greeted: 0, skipped: "nobody" };
  const { data: done } = await admin.from("birthday_greetings").select("user_id").eq("year", year).in("user_id", cands.map((c) => c.id));
  const already = new Set((done ?? []).map((d) => d.user_id as string));
  const todo = cands.filter((c) => !already.has(c.id)); if (!todo.length) return { greeted: 0, skipped: "already_greeted" };
  const { data: camp } = await admin.from("marketing_campaigns").insert({ kind: "cumple", title: st.birthday_title, body: st.birthday_body, link: null, channels: st.birthday_channels, audience: "cumple_hoy", status: "draft", created_by: opts.createdBy ?? null }).select("id").single();
  if (!camp) return { greeted: 0, skipped: "error" };
  const res = await sendCampaign(admin, camp.id as string, { onlyIds: new Set(todo.map((t) => t.id)), dedupeKey: `bday:${year}` }, deps);
  if (!res.ok) return { greeted: 0, skipped: res.reason, campaignId: camp.id as string };
  await admin.from("birthday_greetings").upsert(todo.map((t) => ({ user_id: t.id, year })), { onConflict: "user_id,year", ignoreDuplicates: true });
  return { greeted: todo.length, campaignId: camp.id as string };
}
