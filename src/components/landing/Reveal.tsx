// Server component: marks an element to fade in when it scrolls into view. The behaviour lives in ONE client component
// (RevealObserver, mounted once on the page) instead of one client boundary and one IntersectionObserver per element.
export function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return <div className={`reveal ${className}`} style={{ ["--d" as string]: `${delay}ms` }}>{children}</div>;
}

/**
 * Above-the-fold entrance. Pure CSS (no JavaScript, no hydration needed), so the headline is visible as soon as it is painted:
 * hiding the hero until hydration finished delayed the Largest Contentful Paint by over a second on a mid-range phone.
 */
export function Rise({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return <div className={`hero-in ${className}`} style={{ ["--d" as string]: `${delay}ms` }}>{children}</div>;
}
