// Pure helpers for scripts/ops/backup.mjs (kept separate so they can be unit-tested without a database).

/** Folder name for a run, local time, sortable: 20261029-0815. */
export function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** Which backup folders to delete: everything beyond the newest `keep`, considering ONLY names this script creates. Never touches anything else. */
export function toPrune(entries, keep) {
  const mine = entries.filter((n) => /^\d{8}-\d{4}$/.test(n)).sort();
  return keep >= 1 && mine.length > keep ? mine.slice(0, mine.length - keep) : [];
}

/** A dump is only believable if it is big enough and has the shape of a Postgres dump with tables in it. */
export function dumpLooksValid(text, { minTables = 10 } = {}) {
  const tables = (text.match(/CREATE TABLE /g) ?? []).length;
  return { ok: text.length > 10_000 && /PostgreSQL database dump|CREATE TABLE/.test(text) && tables >= minTables, tables };
}
