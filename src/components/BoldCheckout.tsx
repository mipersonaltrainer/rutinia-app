"use client";
import { useEffect, useRef } from "react";
import { BOLD_SCRIPT_URL, type BoldButtonParams } from "@/lib/billing/bold-shared";

/**
 * Bold's embedded checkout is driven by data-* attributes on a script tag. The button script goes in first and the library after it,
 * so the library finds the button when it runs. The attributes come from the server (signed there); the secret key never reaches the browser.
 */
export function BoldCheckout({ params }: { params: BoldButtonParams }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current; if (!el) return;
    el.replaceChildren();
    const btn = document.createElement("script");
    btn.setAttribute("data-bold-button", "dark-L");
    btn.setAttribute("data-render-mode", "embedded");
    btn.setAttribute("data-api-key", params.apiKey);
    btn.setAttribute("data-order-id", params.orderId);
    btn.setAttribute("data-amount", String(params.amount));
    btn.setAttribute("data-currency", params.currency);
    btn.setAttribute("data-integrity-signature", params.integritySignature);
    btn.setAttribute("data-redirection-url", params.redirectionUrl);
    btn.setAttribute("data-origin-url", params.originUrl);
    btn.setAttribute("data-description", params.description);
    if (params.customerData) btn.setAttribute("data-customer-data", params.customerData);
    el.appendChild(btn);
    const lib = document.createElement("script");
    lib.src = BOLD_SCRIPT_URL;
    lib.async = true;
    el.appendChild(lib);
    return () => el.replaceChildren();
  }, [params]);
  return (
    <div className="rounded-lg border border-[var(--accent)]/50 p-3 text-sm" role="status">
      <p className="mb-2">Tu pago está listo. Pulsa el botón de Bold para pagar; nada se activa hasta que el servidor verifique el pago con Bold.</p>
      <div ref={box} />
    </div>
  );
}
