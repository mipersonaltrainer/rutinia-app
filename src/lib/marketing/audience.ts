import { isBirthdayToday } from "./birthday";
import { subscriptionBucket, type SubRow } from "@/lib/staff/summary";
import type { Audience, Kind } from "./schema";

export type Candidate = { id: string; name: string; birth_date: string | null; marketing_in_app: boolean; marketing_email: boolean; sub: SubRow | null };

/** Who is in an audience. `userId` is only used by "uno". Pure: the same rule is used for the preview count and for the real send. */
export function inAudience(c: Candidate, audience: Audience, now: Date, userId?: string | null): boolean {
  switch (audience) {
    case "todos": return true;
    case "pagando": return subscriptionBucket(c.sub, now) === "paid";
    case "prueba": return subscriptionBucket(c.sub, now) === "trial";
    case "bloqueados": return subscriptionBucket(c.sub, now) === "blocked";
    case "cumple_hoy": return isBirthdayToday(c.birth_date, now);
    case "uno": return !!userId && c.id === userId;
  }
}

export type Reach = { inApp: Candidate[]; email: Candidate[] };
/**
 * Opt-outs: a service notice ("comunicado") always reaches the bell; campaigns and greetings respect `marketing_in_app`.
 * E-mail always respects `marketing_email`. A test to a single person ("uno") ignores opt-outs: it is the team checking the message.
 */
export function reach(cands: Candidate[], kind: Kind, audience: Audience, now: Date, userId?: string | null): Reach {
  const people = cands.filter((c) => inAudience(c, audience, now, userId));
  const test = audience === "uno";
  return { inApp: people.filter((c) => test || kind === "comunicado" || c.marketing_in_app), email: people.filter((c) => test || c.marketing_email) };
}
