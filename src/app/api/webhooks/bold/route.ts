import { NextResponse } from "next/server";
import { getBillingConfig } from "@/lib/billing/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchPayment, verifyWebhookSignature, type BoldWebhookEvent } from "@/lib/billing/providers/bold";
import { claimWebhookEvent, markWebhookProcessed, settleBoldPayment } from "@/lib/billing/settle";

export const dynamic = "force-dynamic";

const HANDLED = new Set(["SALE_APPROVED", "SALE_REJECTED", "VOID_APPROVED", "VOID_REJECTED"]);

export async function POST(req: Request) {
  const cfg = getBillingConfig();
  if (!cfg.bold.enabled) return NextResponse.json({ error: "bold not configured" }, { status: 503 });
  const raw = await req.text();                                                // the signature covers the exact bytes received
  if (!verifyWebhookSignature(raw, req.headers.get("x-bold-signature"), cfg.bold.secretKey)) return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  let ev: BoldWebhookEvent;
  try { ev = JSON.parse(raw) as BoldWebhookEvent; } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  if (!ev.id || !HANDLED.has(ev.type)) return NextResponse.json({ ok: true, ignored: ev.type ?? null });
  const orderId = ev.data?.metadata?.reference;                                // for the payment button this is our data-order-id
  if (!orderId) return NextResponse.json({ ok: true, ignored: "no reference" });

  const admin = createAdminClient();
  try {
    if (!(await claimWebhookEvent(admin, "bold", ev.id, ev))) return NextResponse.json({ ok: true, duplicate: true });      // Bold may deliver duplicates
    const pay = await fetchPayment(cfg, orderId);                              // authoritative state from the Bold API, not the webhook body
    if (!pay) return NextResponse.json({ error: "payment not found" }, { status: 502 });
    const result = await settleBoldPayment(admin, pay);
    await markWebhookProcessed(admin, "bold", ev.id);
    return NextResponse.json({ ok: true, result: result.result });
  } catch (e) {
    console.error("bold webhook failed", (e as Error).message);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });   // non-200 => Bold retries
  }
}
