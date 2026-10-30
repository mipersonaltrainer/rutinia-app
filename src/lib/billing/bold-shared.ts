// What the browser needs from Bold. Kept apart from providers/bold.ts, which imports node:crypto: pulling that into a client component
// would ship a crypto polyfill (~100 KB) to every page that renders a form.
export const BOLD_SCRIPT_URL = "https://checkout.bold.co/library/boldPaymentButton.js";

/** Everything the embedded checkout button needs; the secret never leaves the server, only the signature does. */
export interface BoldButtonParams { apiKey: string; orderId: string; amount: number; currency: "COP"; integritySignature: string; redirectionUrl: string; originUrl: string; description: string; customerData?: string }
