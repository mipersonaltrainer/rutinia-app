"use client";
import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

// Pending hint for a navigation. A route-level `loading.tsx` was tried instead and measured WORSE: on a full page load it delayed the
// real content (Largest Contentful Paint 120 ms → 440 ms on data-heavy pages). This costs nothing on first load and gives the
// click immediate feedback only when the navigation is actually slow (the CSS waits ~120 ms before showing anything).
function Pending() {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={`link-hint ${pending ? "is-pending" : ""}`} />;
}

const ROOTS = ["/trainer", "/client", "/staff"];

/** `aria-current="page"` marks the section you are in (styled in globals.css); a root such as /trainer only matches itself. */
export function NavLink({ children, ...props }: ComponentProps<typeof Link>) {
  const pathname = usePathname(); const href = typeof props.href === "string" ? props.href : "";
  const active = !!href && (pathname === href || (!ROOTS.includes(href) && pathname.startsWith(`${href}/`)));
  return <Link {...props} aria-current={active ? "page" : undefined}>{children}<Pending /></Link>;
}
