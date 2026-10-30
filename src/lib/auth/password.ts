// Password policy applied by the app on sign-up, reset, change and invitation acceptance. Supabase enforces its own minimum
// as well (set it to the same value in the dashboard: docs/DEPLOY.md). Login does NOT apply this policy, so accounts created
// under an older, weaker rule can still sign in and are asked to change it.
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 72;                        // bcrypt ignores everything after 72 bytes: refuse instead of silently truncating

// A short list of the passwords people actually choose; length + character mix already block most of them.
const COMMON = new Set(["password12", "contraseña1", "contrasena1", "1234567890", "qwerty1234", "qwertyuiop1", "abc1234567", "password123", "contrasena123", "contraseña123", "iloveyou123", "colombia123", "entrenador1", "trainingos1", "0123456789", "123456789a", "a123456789", "admin12345", "welcome123", "bienvenido1"]);

export type PasswordCheck = { ok: true } | { ok: false; error: string };

export function checkPassword(password: string, ctx: { email?: string; fullName?: string } = {}): PasswordCheck {
  if (typeof password !== "string") return { ok: false, error: "Contraseña inválida." };
  if (password.length < PASSWORD_MIN) return { ok: false, error: `Usa al menos ${PASSWORD_MIN} caracteres.` };
  if (new TextEncoder().encode(password).length > PASSWORD_MAX) return { ok: false, error: `Máximo ${PASSWORD_MAX} caracteres.` };
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) return { ok: false, error: "Combina letras y números." };
  if (/^(.)\1+$/.test(password)) return { ok: false, error: "Esa contraseña es demasiado simple." };
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return { ok: false, error: "Esa contraseña es demasiado común." };
  const local = (ctx.email ?? "").split("@")[0].toLowerCase();
  if (local.length >= 4 && lower.includes(local)) return { ok: false, error: "No incluyas tu correo en la contraseña." };
  const first = (ctx.fullName ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (first.length >= 4 && lower.includes(first)) return { ok: false, error: "No incluyas tu nombre en la contraseña." };
  return { ok: true };
}
