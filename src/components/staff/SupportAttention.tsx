"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const KEY = "rutinia-staff-sound";
const readOn = () => { try { return localStorage.getItem(KEY) !== "off"; } catch { return true; } };

/** A short two-tone chime. Browsers only allow sound after the person has interacted with the page; if not, it is silently skipped. */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!Ctx) return;
    const ctx = new Ctx(); const t = ctx.currentTime;
    [[880, 0], [1175, 0.16]].forEach(([f, d]) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f; o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.18, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.3); o.start(t + d); o.stop(t + d + 0.32); });
    setTimeout(() => void ctx.close(), 800);
  } catch { /* no sound is fine */ }
}

/** With the panel open in any tab: «(2) …» in the tab title while conversations wait for an answer, and a chime when a new one arrives. */
export function SupportAttention({ waiting }: { waiting: number }) {
  const pathname = usePathname();
  const prev = useRef<number | null>(null);
  useEffect(() => {
    const apply = () => {
      const base = document.title.replace(/^\(\d+\)\s+/, "");
      const want = waiting > 0 ? `(${waiting}) ${base}` : base;
      if (document.title !== want) document.title = want;
    };
    apply();
    // Next replaces the <title> element itself on navigation, so watch the whole <head>; apply() is a no-op once the title is right, so it cannot loop.
    const mo = new MutationObserver(apply); mo.observe(document.head, { childList: true, characterData: true, subtree: true });
    return () => mo.disconnect();
  }, [waiting, pathname]);
  useEffect(() => {
    if (prev.current !== null && waiting > prev.current && readOn()) chime();
    prev.current = waiting;
  }, [waiting]);
  return null;
}

/** Switch for the chime (remembered in this browser only). */
export function SoundToggle() {
  const [on, setOn] = useState(true);
  useEffect(() => { const t = setTimeout(() => setOn(readOn()), 0); return () => clearTimeout(t); }, []);
  const flip = () => { const next = !on; setOn(next); try { localStorage.setItem(KEY, next ? "on" : "off"); } catch { /* ignore */ } if (next) chime(); };
  return <button type="button" onClick={flip} aria-pressed={on} className="btn btn-secondary">{on ? "Sonido de aviso: activado" : "Sonido de aviso: desactivado"}</button>;
}
