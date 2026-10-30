/** Private photos use short-lived signed URLs, so they must not go through the Next image optimizer/cache. */
export function PrivateImg({ src, alt, className = "" }: { src?: string | null; alt: string; className?: string }) {
  if (!src) return <div className={`grid aspect-[3/4] w-full place-items-center rounded-lg bg-[var(--bg)] text-xs text-[var(--muted)] ${className}`}>No disponible</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" className={`aspect-[3/4] w-full rounded-lg object-cover ${className}`} />;
}
