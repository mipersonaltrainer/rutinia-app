"use client";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { TURNSTILE_SCRIPT } from "@/lib/auth/turnstile";

type Api = { render(el: HTMLElement, o: Record<string, unknown>): string; reset(id?: string): void; remove(id?: string): void };
declare global { interface Window { turnstile?: Api } }

/** Renders the Cloudflare challenge. Turnstile itself adds the hidden `cf-turnstile-response` field to the surrounding form; a token works once, so the widget is reset after each submit. */
export function Turnstile({ siteKey, nonce }: { siteKey: string; nonce?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | undefined>(undefined);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!ready || !box.current || widget.current || !window.turnstile) return;
    const api = window.turnstile; const form = box.current.closest("form");
    widget.current = api.render(box.current, { sitekey: siteKey, theme: "dark" });
    const onSubmit = () => setTimeout(() => api.reset(widget.current), 100);   // the form has already read the token by then
    form?.addEventListener("submit", onSubmit);
    return () => { form?.removeEventListener("submit", onSubmit); if (widget.current) api.remove(widget.current); widget.current = undefined; };
  }, [ready, siteKey]);
  return (<>
    <Script src={TURNSTILE_SCRIPT} strategy="afterInteractive" nonce={nonce} onReady={() => setReady(true)} />
    <div ref={box} className="flex min-h-[65px] justify-center" />
  </>);
}
