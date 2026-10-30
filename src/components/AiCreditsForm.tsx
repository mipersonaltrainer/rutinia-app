"use client";
import { useState } from "react";
import { ActionForm } from "./ActionForm";
import { startAiCreditsCheckout } from "@/app/trainer/billing/actions";
import { AI_PACKS, AI_PACK_IDS, FREE_MONTHLY_DRAFTS, currencyForProvider, formatMoney, type AiPackId } from "@/lib/billing/pricing";

export function AiCreditsForm({ providers, credits }: { providers: { paypal: boolean; bold: boolean }; credits: { free_left: number; paid_left: number } | null }) {
  const [pack, setPack] = useState<AiPackId>("p20");
  const [provider, setProvider] = useState<"paypal" | "bold">(providers.bold || !providers.paypal ? "bold" : "paypal");
  const cur = currencyForProvider(provider);
  const total = AI_PACKS[pack].cents[cur];
  return (
    <ActionForm action={startAiCreditsCheckout} submitLabel={provider === "bold" ? "Confirmar y pagar con Bold" : "Confirmar y pagar con PayPal"}>
      <h2 className="font-semibold">Borradores con IA</h2>
      <p className="text-sm text-[var(--muted)]">Cada borrador de dieta o de plan de entrenamiento usa un crédito. Tienes {FREE_MONTHLY_DRAFTS} gratis cada mes{credits ? <> y hoy te quedan <b>{credits.free_left}</b> gratis y <b>{credits.paid_left}</b> comprados</> : null}. Si un borrador falla o se descarta, el crédito se te devuelve. Pago único y prepagado: no se renueva ni caduca.</p>
      <fieldset className="text-sm"><legend>Paquete</legend>
        {AI_PACK_IDS.map((id) => <label key={id} className="mr-4 block sm:inline"><input type="radio" name="pack" value={id} checked={pack === id} onChange={() => setPack(id)} /> {AI_PACKS[id].label} — {formatMoney(AI_PACKS[id].cents[cur], cur)} ({formatMoney(Math.round(AI_PACKS[id].cents[cur] / AI_PACKS[id].credits), cur)} c/u)</label>)}
      </fieldset>
      <fieldset className="text-sm"><legend>Método de pago</legend>
        <label className="mr-4"><input type="radio" name="provider" value="bold" checked={provider === "bold"} onChange={() => setProvider("bold")} disabled={!providers.bold} /> Bold — pesos colombianos (COP){!providers.bold && " — no configurado"}</label>
        <label><input type="radio" name="provider" value="paypal" checked={provider === "paypal"} onChange={() => setProvider("paypal")} disabled={!providers.paypal} /> PayPal — dólares (USD), para pagar desde fuera de Colombia{!providers.paypal && " — no configurado"}</label></fieldset>
      <div className="rounded-lg border border-[var(--border)] p-3 text-sm">
        <dl>
          <div className="flex justify-between"><dt>Paquete</dt><dd>{AI_PACKS[pack].label}</dd></div>
          <div className="flex justify-between font-semibold text-[var(--accent)]"><dt>Total</dt><dd>{formatMoney(total, cur)}</dd></div>
        </dl>
        <p className="mt-2 text-xs text-[var(--muted)]">{cur === "COP" ? "Precio en pesos, sin conversión de moneda. " : ""}Antes de impuestos y comisiones del procesador. Los créditos se activan solo cuando el servidor verifica el pago con el proveedor.</p>
      </div>
      <label className="flex gap-2 text-sm"><input type="checkbox" name="confirm" /> Confirmo la compra de {AI_PACKS[pack].label} por {formatMoney(total, cur)} (pago único).</label>
    </ActionForm>
  );
}
