"use client";
import { useState } from "react";
import { ActionForm } from "./ActionForm";
import { startSubscription } from "@/app/trainer/billing/actions";
import { BASE_PRICE_CENTS, BASE_PRICE_COP_CENTS, INCLUDED_CLIENTS, formatMoney } from "@/lib/billing/pricing";

export function SubscriptionForm({ providers, planConfigured }: { providers: { paypal: boolean; bold: boolean }; planConfigured: boolean }) {
  const paypalOk = providers.paypal && planConfigured;
  const [provider, setProvider] = useState<"paypal" | "bold">(providers.bold || !paypalOk ? "bold" : "paypal");
  const cop = formatMoney(BASE_PRICE_COP_CENTS, "COP"); const usd = formatMoney(BASE_PRICE_CENTS, "USD");
  return (
    <ActionForm action={startSubscription} submitLabel={provider === "paypal" ? "Suscribirme con PayPal" : "Pagar 1 mes con Bold"}>
      <h2 className="font-semibold">Suscripción mensual: {cop} al mes</h2>
      <p className="text-sm text-[var(--muted)]">Incluye hasta {INCLUDED_CLIENTS} alumnos activos. El precio base no cambia al comprar cupos adicionales. Desde fuera de Colombia puedes pagar {usd} al mes con PayPal.</p>
      <fieldset className="text-sm"><legend>Método de pago</legend>
        <label className="mr-4 block sm:inline"><input type="radio" name="provider" value="bold" checked={provider === "bold"} onChange={() => setProvider("bold")} disabled={!providers.bold} /> Bold — pago de 1 mes en pesos (COP), renovación manual{!providers.bold && " — no configurado"}</label>
        <label className="block sm:inline"><input type="radio" name="provider" value="paypal" checked={provider === "paypal"} onChange={() => setProvider("paypal")} disabled={!paypalOk} /> PayPal — cobro mensual automático en dólares (USD){!paypalOk && " — no configurado"}</label></fieldset>
      <div className="rounded-lg border border-[var(--border)] p-3 text-sm">
        {provider === "paypal" ? <p>Se cobrarán <b>{usd}</b> cada mes en tu cuenta de PayPal hasta que canceles. Impuestos y comisiones aparte.</p>
          : <><p>Se cobrarán <b>{cop}</b> por 1 mes. No hay cobro automático: deberás pagar cada mes.</p><p className="mt-1 text-xs text-[var(--muted)]">Precio en pesos, sin conversión de moneda. Antes de impuestos y comisiones del procesador.</p></>}
      </div>
      <label className="flex gap-2 text-sm"><input type="checkbox" name="confirm" /> {provider === "paypal" ? `Autorizo el cobro recurrente mensual de ${usd} hasta que cancele.` : "Entiendo que este pago cubre 1 mes y que la renovación es manual."}</label>
    </ActionForm>
  );
}
