import { NextResponse } from "next/server";
import { getBillingConfig } from "@/lib/billing/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPayPalClient } from "@/lib/billing/providers/paypal";
import { claimWebhookEvent, markWebhookProcessed, reconcilePayPalSubscription, settlePayPalOrder } from "@/lib/billing/settle";

export const dynamic = "force-dynamic";

interface PPEvent { id: string; event_type: string; resource?: Record<string, unknown> & { id?: string; billing_agreement_id?: string; supplementary_data?: { related_ids?: { order_id?: string } } } }

export async function POST(req: Request) {
  const cfg = getBillingConfig();
  if (!cfg.paypal.enabled) return NextResponse.json({ error: "paypal not configured" }, { status: 503 });
  let ev: PPEvent;
  try { ev = (await req.json()) as PPEvent; } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const pp = createPayPalClient(cfg);
  if (!ev.id || !(await pp.verifyWebhook(req.headers, ev))) return NextResponse.json({ error: "invalid signature" }, { status: 401 });

  const admin = createAdminClient();
  try {
    if (!(await claimWebhookEvent(admin, "paypal", ev.id, ev))) return NextResponse.json({ ok: true, duplicate: true });
    const t = ev.event_type;
    // The event only tells us WHERE to look; the amounts and states are always re-read from the PayPal API.
    if (t.startsWith("PAYMENT.CAPTURE.")) {
      const orderId = ev.resource?.supplementary_data?.related_ids?.order_id;
      if (orderId) await settlePayPalOrder(admin, await pp.getOrder(orderId));
    } else if (t.startsWith("BILLING.SUBSCRIPTION.")) {
      if (ev.resource?.id) await reconcilePayPalSubscription(admin, pp, ev.resource.id);
    } else if (t.startsWith("PAYMENT.SALE.")) {
      if (ev.resource?.billing_agreement_id) await reconcilePayPalSubscription(admin, pp, ev.resource.billing_agreement_id);
    }
    await markWebhookProcessed(admin, "paypal", ev.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("paypal webhook failed", (e as Error).message);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
