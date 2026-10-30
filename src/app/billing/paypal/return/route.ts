import { NextResponse, type NextRequest } from "next/server";
import { getBillingConfig } from "@/lib/billing/config";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPayPalClient } from "@/lib/billing/providers/paypal";
import { reconcilePayPalSubscription, settlePayPalOrder } from "@/lib/billing/settle";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cfg = getBillingConfig();
  const back = (s: string) => NextResponse.redirect(new URL(`/trainer/billing?pago=${s}`, cfg.baseUrl));
  const sp = req.nextUrl.searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !cfg.paypal.enabled) return back("error");
  const pp = createPayPalClient(cfg); const admin = createAdminClient();
  try {
    const subId = sp.get("subscription_id");
    if (subId) {
      const r = await reconcilePayPalSubscription(admin, pp, subId);
      return back(r.result === "unknown_subscription" ? "error" : "ok");
    }
    const orderId = sp.get("token");                                  // PayPal returns the order id as `token`
    if (!orderId) return back("error");
    const find = (table: "slot_purchases" | "ai_credit_purchases") => admin.from(table).select("id,status").eq("provider", "paypal").eq("provider_reference", orderId).eq("trainer_id", user.id).maybeSingle();
    const own = (await find("slot_purchases")).data ?? (await find("ai_credit_purchases")).data;
    if (!own) return back("error");
    let order = await pp.getOrder(orderId);
    if (order.status === "APPROVED") order = await pp.captureOrder(orderId);   // buyer approved: capture now (idempotent via PayPal-Request-Id)
    const r = await settlePayPalOrder(admin, order);
    return back(r.status === "approved" || r.result === "noop" && own.status === "approved" ? "ok" : r.status === "declined" ? "rechazado" : "pendiente");
  } catch { return back("pendiente"); }
}
