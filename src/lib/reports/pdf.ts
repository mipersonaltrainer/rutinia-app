import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { ReportData } from "./data";

const A4: [number, number] = [595.28, 841.89];
const M = 48, W = A4[0] - M * 2;
const GREEN = rgb(0.18, 0.55, 0), INK = rgb(0.08, 0.08, 0.08), MUTED = rgb(0.4, 0.4, 0.4), LINE = rgb(0.85, 0.85, 0.85), WARN = rgb(0.7, 0.23, 0.07);

/** Standard PDF fonts only cover WinAnsi: keep Latin-1 (Spanish accents, ñ, ×) and map the usual typographic characters; never throw on user text. */
export function pdfSafe(s: string): string {
  return s.replace(/[–—−]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, "...").replace(/→/g, "->").replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/\r/g, "")
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, "?");
}
const fmtDate = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-"); return `${d}/${m}/${y}`; };

class Doc {
  pdf!: PDFDocument; page!: PDFPage; y = 0; regular!: PDFFont; bold!: PDFFont; pages: PDFPage[] = [];
  static async create(title: string) {
    const d = new Doc(); d.pdf = await PDFDocument.create(); d.regular = await d.pdf.embedFont(StandardFonts.Helvetica); d.bold = await d.pdf.embedFont(StandardFonts.HelveticaBold);
    d.pdf.setTitle(pdfSafe(title)); d.pdf.setAuthor("Rutinia"); d.pdf.setProducer("Rutinia"); d.pdf.setCreator("Rutinia"); d.pdf.setCreationDate(new Date());
    d.addPage(); return d;
  }
  addPage() { this.page = this.pdf.addPage(A4); this.pages.push(this.page); this.y = A4[1] - M; }
  ensure(h: number) { if (this.y - h < M + 24) this.addPage(); }
  wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const out: string[] = [];
    for (const para of pdfSafe(text).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        let w = word;
        while (w.length > 1 && font.widthOfTextAtSize(w, size) > width) {
          let lo = 1, hi = w.length - 1;                       // binary search for the longest prefix that fits
          while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (font.widthOfTextAtSize(w.slice(0, mid), size) <= width) lo = mid; else hi = mid - 1; }
          if (line) { out.push(line); line = ""; } out.push(w.slice(0, lo)); w = w.slice(lo);
        }
        const t = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(t, size) <= width) line = t; else { out.push(line); line = w; }
      }
      out.push(line);
    }
    return out;
  }
  text(t: string, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; width?: number; gap?: number } = {}) {
    const size = o.size ?? 10, font = o.bold ? this.bold : this.regular, width = o.width ?? W - ((o.x ?? M) - M);
    for (const l of this.wrap(t, font, size, width)) { this.ensure(size + 4); this.page.drawText(l, { x: o.x ?? M, y: this.y - size, size, font, color: o.color ?? INK }); this.y -= size * 1.35; }
    this.y -= o.gap ?? 2;
  }
  h(t: string) { this.ensure(40); this.y -= 8; this.page.drawText(pdfSafe(t), { x: M, y: this.y - 13, size: 13, font: this.bold, color: INK }); this.y -= 18; this.page.drawLine({ start: { x: M, y: this.y }, end: { x: M + W, y: this.y }, thickness: 0.8, color: GREEN }); this.y -= 8; }
  bullets(items: string[], o: { color?: ReturnType<typeof rgb> } = {}) { for (const i of items) { const lines = this.wrap(i, this.regular, 10, W - 14); this.ensure(lines.length * 14 + 2); this.page.drawText("-", { x: M + 2, y: this.y - 10, size: 10, font: this.regular, color: o.color ?? INK }); this.text(i, { x: M + 14, color: o.color, gap: 1 }); } }
  table(head: string[], rows: string[][], widths: number[]) {
    const total = widths.reduce((a, b) => a + b, 0); const sc = W / total; const cols = widths.map((w) => w * sc);
    const draw = (cells: string[], bold: boolean) => {
      const lines = cells.map((c, i) => this.wrap(c, bold ? this.bold : this.regular, 9, cols[i] - 6)); const h = Math.max(...lines.map((l) => l.length)) * 12 + 6;
      this.ensure(h); let x = M; lines.forEach((ls, i) => { ls.forEach((l, k) => this.page.drawText(l, { x: x + 3, y: this.y - 11 - k * 12, size: 9, font: bold ? this.bold : this.regular, color: INK })); x += cols[i]; });
      this.y -= h; this.page.drawLine({ start: { x: M, y: this.y }, end: { x: M + W, y: this.y }, thickness: 0.4, color: LINE });
    };
    draw(head, true); rows.forEach((r) => draw(r, false)); this.y -= 6;
  }
  kpis(items: [string, string][]) {
    const w = (W - 12 * (items.length - 1)) / items.length; this.ensure(54);
    items.forEach(([label, value], i) => { const x = M + i * (w + 12); this.page.drawRectangle({ x, y: this.y - 46, width: w, height: 46, borderColor: LINE, borderWidth: 0.8, color: rgb(0.97, 0.99, 0.95) }); this.page.drawText(pdfSafe(value), { x: x + 8, y: this.y - 24, size: 16, font: this.bold, color: GREEN }); this.page.drawText(pdfSafe(label), { x: x + 8, y: this.y - 39, size: 7.5, font: this.regular, color: MUTED }); });
    this.y -= 58;
  }
  chart(series: { date: string; kg: number }[]) {
    if (series.length < 2) return; const h = 110; this.ensure(h + 30);
    const top = this.y, bottom = this.y - h, left = M + 34, right = M + W; const ys = series.map((s) => s.kg); let mn = Math.min(...ys), mx = Math.max(...ys); if (mx - mn < 1) { mn -= 0.5; mx += 0.5; }
    this.page.drawRectangle({ x: left, y: bottom, width: right - left, height: h, borderColor: LINE, borderWidth: 0.6 });
    this.page.drawText(`${mx.toFixed(1)}`, { x: M, y: top - 8, size: 7, font: this.regular, color: MUTED }); this.page.drawText(`${mn.toFixed(1)}`, { x: M, y: bottom, size: 7, font: this.regular, color: MUTED });
    const px = (i: number) => left + 10 + ((right - left - 20) * i) / (series.length - 1), py = (v: number) => bottom + 8 + ((v - mn) / (mx - mn)) * (h - 16);
    for (let i = 0; i < series.length - 1; i++) this.page.drawLine({ start: { x: px(i), y: py(series[i].kg) }, end: { x: px(i + 1), y: py(series[i + 1].kg) }, thickness: 1.6, color: GREEN });
    series.forEach((s, i) => { this.page.drawCircle({ x: px(i), y: py(s.kg), size: 2.4, color: GREEN }); if (series.length <= 8) this.page.drawText(fmtDate(s.date).slice(0, 5), { x: px(i) - 9, y: bottom - 10, size: 6.5, font: this.regular, color: MUTED }); });
    this.y = bottom - 22;
  }
}

export async function renderReportPdf(d: ReportData): Promise<Uint8Array> {
  const doc = await Doc.create(`${d.title} - ${d.clientName}`);
  doc.page.drawText("Rutinia", { x: M, y: doc.y - 12, size: 11, font: doc.bold, color: GREEN }); doc.y -= 26;
  doc.text(d.title, { size: 22, bold: true, gap: 4 });
  doc.text(`Alumno: ${d.clientName}`, { size: 11, bold: true, gap: 0 });
  doc.text(`Periodo evaluado: ${fmtDate(d.period.from)} al ${fmtDate(d.period.to)}${d.trainerName ? `   |   Entrenador: ${d.trainerName}` : ""}`, { size: 10, color: MUTED, gap: 6 });

  doc.h("Objetivos iniciales");
  if (d.goals.length) doc.bullets(d.goals); else doc.text("Sin objetivos registrados en la evaluación inicial.", { color: MUTED });
  if (d.initialAssessmentDate) doc.text(`Evaluación inicial: ${fmtDate(d.initialAssessmentDate)}`, { size: 9, color: MUTED });

  doc.h("Resumen del periodo");
  doc.kpis([["Sesiones completadas", String(d.sessions.completed)], ["Adherencia", d.overallAdherencePct === null ? "—" : `${d.overallAdherencePct}%`], ["Series realizadas / planeadas", `${d.sessions.loggedSets}/${d.sessions.plannedSets}`], ["Esfuerzo medio de sesión", d.sessions.avgSessionRpe === null ? "—" : `${d.sessions.avgSessionRpe}/10`]]);
  if (d.sessions.abandoned) doc.text(`Sesiones abandonadas: ${d.sessions.abandoned}.`, { size: 9, color: MUTED });
  if (d.sessions.maxPain !== null && d.sessions.maxPain >= 4) doc.text(`Dolor máximo reportado en una sesión: ${d.sessions.maxPain}/10.`, { size: 9, color: WARN });
  if (d.adherence.length) { doc.text("Adherencia semanal (sesiones completadas / programadas)", { size: 9, bold: true }); doc.table(["Semana desde", "Completadas", "Programadas", "Adherencia"], d.adherence.map((w) => [fmtDate(w.weekStart), String(w.completed), String(w.scheduled), w.pct === null ? "—" : `${w.pct}%`]), [3, 2, 2, 2]); }

  doc.h("Evolución de medidas");
  const m = d.measurements;
  if (!m.first) doc.text("No hay medidas registradas en el periodo.", { color: MUTED });
  else {
    const keys: [string, string][] = [["weight_kg", "Peso (kg)"], ["waist_cm", "Cintura (cm)"], ["hip_cm", "Cadera (cm)"], ["neck_cm", "Cuello (cm)"], ["arm_cm", "Brazo (cm)"], ["thigh_cm", "Muslo (cm)"], ["calf_cm", "Pantorrilla (cm)"]];
    const val = (o: unknown, k: string) => { const v = (o as Record<string, number | null> | null)?.[k]; return v === null || v === undefined ? "—" : String(v); };
    const rows = keys.filter(([k]) => val(m.first, k) !== "—" || val(m.last, k) !== "—").map(([k, l]) => [l, val(m.first, k), m.last ? val(m.last, k) : "—", m.deltas[k] !== undefined ? `${m.deltas[k] > 0 ? "+" : ""}${m.deltas[k]}` : "—"]);
    doc.table(["Medida", `Primera (${fmtDate(m.first.measured_on)})`, m.last ? `Última (${fmtDate(m.last.measured_on)})` : "Última", "Cambio"], rows, [3, 3, 3, 2]);
    for (const w of m.warnings) doc.text(w, { size: 8.5, color: WARN });
    if (m.series.length >= 2) { doc.text("Peso a lo largo del periodo", { size: 9, bold: true }); doc.chart(m.series); }
  }
  if (d.indicators.length) { doc.text("Indicadores estimados con la última medición", { size: 9, bold: true }); doc.table(["Indicador", "Valor", "Fórmula"], d.indicators.map((i) => [i.label, i.value, i.formula]), [4, 2, 3]); }

  doc.h("Evolución del rendimiento");
  if (!d.performance.length) doc.text("Sin series registradas en el periodo.", { color: MUTED });
  else doc.table(["Ejercicio", "Sesiones", "Mejor serie (inicio)", "Mejor serie (fin)", "Cambio de carga", "Volumen (kg)"], d.performance.map((p) => [p.exercise, String(p.sessions), p.first, p.last, p.deltaLoad === null ? "—" : `${p.deltaLoad > 0 ? "+" : ""}${p.deltaLoad} kg`, String(p.volumeKg)]), [4, 1.6, 2.6, 2.6, 2.2, 1.8]);

  doc.h("Cambios del plan en el periodo");
  if (!d.planChanges.length) doc.text("Sin nuevas versiones publicadas en el periodo.", { color: MUTED });
  else doc.table(["Plan", "Versión", "Publicada", "Nota"], d.planChanges.map((v) => [v.plan_title, `v${v.version_no}`, fmtDate(v.published_at), v.change_note ?? "—"]), [3, 1, 2, 5]);

  doc.h("Observaciones del entrenador");
  if (d.observations?.trim()) doc.text(d.observations); else doc.text("Sin observaciones.", { color: MUTED });
  doc.h("Próximos objetivos");
  if (d.nextGoals?.trim()) doc.text(d.nextGoals); else doc.text("Sin objetivos definidos para el siguiente periodo.", { color: MUTED });

  doc.h("Notas importantes");
  doc.bullets(d.notes, { color: MUTED });

  const total = doc.pages.length;
  doc.pages.forEach((p, i) => p.drawText(pdfSafe(`Generado el ${fmtDate(d.generatedAt)} con datos registrados en Rutinia   |   Página ${i + 1} de ${total}`), { x: M, y: 26, size: 7.5, font: doc.regular, color: MUTED }));
  return doc.pdf.save();
}
