// Which Postgres Changes a signed-in user listens to. Pure so the filters can be tested; the database (RLS) is
// still what decides which rows are actually delivered.
export type Sub = { table: "messages" | "video_calls" | "notifications" | "support_threads"; event: "INSERT" | "UPDATE" | "*"; filter?: string };

export function subscriptionsFor(role: "trainer" | "client" | "staff", userId: string): Sub[] {
  // The support team listens to every conversation (no filter): RLS lets only staff receive those rows.
  if (role === "staff") return [{ table: "support_threads", event: "*" }, { table: "notifications", event: "INSERT", filter: `user_id=eq.${userId}` }];
  const mine = role === "trainer" ? `trainer_id=eq.${userId}` : `client_id=eq.${userId}`;
  return [
    { table: "messages", event: "INSERT", filter: mine },
    { table: "messages", event: "UPDATE", filter: mine },       // read receipts
    { table: "video_calls", event: "*", filter: mine },          // scheduled / canceled
    { table: "notifications", event: "INSERT", filter: `user_id=eq.${userId}` },
    ...(role === "trainer" ? [{ table: "support_threads", event: "*", filter: `trainer_id=eq.${userId}` } as Sub] : []),   // replies from the team, unread counters
  ];
}

/** Collapses bursts of events into one refresh. */
export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return Object.assign((...a: A) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }, { cancel: () => clearTimeout(t) });
}
