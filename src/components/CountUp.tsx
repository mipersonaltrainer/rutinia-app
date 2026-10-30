"use client";
import { useEffect, useState } from "react";

/**
 * A number that counts up to its value when it appears. The server renders the final value (so the page is complete without
 * JavaScript, and under prefers-reduced-motion it simply stays there); only the browser, with motion allowed, runs the count.
 */
export function CountUp({ value, duration = 900, suffix = "" }: { value: number; duration?: number; suffix?: string }) {
  const [n, setN] = useState(value);
  useEffect(() => {
    if (value <= 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0; const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));      // ease-out cubic: fast at first, settles on the exact value
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <span className="tabular-nums">{n}{suffix}</span>;
}
