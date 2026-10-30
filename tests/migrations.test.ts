import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const dir = path.resolve(import.meta.dirname, "../supabase/migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const sql = new Map(files.map((f) => [f, readFileSync(path.join(dir, f), "utf8")]));

describe("migration hygiene (static; the real application from zero is the CI job that boots a fresh Supabase)", () => {
  it("are numbered 0001… without gaps or duplicates", () => {
    expect(files.map((f) => Number(f.slice(0, 4)))).toEqual(files.map((_, i) => i + 1));
    expect(files.every((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))).toBe(true);
  });
  it("every table created from 0035 on turns RLS on in the same file", () => {
    for (const [f, text] of sql) {
      if (Number(f.slice(0, 4)) < 35) continue;
      for (const m of text.matchAll(/create table (?:if not exists )?(?:public\.)?([a-z_]+)/gi))
        expect(text, `${f}: ${m[1]} has no "alter table ${m[1]} enable row level security"`).toMatch(new RegExp(`alter table ${m[1]} enable row level security`, "i"));
    }
  });
  it("every SECURITY DEFINER function created from 0035 on pins its search_path", () => {
    for (const [f, text] of sql) {
      if (Number(f.slice(0, 4)) < 35) continue;
      for (const m of text.matchAll(/create (?:or replace )?function ([a-z_]+)\(([\s\S]*?)\$\$/gi)) {
        const head = m[0].split("$$")[0];
        if (/security definer/i.test(head)) expect(head, `${f}: ${m[1]} is SECURITY DEFINER without set search_path`).toMatch(/set search_path/i);
      }
    }
  });
  it("no migration hands privileges back to anon", () => {
    for (const [f, text] of sql) if (Number(f.slice(0, 4)) >= 38) expect(text, f).not.toMatch(/grant [^;]*\bto\b[^;]*\banon\b/i);
  });
});
