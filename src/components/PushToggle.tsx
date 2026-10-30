"use client";
import { useEffect, useState } from "react";
import { removePushSubscription, savePushSubscription } from "@/app/trainer/account/actions";

const b64ToBytes = (s: string) => { const pad = "=".repeat((4 - (s.length % 4)) % 4); const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };

/** Turns web push on or off for this browser. Asking for permission happens only on the click, never on load. */
export function PushToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<"checking" | "unsupported" | "off" | "on" | "denied">("checking");
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  useEffect(() => {
    let alive = true;
    const set = (v: typeof state) => { if (alive) setState(v); };
    void (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return set("unsupported");
      if (Notification.permission === "denied") return set("denied");
      try { const r = await navigator.serviceWorker.getRegistration(); set((await r?.pushManager.getSubscription()) ? "on" : "off"); } catch { set("off"); }
    })();
    return () => { alive = false; };
  }, []);
  async function enable() {
    setBusy(true); setMsg("");
    try {
      const perm = await Notification.requestPermission(); if (perm !== "granted") { setState(perm === "denied" ? "denied" : "off"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
      const j = sub.toJSON(); const r = await savePushSubscription({ endpoint: j.endpoint ?? "", p256dh: j.keys?.p256dh ?? "", auth: j.keys?.auth ?? "" });
      if (r?.error) { await sub.unsubscribe(); setMsg(r.error); return; }
      setState("on"); setMsg("Listo: recibirás avisos en este dispositivo.");
    } catch { setMsg("No pudimos activar los avisos en este dispositivo."); } finally { setBusy(false); }
  }
  async function disable() {
    setBusy(true); setMsg("");
    try { const reg = await navigator.serviceWorker.getRegistration(); const sub = await reg?.pushManager.getSubscription(); if (sub) { await removePushSubscription(sub.endpoint); await sub.unsubscribe(); } setState("off"); setMsg("Avisos desactivados en este dispositivo."); }
    catch { setMsg("No pudimos desactivarlos. Inténtalo de nuevo."); } finally { setBusy(false); }
  }
  if (state === "checking") return null;
  if (state === "unsupported") return <p className="text-sm text-[var(--muted)]">Este navegador no admite avisos push. En el iPhone, instala Rutinia en la pantalla de inicio primero.</p>;
  if (state === "denied") return <p className="text-sm text-[var(--muted)]">Bloqueaste las notificaciones de este sitio en tu navegador. Puedes permitirlas desde los ajustes del sitio.</p>;
  return (
    <div className="space-y-2">
      {state === "on" ? <button type="button" disabled={busy} onClick={disable} className="btn btn-secondary">Desactivar avisos en este dispositivo</button> : <button type="button" disabled={busy} onClick={enable} className="btn btn-primary">Activar avisos en este dispositivo</button>}
      {msg && <p role="status" className="text-sm text-[var(--accent)]">{msg}</p>}
    </div>
  );
}
