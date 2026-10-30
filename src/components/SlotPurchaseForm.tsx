"use client";
import { useState } from "react";
import { ActionForm, fieldCls } from "./ActionForm";
import { startSlotCheckout } from "@/app/trainer/billing/actions";
import { MAX_SLOTS_PER_PURCHASE, currencyForProvider, formatMoney, slotPurchaseTotalCents, slotUnitCents } from "@/lib/billing/pricing";

export function SlotPurchaseForm({ providers, capacity }: { providers: { paypal: boolean; bold: boolean }; capacity: { total: number; active: number } }) {
  const [qty, setQty] = useState(5);
  const [provider, setProvider] = useState<"paypal" | "bold">(providers.bold || !providers.paypal ? "bold" : "paypal");
  const cur = currencyForProvider(provider);
  const total = slotPurchaseTotalCents(qty, cur);
  const label = (n: number) => `${n} cupo${n > 1 ? "s" : ""} — ${formatMoney(slotPurchaseTotalCents(n, cur), cur)} (${formatMoney(slotUnitCents(n, cur), cur)} c/u)`;
  return (
    <ActionForm action={startSlotCheckout} submitLabel={provider === "bold" ? "Confirmar y pagar con Bold" : "Confirmar y pagar con PayPal"}>
      <h2 className="font-semibold">Comprar cupos adicionales de alumnos</h2>
      <p className="text-sm text-[var(--muted)]">Pago único, prepagado y separado de tu suscripción mensual. No se renueva. Capacidad actual: {capacity.total} ({capacity.active} en uso). En pesos, cuantos más cupos compras de una vez, menos cuesta cada uno.</p>
      <label className="block text-sm">Cantidad (1 a {MAX_SLOTS_PER_PURCHASE} por compra)
        <select name="quantity" value={qty} onChange={(e) => setQty(Number(e.target.value))} className={fieldCls}>{Array.from({ length: MAX_SLOTS_PER_PURCHASE }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{label(n)}</option>)}</select></label>
      <fieldset className="text-sm"><legend>Método de pago</legend>
        <label className="mr-4"><input type="radio" name="provider" value="bold" checked={provider === "bold"} onChange={() => setProvider("bold")} disabled={!providers.bold} /> Bold — pesos colombianos (COP){!providers.bold && " — no configurado"}</label>
        <label><input type="radio" name="provider" value="paypal" checked={provider === "paypal"} onChange={() => setProvider("paypal")} disabled={!providers.paypal} /> PayPal — dólares (USD), para pagar desde fuera de Colombia{!providers.paypal && " — no configurado"}</label></fieldset>
      <div className="rounded-lg border border-[var(--border)] p-3 text-sm">
        <dl>
          <div className="flex justify-between"><dt>Cantidad</dt><dd>{qty}</dd></div>
          <div className="flex justify-between"><dt>Precio por cupo</dt><dd>{formatMoney(slotUnitCents(qty, cur), cur)}</dd></div>
          <div className="flex justify-between font-semibold text-[var(--accent)]"><dt>Total</dt><dd>{formatMoney(total, cur)}</dd></div>
        </dl>
        <p className="mt-2 text-xs text-[var(--muted)]">{cur === "COP" ? "Precio en pesos, sin conversión de moneda. " : ""}Antes de impuestos y comisiones del procesador. Los cupos se activan solo cuando el servidor verifica el pago con el proveedor.</p>
      </div>
      <label className="flex gap-2 text-sm"><input type="checkbox" name="confirm" /> Confirmo la compra de {qty} cupo{qty > 1 ? "s" : ""} por {formatMoney(total, cur)} (pago único).</label>
    </ActionForm>
  );
}
