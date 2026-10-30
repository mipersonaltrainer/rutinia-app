import { NextResponse, type NextRequest } from "next/server";
import { getBillingConfig } from "@/lib/billing/config";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchPayment } from "@/lib/billing/providers/bold";
import { settleBoldPayment } from "@/lib/billing/settle";

export const dynamic = "force-dynamic";

/** Bold appends bold-order-id and bold-tx-status. The status is only a hint ("may not be final"): nothing is granted from it, we re-read the payment from the Bold API. */
export async function GET(req: NextRequest) {
  const cfg = getBillingConfig();
  const back = (s: string) => NextResponse.redirect(new URL(`/trainer/billing?pago=${s}`, cfg.baseUrl));
  const orderId = req.nextUrl.searchParams.get("bold-order-id");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !orderId || !cfg.bold.enabled) return back("error");
  try {
    const admin = createAdminClient();
    const table = orderId.startsWith("SUB-") ? "subscription_payments" : orderId.startsWith("AC-") ? "ai_credit_purchases" : "slot_purchases";
    const { data: own } = await admin.from(table).select("id").eq("provider", "bold").eq("provider_reference", orderId).eq("trainer_id", user.id).maybeSingle();
    if (!own) return back("error");                                  // not this trainer's payment
    const pay = await fetchPayment(cfg, orderId);
    if (!pay) return back("pendiente");
    await settleBoldPayment(admin, pay);
    return back(pay.status === "APPROVED" ? "ok" : pay.status === "REJECTED" || pay.status === "FAILED" ? "rechazado" : "pendiente");
  } catch { return back("pendiente"); }                                // the webhook will reconcile
}
