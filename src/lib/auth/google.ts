/** The Google button is shown only when the team has turned Google sign-in on (GOOGLE_SIGNIN=on) after enabling the provider in Supabase.
 * Without that, the button would lead to a raw error from Supabase, so it is simply not offered. */
export const googleEnabled = (env: Record<string, string | undefined> = process.env) => env.GOOGLE_SIGNIN?.trim() === "on";
