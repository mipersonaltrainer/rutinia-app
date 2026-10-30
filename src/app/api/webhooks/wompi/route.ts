import { NextResponse } from "next/server";
import { getBillingConfig } from "@/lib/billing/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchTransaction, verifyEventChecksum, type WompiEvent } from "@/lib/billing/providers/wompi";
import { claimWebhookEvent, markWebhookProcessed, settleWompiTransaction } from "@/lib/billing/settle";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const cfg = getBillingConfig();
  if (!cfg.wompi.enabled) return NextResponse.json({ error: "wompi not configured" }, { status: 503 });
  let ev: WompiEvent;
  try { ev = (await req.json()) as WompiEvent; } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  if (!verifyEventChecksum(ev, cfg.wompi.eventsSecret, req.headers.get("x-event-checksum"))) return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  if (ev.event !== "transaction.updated") return NextResponse.json({ ok: true, ignored: ev.event });
  const expectedEnv = cfg.wompi.env === "production" ? "prod" : "test";
  if (ev.environment && ev.environment !== expectedEnv) return NextResponse.json({ error: "wrong environment" }, { status: 400 });

  const admin = createAdminClient();
  const eventId = ev.signature!.checksum.toLowerCase();       // covers id + status + amount + timestamp: unique per state change
  try {
    if (!(await claimWebhookEvent(admin, "wompi", eventId, ev))) return NextResponse.json({ ok: true, duplicate: true });
    const txId = (ev.data as { transaction?: { id?: string } }).transaction?.id;
    if (!txId) return NextResponse.json({ error: "no transaction id" }, { status: 400 });
    const tx = await fetchTransaction(cfg, txId);                // authoritative state from the Wompi API, not the webhook body
    if (!tx) return NextResponse.json({ error: "transaction not found" }, { status: 502 });
    const result = await settleWompiTransaction(admin, tx);
    await markWebhookProcessed(admin, "wompi", eventId);
    return NextResponse.json({ ok: true, result: result.result });
  } catch (e) {
    console.error("wompi webhook failed", (e as Error).message);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });   // non-200 => Wompi retries
  }
}
