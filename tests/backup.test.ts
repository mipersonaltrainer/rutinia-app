import { describe, it, expect } from "vitest";
import { dumpLooksValid, stamp, toPrune } from "../scripts/ops/backup-lib.mjs";

describe("backup helpers", () => {
  it("stamps sortable local folder names", () => { expect(stamp(new Date(2026, 9, 29, 8, 5))).toBe("20261029-0805"); });
  it("prunes only the oldest timestamped folders and never anything else", () => {
    const entries = ["20261001-0800", "20261002-0800", "20261003-0800", "backup.log", "mis-fotos", "20261004-0800"];
    expect(toPrune(entries, 2)).toEqual(["20261001-0800", "20261002-0800"]);
    expect(toPrune(entries, 10)).toEqual([]);
    expect(toPrune(entries, 0)).toEqual([]);                              // a bad --keep never deletes everything
    expect(toPrune(["backup.log", "otra-cosa"], 1)).toEqual([]);
  });
  it("accepts a real-looking dump and rejects empty, tiny or table-less ones", () => {
    const good = "-- PostgreSQL database dump\n" + "CREATE TABLE public.t (id int);\n".repeat(400);
    expect(dumpLooksValid(good, { minTables: 10 }).ok).toBe(true);
    expect(dumpLooksValid("").ok).toBe(false); expect(dumpLooksValid("CREATE TABLE a (x int);").ok).toBe(false);
    expect(dumpLooksValid("-- PostgreSQL database dump\n" + "x".repeat(20000)).ok).toBe(false);
  });
});
