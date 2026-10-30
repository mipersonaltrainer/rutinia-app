"use client";
import { useEffect, useState } from "react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
const KEY = "rutinia-install-dismissed";
// The browser fires beforeinstallprompt once, early. Keep it at module level so any instance (the sidebar one, or the phone drawer that mounts later) can offer it.
let deferred: BIPEvent | null = null;
if (typeof window !== "undefined") window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as BIPEvent; });
const read = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };

/** Offers installation where the browser supports it; on iOS Safari (no install event) shows the manual steps. */
export function InstallPrompt() {
  const [ev, setEv] = useState<BIPEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
    const onBip = (e: Event) => { e.preventDefault(); deferred = e as BIPEvent; setEv(e as BIPEvent); };
    const onInstalled = () => setHidden(true);
    window.addEventListener("beforeinstallprompt", onBip); window.addEventListener("appinstalled", onInstalled);
    queueMicrotask(() => { setIos(isIos); setHidden(standalone || read()); if (deferred) setEv(deferred); });
    return () => { window.removeEventListener("beforeinstallprompt", onBip); window.removeEventListener("appinstalled", onInstalled); };
  }, []);
  if (hidden || (!ev && !ios)) return null;
  const dismiss = () => { try { localStorage.setItem(KEY, "1"); } catch {} setHidden(true); };
  return (
    <div className="mt-4 rounded-lg border border-[var(--border)] p-2 text-xs md:mt-6">
      {ev ? <button onClick={async () => { await ev.prompt(); const c = await ev.userChoice; if (c.outcome === "accepted") setHidden(true); setEv(null); }} className="font-semibold text-[var(--accent)]">Instalar la app</button>
          : <p>En iPhone: toca Compartir y luego «Añadir a pantalla de inicio».</p>}
      <button onClick={dismiss} className="ml-3 text-[var(--muted)]" aria-label="No mostrar de nuevo">Ahora no</button>
    </div>
  );
}
