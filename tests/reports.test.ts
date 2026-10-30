import { describe, it, expect } from "vitest";
import { inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { buildReportData, type ReportInput } from "@/lib/reports/data";
import { pdfSafe, renderReportPdf } from "@/lib/reports/pdf";
import { nextPhotoDue, processPhoto, sniffImage } from "@/lib/photos/validate";
import sharp from "sharp";

/** Extract all text drawn with standard fonts (hex strings in the inflated content streams). */
function pdfText(bytes: Uint8Array): string {
  const s = Buffer.from(bytes).toString("latin1"); const out: string[] = [];
  for (const m of s.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let body: Buffer; try { body = inflateSync(Buffer.from(m[1], "latin1")); } catch { body = Buffer.from(m[1], "latin1"); }
    for (const h of body.toString("latin1").matchAll(/<([0-9a-fA-F]+)>\s*Tj/g)) out.push(Buffer.from(h[1], "hex").toString("latin1"));
  }
  return out.join("\n");
}

const base = (o: Partial<ReportInput> = {}): ReportInput => ({
  clientName: "Ana Martínez", trainerName: "Carlos Ruiz", period: { from: "2026-09-21", to: "2026-10-18" }, generatedAt: new Date("2026-10-19T15:00:00Z"),
  goals: ["Hipertrofia", "Salud general"], initialAssessmentDate: "2026-09-15",
  measurements: [
    { measured_on: "2026-09-22", method: "tape", taken_by: "self", weight_kg: 82, waist_cm: 92, hip_cm: null, neck_cm: 38, arm_cm: null, thigh_cm: null, calf_cm: null },
    { measured_on: "2026-10-13", method: "tape", taken_by: "self", weight_kg: 80.5, waist_cm: 90, hip_cm: null, neck_cm: 38, arm_cm: null, thigh_cm: null, calf_cm: null },
  ],
  indicators: [{ measurement_date: "2026-10-13", indicator: "bmi", value: 24.7, unit: "kg/m²", formula: "kg / m²" }],
  logs: [
    { id: "l1", session_id: "s1", status: "completed", started_at: "2026-09-29T14:00:00Z", finished_at: "2026-09-29T15:00:00Z", session_rpe: 7, pain_level: 0, planned_sets: 4, logged_work_sets: 4 },
    { id: "l2", session_id: "s1", status: "completed", started_at: "2026-10-06T14:00:00Z", finished_at: "2026-10-06T15:00:00Z", session_rpe: 8, pain_level: 2, planned_sets: 4, logged_work_sets: 3 },
    { id: "l3", session_id: "s1", status: "abandoned", started_at: "2026-10-08T14:00:00Z", finished_at: "2026-10-08T14:10:00Z", session_rpe: null, pain_level: null, planned_sets: 4, logged_work_sets: 0 },
    { id: "lx", session_id: "s1", status: "completed", started_at: "2026-08-01T14:00:00Z", finished_at: "2026-08-01T15:00:00Z", session_rpe: 9, pain_level: 9, planned_sets: 4, logged_work_sets: 4 },   // outside the period
  ],
  sets: [
    ...[1, 2, 3, 4].map(() => ({ log_id: "l1", exercise_id: "e1", exercise_name: "Sentadilla goblet", kind: "work", reps: 10, load_kg: 20 })),
    ...[1, 2, 3].map(() => ({ log_id: "l2", exercise_id: "e1", exercise_name: "Sentadilla goblet", kind: "work", reps: 10, load_kg: 22.5 })),
    ...[1, 2, 3, 4].map(() => ({ log_id: "lx", exercise_id: "e1", exercise_name: "Sentadilla goblet", kind: "work", reps: 5, load_kg: 100 })),
  ],
  sessionsPerWeek: 2, planVersions: [{ plan_title: "Fullbody", version_no: 2, published_at: "2026-10-01T10:00:00Z", change_note: "Subo series" }, { plan_title: "Fullbody", version_no: 1, published_at: "2026-08-01T10:00:00Z", change_note: null }],
  observations: "Buena técnica. Reforzar descanso.", nextGoals: "Subir 5 kg en sentadilla.", ...o,
});

describe("report data comes only from recorded data", () => {
  it("summarises the period and ignores records outside it", () => {
    const d = buildReportData(base());
    expect(d.sessions).toMatchObject({ completed: 2, abandoned: 1, plannedSets: 8, loggedSets: 7, completionPct: 88, avgSessionRpe: 7.5, maxPain: 2 });
    expect(d.performance).toEqual([{ exercise: "Sentadilla goblet", sessions: 2, first: "10×20 kg", last: "10×22.5 kg", deltaLoad: 2.5, volumeKg: 4 * 200 + 3 * 225 }]);
    expect(d.planChanges.map((v) => v.version_no)).toEqual([2]);
  });
  it("measurement changes and the weight series are computed; comparison warnings are kept", () => {
    const d = buildReportData(base()); expect(d.measurements.deltas).toEqual({ weight_kg: -1.5, waist_cm: -2, neck_cm: 0 }); expect(d.measurements.series).toEqual([{ date: "2026-09-22", kg: 82 }, { date: "2026-10-13", kg: 80.5 }]);
    expect(d.measurements.warnings.join(" ")).toMatch(/grasa/); expect(d.indicators[0]).toMatchObject({ label: "IMC", value: "24.7 kg/m²" });
  });
  it("adherence is per Colombian week and capped", () => {
    const d = buildReportData(base()); expect(d.adherence.length).toBeGreaterThanOrEqual(4); expect(d.adherence.every((w) => w.pct === null || w.pct <= 100)).toBe(true); expect(d.overallAdherencePct).not.toBeNull();
    expect(buildReportData(base({ sessionsPerWeek: 0 })).overallAdherencePct).toBeNull();
  });
  it("missing data is reported as missing, never invented", () => {
    const d = buildReportData(base({ measurements: [], logs: [], sets: [], indicators: [], planVersions: [], goals: [] }));
    expect(d.sessions).toMatchObject({ completed: 0, plannedSets: 0, completionPct: 0, avgSessionRpe: null, maxPain: null }); expect(d.measurements.first).toBeNull(); expect(d.performance).toEqual([]);
    expect(d.notes.join(" ")).toMatch(/No hay medidas/); expect(d.notes.join(" ")).toMatch(/No hay entrenamientos/);
    expect(buildReportData(base({ measurements: [base().measurements[0]] })).notes.join(" ")).toMatch(/Solo hay una medición/);
  });
});

describe("PDF rendering", () => {
  it("produces a valid multi-section PDF containing the real figures", async () => {
    const bytes = await renderReportPdf(buildReportData(base()));
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes); expect(doc.getPageCount()).toBeGreaterThanOrEqual(1); expect(doc.getTitle()).toMatch(/Informe de progreso - Ana Martínez/);
    const t = pdfText(bytes);
    for (const must of ["Informe de progreso", "Ana Martínez", "21/09/2026 al 18/10/2026", "Hipertrofia", "Sentadilla goblet", "10×22.5 kg", "+2.5 kg", "Buena técnica. Reforzar descanso.", "Subir 5 kg en sentadilla.", "no constituye diagnóstico médico", "Página 1 de"]) expect(t).toContain(must);
    expect(t).not.toContain("100 kg");                // the out-of-period session must not leak
  });
  it("handles empty reports and hostile text without throwing", async () => {
    const empty = await renderReportPdf(buildReportData(base({ measurements: [], logs: [], sets: [], indicators: [], planVersions: [], observations: "x".repeat(6000) + " 🚀 日本語 → ≥", nextGoals: null })));
    expect((await PDFDocument.load(empty)).getPageCount()).toBeGreaterThan(1);    // long text paginates
    const t = pdfText(empty); expect(t).toContain("No hay medidas registradas"); expect(t).not.toContain("🚀");
  });
  it("pdfSafe keeps Spanish characters and maps typographic ones", () => {
    expect(pdfSafe("Peso: 82,5 kg – rodilla → ñandú “ok” … ≥ 10 ×")).toBe('Peso: 82,5 kg - rodilla -> ñandú "ok" ... >= 10 ×'); expect(pdfSafe("日本語🚀")).toBe("?????");
  });
});

describe("photo handling", () => {
  const png = () => sharp({ create: { width: 40, height: 30, channels: 3, background: "#336699" } }).png().toBuffer();
  it("sniffs by content, not by name or declared type", async () => {
    expect(sniffImage(await png())).toBe("image/png"); expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImage(Buffer.from("RIFFxxxxWEBPVP8 "))).toBe("image/webp"); expect(sniffImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull(); expect(sniffImage(Buffer.from("MZ\x90\x00"))).toBeNull(); expect(sniffImage(new Uint8Array())).toBeNull();
  });
  it("re-encodes to WebP, strips metadata (EXIF/GPS), bounds the size", async () => {
    const withExif = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#aa5500" } }).jpeg().withExif({ IFD0: { Copyright: "SECRET-OWNER", ImageDescription: "GPS 4.7110N 74.0721W" } }).toBuffer();
    expect(withExif.toString("latin1")).toContain("SECRET-OWNER");
    const r = await processPhoto(withExif); expect(r.ok).toBe(true);
    if (r.ok) { expect(r.contentType).toBe("image/webp"); expect(r.width).toBeLessThanOrEqual(1600); expect(r.data.toString("latin1")).not.toContain("SECRET-OWNER"); expect(r.data.toString("latin1")).not.toContain("GPS"); const meta = await sharp(r.data).metadata(); expect(meta.exif).toBeUndefined(); expect(meta.format).toBe("webp"); }
  });
  it("rejects empty, oversized, fake and corrupt files", async () => {
    expect((await processPhoto(new Uint8Array())).ok).toBe(false);
    expect((await processPhoto(Buffer.alloc(9 * 1024 * 1024, 1))).ok).toBe(false);
    expect((await processPhoto(Buffer.from("<script>alert(1)</script>"))).ok).toBe(false);
    const corrupt = Buffer.concat([(await png()).subarray(0, 40), Buffer.alloc(50, 7)]); expect((await processPhoto(corrupt)).ok).toBe(false);
  });
  it("computes the next photo date for every frequency", () => {
    expect(nextPhotoDue("biweekly", null, "2026-10-01", null)).toBe("2026-10-15"); expect(nextPhotoDue("four_weeks", null, "2026-10-01", "2026-10-10")).toBe("2026-11-07");
    expect(nextPhotoDue("six_weeks", null, "2026-10-01", null)).toBe("2026-11-12"); expect(nextPhotoDue("monthly", null, "2026-01-31", null)).toBe("2026-02-28"); expect(nextPhotoDue("monthly", null, "2026-10-15", null)).toBe("2026-11-15");
    expect(nextPhotoDue("custom", 10, "2026-10-01", null)).toBe("2026-10-11"); expect(() => nextPhotoDue("custom", 3, "2026-10-01", null)).toThrow(); expect(() => nextPhotoDue("custom", null, "2026-10-01", null)).toThrow();
  });
});
