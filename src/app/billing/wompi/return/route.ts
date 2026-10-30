import { NextResponse, type NextRequest } from "next/server";
import { getBillingConfig } from "@/lib/billing/config";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchTransaction } from "@/lib/billing/providers/wompi";
import { settleWompiTransaction } from "@/lib/billing/settle";

export const dynamic = "force-dynamic";

/** The redirect only carries a transaction id. Nothing is granted from it: we re-read the transaction from the Wompi API. */
export async function GET(req: NextRequest) {
  const cfg = getBillingConfig();
  const back = (s: string) => NextResponse.redirect(new URL(`/trainer/billing?pago=${s}`, cfg.baseUrl));
  const id = req.nextUrl.searchParams.get("id");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !id || !cfg.wompi.enabled) return back("error");
  try {
    const tx = await fetchTransaction(cfg, id);
    if (!tx) return back("pendiente");
    const admin = createAdminClient();
    const table = tx.reference.startsWith("SUB-") ? "subscription_payments" : tx.reference.startsWith("AC-") ? "ai_credit_purchases" : "slot_purchases";
    const { data: own } = await admin.from(table).select("id").eq("provider", "wompi").eq("provider_reference", tx.reference).eq("trainer_id", user.id).maybeSingle();
    if (!own) return back("error");                                  // not this trainer's payment
    await settleWompiTransaction(admin, tx);
    return back(tx.status === "APPROVED" ? "ok" : tx.status === "PENDING" ? "pendiente" : "rechazado");
  } catch { return back("pendiente"); }                                // webhook will reconcile
}
