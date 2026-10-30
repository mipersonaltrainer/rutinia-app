import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/landing/Logo";

// Deterministic "equalizer" heights: server-rendered, so no random value can differ between server and browser.
const BARS = Array.from({ length: 32 }, (_, i) => ({ i, h: 22 + ((i * 37 + 11) % 61) }));

/**
 * Animated backdrop for the signed-out screens: drifting light, a moving grid, a rising progress curve and pulsing bars.
 * Pure CSS (no JavaScript, no images), decorative only, and static under prefers-reduced-motion (see globals.css).
 */
export function AuthBackdrop() {
  return (
    <div aria-hidden className="auth-bg">
      <span className="auth-blob auth-blob-a" /><span className="auth-blob auth-blob-b" /><span className="auth-blob auth-blob-c" />
      <span className="auth-grid" />
      <span className="auth-spot" />
      <svg className="auth-curve" viewBox="0 0 1200 300" preserveAspectRatio="none">
        <defs><linearGradient id="auth-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#8cff2e" stopOpacity=".22" /><stop offset="1" stopColor="#8cff2e" stopOpacity="0" /></linearGradient></defs>
        <path className="auth-curve-fill" d="M0 270 C150 262 220 215 330 222 S520 140 640 156 S860 84 1000 100 S1140 44 1200 30 L1200 300 L0 300Z" fill="url(#auth-fill)" />
        <path className="auth-curve-line" pathLength={1} d="M0 270 C150 262 220 215 330 222 S520 140 640 156 S860 84 1000 100 S1140 44 1200 30" fill="none" stroke="#8cff2e" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="auth-bars">{BARS.map((b) => <span key={b.i} style={{ ["--i" as string]: b.i, ["--h" as string]: `${b.h}%` }} />)}</div>
    </div>
  );
}

/** Backdrop + a top bar with the way back to the public landing page. Wraps every signed-out screen (login, signup, recovery, invitation). */
export function AuthChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh">
      <AuthBackdrop />
      <header className="relative z-20 mx-auto flex min-h-[72px] w-full max-w-[1108px] items-center justify-between px-5 pt-[env(safe-area-inset-top)]">
        <Link href="/" aria-label="Rutinia, ir a la página de inicio"><Logo /></Link>
        <Link href="/" className="btn btn-secondary"><ArrowLeft size={16} aria-hidden /> Volver al inicio</Link>
      </header>
      <div className="relative z-10">{children}</div>
    </div>
  );
}
