export type Wait = { text: string; tone: "ok" | "warn" | "late" };

/** How long a conversation has been waiting for the team: «hace 5 min», «hace 3 h», «hace 2 d», with a tone for the inbox (under 1 h ok, under 24 h attention, beyond that late). */
export function waitSince(fromIso: string, now: Date = new Date()): Wait {
  const min = Math.max(0, Math.floor((now.getTime() - new Date(fromIso).getTime()) / 60_000));
  if (min < 1) return { text: "ahora", tone: "ok" };
  if (min < 60) return { text: `hace ${min} min`, tone: "ok" };
  const h = Math.floor(min / 60);
  if (h < 24) return { text: `hace ${h} h`, tone: "warn" };
  return { text: `hace ${Math.floor(h / 24)} d`, tone: "late" };
}
