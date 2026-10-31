import { SITE_NAME, SUPPORT_EMAIL } from "./site";

// One place for what the three legal pages (/terminos, /privacidad, /cookies) must agree on: who we are, how to reach us, which version
// is in force. Change the version and the date here whenever any of the texts changes in substance.
export const LEGAL = {
  brand: SITE_NAME,
  email: SUPPORT_EMAIL,
  site: "www.rutinia.company",
  version: "1.0",
  updated: "30 de octubre de 2026",
} as const;

/** The legal documents, in the order they are linked from every legal page and the footer. */
export const LEGAL_DOCS = [
  { href: "/terminos", label: "Términos y condiciones" },
  { href: "/privacidad", label: "Política de privacidad y tratamiento de datos" },
  { href: "/cookies", label: "Política de cookies" },
] as const;
