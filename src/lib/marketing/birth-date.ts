/** Plausible birth date for an adult: not in the future, at least 16 years ago (the database ignores anything else), not before 1900. */
export const validBirthDate = (s: string, today = new Date()) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const d = new Date(`${s}T00:00:00Z`); if (isNaN(+d) || d.toISOString().slice(0, 10) !== s) return false;
  const limit = new Date(Date.UTC(today.getUTCFullYear() - 16, today.getUTCMonth(), today.getUTCDate())); return d <= limit && d.getUTCFullYear() >= 1900;
};
