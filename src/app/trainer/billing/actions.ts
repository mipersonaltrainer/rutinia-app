"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBillingConfig } from "@/lib/billing/config";
import { AI_PACKS, AI_PACK_IDS, BASE_PRICE_COP_CENTS, aiPackTotalCents, slotPurchaseTotalCents, slotUnitCents } from "@/lib/billing/pricing";
import { buildButtonParams } from "@/lib/billing/providers/bold";
import type { BoldButtonParams } from "@/lib/billing/bold-shared";
import { normalizeReferralCode, REFERRAL_REWARDS } from "@/lib/billing/referrals";
import { createPayPalClient, PayPalError } from "@/lib/billing/providers/paypal";

type State = { error?: string; ok?: string; bold?: BoldButtonParams } | undefined;

async function trainerContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("auth");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "trainer") throw new Error("role");
  return { supabase, user };
}
/** Bold's checkout is a script on the page, not a redirect: hand the page the signed button parameters (the secret stays here). */
function boldCheckout(cfg: ReturnType<typeof getBillingConfig>, p: { orderId: string; amountCents: number; description: string; email?: string }): State {
  try { return { bold: buildButtonParams(cfg, { ...p, redirectPath: "/billing/bold/return", originPath: "/trainer/billing?pago=cancelado" }) }; }
  catch { return { error: "No se pudo preparar el pago con Bold." }; }
}

const slotSchema = z.object({
  quantity: z.coerce.number().int().min(1, "Elige entre 1 y 10 cupos").max(10, "Elige entre 1 y 10 cupos"),
  provider: z.enum(["paypal", "bold"]),
  confirm: z.literal("on", { error: "Debes confirmar la compra" }),
});

export async function startSlotCheckout(_: State, fd: FormData): Promise<State> {
  const p = slotSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const { supabase, user } = await trainerContext();
  const { data: allowed } = await supabase.rpc("trainer_has_access", { t: user.id });
  if (!allowed) return { error: "Tu espacio de trabajo no está activo. Suscríbete primero." };
  const cfg = getBillingConfig(); const admin = createAdminClient();
  const { quantity, provider } = p.data;
  const id = randomUUID();
  let target: string;

  if (provider === "bold") {
    if (!cfg.bold.enabled) return { error: "Bold no está configurado todavía." };
    const totalCop = slotPurchaseTotalCents(quantity, "COP");      // pesos are the price list, not a conversion
    const reference = `SP-${id}`;
    const { error } = await admin.from("slot_purchases").insert({ id, trainer_id: user.id, provider: "bold", provider_reference: reference, quantity, unit_price_cents: slotUnitCents(quantity, "COP"), total_cents: totalCop, currency: "COP", charged_amount_cents: totalCop, charged_currency: "COP", status: "pending" });
    if (error) return { error: "No se pudo iniciar el pago." };
    return boldCheckout(cfg, { orderId: reference, amountCents: totalCop, description: `Rutinia: ${quantity} cupo(s) adicional(es) de alumnos`, email: user.email });
  } else {
    if (!cfg.paypal.enabled) return { error: "PayPal no está configurado todavía." };
    const totalCents = slotPurchaseTotalCents(quantity, "USD");
    try {
      const order = await createPayPalClient(cfg).createOrder({ usdCents: totalCents, purchaseId: id, description: `Rutinia: ${quantity} cupo(s) adicional(es) de alumnos`, returnUrl: `${cfg.baseUrl}/billing/paypal/return`, cancelUrl: `${cfg.baseUrl}/trainer/billing?pago=cancelado` });
      const { error } = await admin.from("slot_purchases").insert({ id, trainer_id: user.id, provider: "paypal", provider_reference: order.id, quantity, unit_price_cents: slotUnitCents(quantity, "USD"), total_cents: totalCents, currency: "USD", charged_amount_cents: totalCents, charged_currency: "USD", status: "pending" });
      if (error) return { error: "No se pudo iniciar el pago." };
      target = order.approveUrl;
    } catch (e) { return { error: e instanceof PayPalError ? "PayPal rechazó la solicitud." : "No se pudo contactar a PayPal." }; }
  }
  redirect(target);
}

const aiSchema = z.object({
  pack: z.enum(AI_PACK_IDS as [keyof typeof AI_PACKS, ...(keyof typeof AI_PACKS)[]], { error: "Elige un paquete" }),
  provider: z.enum(["paypal", "bold"]),
  confirm: z.literal("on", { error: "Debes confirmar la compra" }),
});

/** One-time, prepaid pack of AI draft credits. Credits are granted only when the server verifies the payment with the provider. */
export async function startAiCreditsCheckout(_: State, fd: FormData): Promise<State> {
  const p = aiSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const { supabase, user } = await trainerContext();
  const { data: allowed } = await supabase.rpc("trainer_has_access", { t: user.id });
  if (!allowed) return { error: "Tu espacio de trabajo no está activo. Suscríbete primero." };
  const cfg = getBillingConfig(); const admin = createAdminClient();
  const { pack, provider } = p.data; const def = AI_PACKS[pack];
  const id = randomUUID();
  let target: string;
  const row = { id, trainer_id: user.id, pack, credits: def.credits, status: "pending" as const };

  if (provider === "bold") {
    if (!cfg.bold.enabled) return { error: "Bold no está configurado todavía." };
    const cop = aiPackTotalCents(pack, "COP"); const reference = `AC-${id}`;
    const { error } = await admin.from("ai_credit_purchases").insert({ ...row, total_cents: cop, currency: "COP", provider: "bold", provider_reference: reference, charged_amount_cents: cop, charged_currency: "COP" });
    if (error) return { error: "No se pudo iniciar el pago." };
    return boldCheckout(cfg, { orderId: reference, amountCents: cop, description: `Rutinia: paquete de ${def.credits} borradores con IA`, email: user.email });
  } else {
    if (!cfg.paypal.enabled) return { error: "PayPal no está configurado todavía." };
    const totalCents = aiPackTotalCents(pack, "USD");
    try {
      const order = await createPayPalClient(cfg).createOrder({ usdCents: totalCents, purchaseId: id, description: `Rutinia: paquete de ${def.credits} borradores con IA`, returnUrl: `${cfg.baseUrl}/billing/paypal/return`, cancelUrl: `${cfg.baseUrl}/trainer/billing?pago=cancelado` });
      const { error } = await admin.from("ai_credit_purchases").insert({ ...row, total_cents: totalCents, currency: "USD", provider: "paypal", provider_reference: order.id, charged_amount_cents: totalCents, charged_currency: "USD" });
      if (error) return { error: "No se pudo iniciar el pago." };
      target = order.approveUrl;
    } catch (e) { return { error: e instanceof PayPalError ? "PayPal rechazó la solicitud." : "No se pudo contactar a PayPal." }; }
  }
  redirect(target);
}

const subSchema = z.object({ provider: z.enum(["paypal", "bold"]), confirm: z.literal("on", { error: "Debes aceptar las condiciones de cobro" }) });

export async function startSubscription(_: State, fd: FormData): Promise<State> {
  const p = subSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const { user } = await trainerContext();
  const cfg = getBillingConfig(); const admin = createAdminClient();
  let target: string;
  if (p.data.provider === "bold") {
    if (!cfg.bold.enabled) return { error: "Bold no está configurado todavía." };
    const cop = BASE_PRICE_COP_CENTS; const reference = `SUB-${randomUUID()}`;
    const { error } = await admin.from("subscription_payments").insert({ trainer_id: user.id, provider: "bold", provider_reference: reference, amount_usd_cents: null, charged_amount_cents: cop, charged_currency: "COP", status: "pending" });
    if (error) return { error: "No se pudo iniciar el pago." };
    return boldCheckout(cfg, { orderId: reference, amountCents: cop, description: "Rutinia: suscripción mensual (1 mes)", email: user.email });
  } else {
    if (!cfg.paypal.enabled || !cfg.paypal.planId) return { error: "La suscripción de PayPal no está configurada todavía (falta PAYPAL_PLAN_ID)." };
    try {
      const s = await createPayPalClient(cfg).createSubscription({ planId: cfg.paypal.planId, trainerId: user.id, returnUrl: `${cfg.baseUrl}/billing/paypal/return`, cancelUrl: `${cfg.baseUrl}/trainer/billing?pago=cancelado` });
      await admin.rpc("apply_provider_subscription_state", { p_trainer: user.id, p_provider: "paypal", p_provider_sub_id: s.id, p_state: "APPROVAL_PENDING", p_failed_count: 0 });
      target = s.approveUrl;
    } catch { return { error: "No se pudo contactar a PayPal." }; }
  }
  redirect(target);
}

export async function cancelSubscription(prev?: State): Promise<State> {
  void prev;
  const { user } = await trainerContext(); const cfg = getBillingConfig(); const admin = createAdminClient();
  const { data: sub } = await admin.from("trainer_subscriptions").select("provider,provider_subscription_id,status").eq("trainer_id", user.id).single();
  if (sub?.provider !== "paypal" || !sub.provider_subscription_id) return { ok: "Con Bold no hay cobro automático: simplemente no renueves. Conservas el acceso hasta el fin del periodo pagado." };
  try {
    const pp = createPayPalClient(cfg);
    await pp.cancelSubscription(sub.provider_subscription_id, "Cancelado por el entrenador");
    await admin.rpc("apply_provider_subscription_state", { p_trainer: user.id, p_provider: "paypal", p_provider_sub_id: sub.provider_subscription_id, p_state: "CANCELLED", p_failed_count: 0 });
  } catch { return { error: "No se pudo cancelar en PayPal. Inténtalo de nuevo o cancélala desde tu cuenta de PayPal." }; }
  revalidatePath("/trainer/billing");
  return { ok: "Suscripción cancelada. Conservas el acceso hasta el fin del periodo ya pagado." };
}

export async function saveReferralReward(_: State, fd: FormData): Promise<State> {
  const reward = z.enum(["slots", "ai", "days"]).safeParse(fd.get("reward"));
  if (!reward.success) return { error: "Elige una recompensa." };
  let ctx; try { ctx = await trainerContext(); } catch { return { error: "No autorizado." }; }
  const { error } = await ctx.supabase.rpc("set_my_referral", { p_reward: reward.data });
  if (error) return { error: "No se pudo guardar. Inténtalo de nuevo." };
  revalidatePath("/trainer/billing");
  return { ok: `Listo. Cuando alguien que invites pague su primer mes recibirás ${REFERRAL_REWARDS[reward.data].short}.` };
}
export async function redeemReferral(_: State, fd: FormData): Promise<State> {
  const code = normalizeReferralCode(String(fd.get("code") ?? ""));
  if (!code) return { error: "Revisa el código: tiene 7 letras y números." };
  let ctx; try { ctx = await trainerContext(); } catch { return { error: "No autorizado." }; }
  const { data } = await ctx.supabase.rpc("redeem_referral_code", { p_code: code });
  if (!data) return { error: "No pudimos aplicar ese código. Solo funciona en tus primeros 3 días de prueba, antes de pagar y una sola vez." };
  revalidatePath("/trainer/billing");
  return { ok: "Código aplicado: tu prueba gratis pasó a 10 días." };
}
